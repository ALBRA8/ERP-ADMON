import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  getQuery,
  getQueryInt,
  withAuth,
  parseBody,
} from "@/lib/api";
import {
  calcularCUFE,
  generarUrlRepresentacionQR,
  generarXMLUBL,
} from "@/lib/dian";
import { enviarFacturaADian, loadDIANConfigFromDB } from "@/lib/dian-real";
import { round } from "@/lib/currency";

// ============================================================
// GET /api/facturas
// Lista facturas del tenant. Patrón A-CRIT-006: withAuth.
// ============================================================
export async function GET(req: NextRequest) {
  return withAuth(req, { permission: "facturas:read" }, async (session) => {
    try {
      const page = getQueryInt(req, "page", 1) ?? 1;
      const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
      const q = getQuery(req, "q");
      const estado = getQuery(req, "estado");

      const where: Prisma.FacturaVentaWhereInput = {
        empresaId: session.empresaId,
      };
      if (q) {
        where.OR = [
          { numero: { contains: q } },
          { nombreCliente: { contains: q } },
          { nitCliente: { contains: q } },
        ];
      }
      if (estado) where.estado = estado;

      const [items, total] = await Promise.all([
        db.facturaVenta.findMany({
          where,
          orderBy: { fecha: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { tercero: true },
        }),
        db.facturaVenta.count({ where }),
      ]);

      return ok({ items, total, page, pageSize });
    } catch (e) {
      return serverError("Error al listar facturas", e);
    }
  });
}

const itemSchema = z.object({
  productoId: z.string().nullish(),
  descripcion: z.string().max(500),
  cantidad: z.number().positive().max(1e9),
  unidadMedida: z.string().max(20).default("UND"),
  precioUnitario: z.number().nonnegative().max(1e12),
  descuentoPorcentaje: z.number().nonnegative().max(100).default(0),
  tarifaIva: z.number().nonnegative().max(100).default(19),
  bodegaId: z.string().nullish(),
});

const facturaSchema = z.object({
  terceroId: z.string().nullish(),
  nombreCliente: z.string().min(2).max(200),
  nitCliente: z.string().max(20),
  fechaVencimiento: z.string().optional(),
  items: z.array(itemSchema).min(1),
  esPOS: z.boolean().default(false),
  formaPago: z
    .enum(["efectivo", "tarjeta", "transferencia", "credito", "mixto"])
    .default("efectivo"),
  efectivoRecibido: z.number().nonnegative().optional(),
  observaciones: z.string().max(2000).nullish(),
});

// ============================================================
// POST /api/facturas
// Crea factura + detalles + salidas inventario + asiento contable +
// actualización cartera + consecutivo DIAN, todo en una sola
// `db.$transaction` (A-CRIT-001) para garantizar atomicidad.
// ============================================================
export async function POST(req: NextRequest) {
  return withAuth(req, { permission: "facturas:write" }, async (session) => {
    const parsed = await parseBody(req, facturaSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;

    try {
      // 0. Validar FK terceroId (A-CRIT-007 robustez)
      if (data.terceroId) {
        const cli = await db.tercero.findFirst({
          where: { id: data.terceroId, empresaId: session.empresaId },
          select: { id: true },
        });
        if (!cli) return badRequest("Tercero (cliente) no encontrado en su empresa");
      }

      // 1. Validaciones previas (lecturas fuera de la tx para no
      //    bloquear innecesariamente, pero son read-only).
      const resolucion = await db.resolucionDian.findFirst({
        where: {
          empresaId: session.empresaId,
          activa: true,
          tipoOperacion: data.esPOS ? "pos" : "estandar",
        },
        orderBy: { createdAt: "desc" },
      });
      if (!resolucion) {
        return badRequest(
          "No hay resolución DIAN activa para facturación " +
            (data.esPOS ? "POS" : "estándar"),
        );
      }
      if (resolucion.consecutivoSiguiente > resolucion.rangoFin) {
        return badRequest("Se agotó el rango de numeración DIAN");
      }

      const empresa = await db.empresa.findUnique({
        where: { id: session.empresaId },
      });
      if (!empresa) return badRequest("Empresa no encontrada");

      // 2. Calcular totales (pure JS, sin BD)
      let subtotalBruto = 0;
      let descuentoTotal = 0;
      let totalIva = 0;
      const totalImpoconsumo = 0;
      let costoTotal = 0;
      const detallesData: Array<{
        productoId?: string;
        descripcion: string;
        cantidad: number;
        unidadMedida: string;
        precioUnitario: number;
        descuentoPorcentaje: number;
        descuentoValor: number;
        subtotal: number;
        tarifaIva: number;
        iva: number;
        total: number;
        costoUnitario: number;
        bodegaId?: string;
      }> = [];

      // Pre-cargar productos en batch (A-MED-002 N+1 fix)
      const productosIds = data.items
        .map((i) => i.productoId)
        .filter((p): p is string => !!p);
      const productosMap = new Map<string, { costoPromedio: number }>();
      if (productosIds.length > 0) {
        const productos = await db.producto.findMany({
          where: { id: { in: productosIds }, empresaId: session.empresaId },
          select: { id: true, costoPromedio: true },
        });
        for (const p of productos) productosMap.set(p.id, p);
        // Validar que TODOS los productoIds existen y pertenecen al tenant
        if (productos.length !== productosIds.length) {
          const found = new Set(productos.map((p) => p.id));
          const missing = productosIds.filter((id) => !found.has(id));
          return badRequest(
            `productoId no encontrado en su empresa: ${missing.join(", ")}`,
          );
        }
      }

      for (const item of data.items) {
        const gross = round(item.cantidad * item.precioUnitario, 2);
        const descuento = round(gross * (item.descuentoPorcentaje / 100), 2);
        const subtotal = round(gross - descuento, 2);
        const iva = round(subtotal * (item.tarifaIva / 100), 2);
        const total = round(subtotal + iva, 2);

        let costoUnitario = 0;
        if (item.productoId) {
          const producto = productosMap.get(item.productoId);
          if (producto) {
            costoUnitario = Number(producto.costoPromedio);
            costoTotal += costoUnitario * item.cantidad;
          }
        }

        subtotalBruto += gross;
        descuentoTotal += descuento;
        totalIva += iva;
        detallesData.push({
          productoId: item.productoId,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidadMedida: item.unidadMedida,
          precioUnitario: item.precioUnitario,
          descuentoPorcentaje: item.descuentoPorcentaje,
          descuentoValor: descuento,
          subtotal,
          tarifaIva: item.tarifaIva,
          iva,
          total,
          costoUnitario,
          bodegaId: item.bodegaId,
        });
      }

      const subtotalNeto = round(subtotalBruto - descuentoTotal, 2);
      const total = round(subtotalNeto + totalIva + totalImpoconsumo, 2);

      // 3. Generar número y CUFE
      const consecutivo = resolucion.consecutivoSiguiente;
      const numero = `${resolucion.prefijo}-${String(consecutivo).padStart(6, "0")}`;
      const fecha = new Date();
      const fechaStr = fecha.toISOString().slice(0, 10);
      const horaStr = fecha.toISOString().slice(11, 19);

      const cufe = calcularCUFE({
        numFac: numero,
        fecFac: fechaStr,
        horFac: horaStr,
        valTotal: total,
        codDoc: "01",
        nitFac: empresa.nit,
        tipAdq: "1",
        ambiente: resolucion.ambiente,
      });
      const qrUrl = generarUrlRepresentacionQR({
        cufe,
        nit: empresa.nit,
        ambiente: resolucion.ambiente,
      });

      // 4. Saldo pendiente (cartera)
      const esCredito = data.formaPago === "credito";
      const saldoPendiente = esCredito ? total : 0;
      const fechaVencimiento = data.fechaVencimiento
        ? new Date(data.fechaVencimiento)
        : esCredito
          ? new Date(fecha.getTime() + 30 * 24 * 60 * 60 * 1000)
          : null;
      const cambio =
        data.formaPago === "efectivo" && data.efectivoRecibido
          ? round(data.efectivoRecibido - total, 2)
          : 0;

      // 5. XML UBL
      const xml = generarXMLUBL({
        numero,
        cufe,
        fecha: fechaStr,
        hora: horaStr,
        moneda: empresa.moneda,
        emisor: {
          nit: empresa.nit,
          razonSocial: empresa.razonSocial,
          nombreComercial: empresa.nombreComercial ?? undefined,
          direccion: empresa.direccion ?? undefined,
          ciudad: empresa.ciudad ?? undefined,
          telefono: empresa.telefono ?? undefined,
          responsableIVA: empresa.responsabilidad === "iva",
        },
        receptor: {
          tipoDocumento: "31",
          numeroDocumento: data.nitCliente,
          nombre: data.nombreCliente,
        },
        items: detallesData.map((d) => ({
          codigo: d.productoId ?? "SRV",
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          unidad: d.unidadMedida,
          precioUnitario: d.precioUnitario,
          descuento: d.descuentoValor,
          subtotal: d.subtotal,
          tarifaIva: d.tarifaIva,
          iva: d.iva,
          total: d.total,
        })),
        subtotalBruto,
        descuentoTotal,
        subtotalNeto,
        totalIva,
        totalImpoconsumo,
        totalReteFuente: 0,
        totalReteICA: 0,
        totalReteIva: 0,
        total,
        formaPago: esCredito ? "2" : "1",
        fechaVencimiento: fechaVencimiento?.toISOString().slice(0, 10),
      });

      // 6. TRANSACCIÓN: factura + detalles + salidas inventario +
      //    cartera + consecutivo DIAN + asiento contable. Si
      //    cualquier escritura falla, se revierten todas (A-CRIT-001).
      const factura = await db.$transaction(async (tx) => {
        const fac = await tx.facturaVenta.create({
          data: {
            empresaId: session.empresaId,
            numero,
            prefijo: resolucion.prefijo,
            consecutivoDIAN: consecutivo,
            terceroId: data.terceroId,
            nombreCliente: data.nombreCliente,
            nitCliente: data.nitCliente,
            fecha,
            fechaVencimiento,
            subtotalBruto,
            descuentoTotal,
            subtotalNeto,
            totalIva,
            totalImpoconsumo,
            total: total,
            cufe,
            qrCode: qrUrl,
            xmlUBL: xml,
            estadoDIAN: "procesado",
            esPOS: data.esPOS,
            formaPago: data.formaPago,
            efectivoRecibido: data.efectivoRecibido,
            cambio,
            saldoPendiente,
            estadoCartera: saldoPendiente > 0 ? "pendiente" : "pagada",
            observaciones: data.observaciones,
          },
        });

        // Detalles + salidas inventario
        for (const d of detallesData) {
          await tx.detalleFacturaVenta.create({
            data: {
              facturaId: fac.id,
              ...d,
            },
          });

          if (d.productoId && d.bodegaId) {
            await registrarSalidaInventarioTx(tx, {
              empresaId: session.empresaId,
              productoId: d.productoId,
              bodegaId: d.bodegaId,
              tipo: "salida",
              cantidad: d.cantidad,
              costoUnitario: d.costoUnitario,
              documentoTipo: "FACTURA_VENTA",
              documentoId: fac.id,
              fecha,
            });
          }
        }

        // Cartera del tercero
        if (data.terceroId && saldoPendiente > 0) {
          await tx.tercero.update({
            where: { id: data.terceroId },
            data: {
              saldoCartera: { increment: saldoPendiente },
            },
          });
        }

        // Avanzar consecutivo DIAN atómicamente
        await tx.resolucionDian.update({
          where: { id: resolucion.id },
          data: { consecutivoSiguiente: { increment: 1 } },
        });

        // Asiento contable de la venta (dentro de la tx)
        await generarAsientoVentaTx(tx, fac.id, session.empresaId);

        return fac;
      });

      // 7. Integración DIAN condicional (no bloquea si falla; la
      //    factura ya está creada con CUFE/QR/XML y asiento).
      try {
        const dianConfig = await loadDIANConfigFromDB(session.empresaId);
        if (dianConfig) {
          const envioRes = await enviarFacturaADian(
            factura.id,
            session.empresaId,
          );
          if (envioRes.ok) {
            const refreshed = await db.facturaVenta.findUnique({
              where: { id: factura.id },
            });
            if (refreshed) return ok(refreshed);
          } else if (envioRes.mensaje) {
            console.warn(
              "[facturas] DIAN envío falló (programado reintento):",
              envioRes.mensaje,
            );
          }
        }
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.error(
          "[facturas] Error en integración DIAN (no fatal):",
          err?.message ?? e,
        );
      }

      return ok(factura);
    } catch (e) {
      return serverError("Error al crear factura", e);
    }
  });
}

// ============================================================
// registrarSalidaInventarioTx
// Versión transaccional de `registrarMovimientoInventario` (A-CRIT-001
// + A-ALT-011) que recibe `tx` y usa `update({ data: { cantidad:
// { decrement: x } } })` atómico para evitar TOCTOU sobre SaldoInventario.
// ============================================================
async function registrarSalidaInventarioTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  input: {
    empresaId: string;
    productoId: string;
    bodegaId: string;
    tipo: "entrada" | "salida" | "traslado" | "ajuste";
    cantidad: number;
    costoUnitario: number;
    documentoTipo?: string;
    documentoId?: string;
    fecha: Date;
  },
): Promise<void> {
  const cantidad =
    input.tipo === "salida" ? -Math.abs(input.cantidad) : Math.abs(input.cantidad);
  const costoTotal = round(cantidad * input.costoUnitario, 2);

  await tx.movimientoInventario.create({
    data: {
      empresaId: input.empresaId,
      productoId: input.productoId,
      bodegaId: input.bodegaId,
      tipo: input.tipo,
      cantidad,
      costoUnitario: input.costoUnitario,
      costoTotal,
      documentoTipo: input.documentoTipo,
      documentoId: input.documentoId,
      fecha: input.fecha,
    },
  });

  // Upsert + update atómico: si el saldo no existe, se crea; si existe,
  // se decrementa atómicamente. Para salidas usamos `decrement` que es
  // atómico a nivel SQL.
  const saldoExistente = await tx.saldoInventario.findUnique({
    where: {
      productoId_bodegaId: {
        productoId: input.productoId,
        bodegaId: input.bodegaId,
      },
    },
  });

  if (saldoExistente) {
    const nuevaCantidad = Number(saldoExistente.cantidad) + cantidad;
    const nuevoCostoTotal = Math.max(
      0,
      round(nuevaCantidad * Number(saldoExistente.costoPromedio), 2),
    );
    await tx.saldoInventario.update({
      where: { id: saldoExistente.id },
      data: {
        cantidad: { increment: cantidad },
        costoTotal: nuevoCostoTotal,
      },
    });
  } else if (cantidad > 0) {
    // Solo se crea saldo nuevo si es entrada
    await tx.saldoInventario.create({
      data: {
        empresaId: input.empresaId,
        productoId: input.productoId,
        bodegaId: input.bodegaId,
        cantidad,
        costoTotal,
        costoPromedio: input.costoUnitario,
      },
    });
    await tx.producto.update({
      where: { id: input.productoId },
      data: {
        costoPromedio: input.costoUnitario,
        ultimoCosto: input.costoUnitario,
      },
    });
  }
}

// ============================================================
// generarAsientoVentaTx
// Asiento contable de venta: Cliente (130505) / IVA (240805) /
// Ingresos (413595) + costo de venta (613595 / 150505).
// Recibe `tx` para ejecutarse dentro de la transacción (A-CRIT-001).
// ============================================================
async function generarAsientoVentaTx(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  facturaId: string,
  empresaId: string,
): Promise<void> {
  const factura = await tx.facturaVenta.findUnique({
    where: { id: facturaId },
    include: { detalles: true },
  });
  if (!factura) return;

  const cnt = await tx.comprobante.count({ where: { empresaId } });
  const numero = `CG-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

  const cuentaCliente = await tx.cuentaPuc.findUnique({
    where: { codigo: "130505" },
  });
  const cuentaIva = await tx.cuentaPuc.findUnique({
    where: { codigo: "240805" },
  });
  const cuentaIngreso = await tx.cuentaPuc.findUnique({
    where: { codigo: "413595" },
  });
  const cuentaCosto = await tx.cuentaPuc.findUnique({
    where: { codigo: "613595" },
  });
  const cuentaInventario = await tx.cuentaPuc.findUnique({
    where: { codigo: "150505" },
  });

  if (!cuentaCliente || !cuentaIva || !cuentaIngreso) return;

  const total = Number(factura.total);
  const subtotalNeto = Number(factura.subtotalNeto);
  const totalIva = Number(factura.totalIva);

  const comprobante = await tx.comprobante.create({
    data: {
      empresaId,
      numero,
      tipo: "facturacion",
      fecha: factura.fecha,
      descripcion: `Factura de venta ${factura.numero}`,
      totalDebito: total,
      totalCredito: total,
      diferencia: 0,
      estado: "contabilizado",
      documentoOrigenId: factura.id,
      documentoOrigenTipo: "FACTURA_VENTA",
    },
  });

  // Movs para createMany — terceroId es `string | null` (no opcional)
  const movs: Array<{
    empresaId: string;
    comprobanteId: string;
    cuentaId: string;
    terceroId: string | null;
    descripcion: string;
    debito: number;
    credito: number;
    fecha: Date;
  }> = [];

  // Cliente debita (total)
  movs.push({
    empresaId,
    comprobanteId: comprobante.id,
    cuentaId: cuentaCliente.id,
    terceroId: factura.terceroId ?? null,
    descripcion: `Factura ${factura.numero}`,
    debito: total,
    credito: 0,
    fecha: factura.fecha,
  });
  // Ingreso acredita (subtotal neto)
  movs.push({
    empresaId,
    comprobanteId: comprobante.id,
    cuentaId: cuentaIngreso.id,
    terceroId: factura.terceroId ?? null,
    descripcion: `Ingreso por venta ${factura.numero}`,
    debito: 0,
    credito: subtotalNeto,
    fecha: factura.fecha,
  });
  // IVA acredita
  if (totalIva > 0) {
    movs.push({
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaIva.id,
      terceroId: factura.terceroId ?? null,
      descripcion: `IVA generado ${factura.numero}`,
      debito: 0,
      credito: totalIva,
      fecha: factura.fecha,
    });
  }

  // Costo de venta (si tiene productos)
  let costoTotalVenta = 0;
  for (const d of factura.detalles) {
    costoTotalVenta += Number(d.costoUnitario) * Number(d.cantidad);
  }
  if (costoTotalVenta > 0 && cuentaCosto && cuentaInventario) {
    const costo = round(costoTotalVenta, 2);
    movs.push({
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaCosto.id,
      descripcion: `Costo de mercancías ${factura.numero}`,
      debito: costo,
      credito: 0,
      fecha: factura.fecha,
    });
    movs.push({
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaInventario.id,
      descripcion: `Salida de inventario ${factura.numero}`,
      debito: 0,
      credito: costo,
      fecha: factura.fecha,
    });
  }

  if (movs.length > 0) {
    await tx.movimientoContable.createMany({ data: movs });
  }
}
