import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import {
  calcularCUFE,
  generarUrlRepresentacionQR,
  generarXMLUBL,
} from "@/lib/dian";
import { registrarMovimientoInventario } from "@/lib/inventario";
import { round } from "@/lib/currency";

// GET: lista facturas
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");
    const estado = getQuery(req, "estado");

    const where: any = { empresaId: session.empresaId };
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
}

const itemSchema = z.object({
  productoId: z.string().optional(),
  descripcion: z.string(),
  cantidad: z.number().positive(),
  unidadMedida: z.string().default("UND"),
  precioUnitario: z.number().nonnegative(),
  descuentoPorcentaje: z.number().default(0),
  tarifaIva: z.number().default(19),
  bodegaId: z.string().optional(),
});

const facturaSchema = z.object({
  terceroId: z.string().optional(),
  nombreCliente: z.string().min(2),
  nitCliente: z.string(),
  fechaVencimiento: z.string().optional(),
  items: z.array(itemSchema).min(1),
  esPOS: z.boolean().default(false),
  formaPago: z
    .enum(["efectivo", "tarjeta", "transferencia", "credito", "mixto"])
    .default("efectivo"),
  efectivoRecibido: z.number().optional(),
  observaciones: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const parsed = facturaSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    // 1. Resolución DIAN activa
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

    // 2. Calcular totales
    let subtotalBruto = 0;
    let descuentoTotal = 0;
    let totalIva = 0;
    let totalImpoconsumo = 0;
    let costoTotal = 0;
    const detallesData: any[] = [];

    for (const item of data.items) {
      const gross = round(item.cantidad * item.precioUnitario, 2);
      const descuento = round(gross * (item.descuentoPorcentaje / 100), 2);
      const subtotal = round(gross - descuento, 2);
      const iva = round(subtotal * (item.tarifaIva / 100), 2);
      const total = round(subtotal + iva, 2);

      let costoUnitario = 0;
      if (item.productoId) {
        const producto = await db.producto.findUnique({
          where: { id: item.productoId },
        });
        if (producto) {
          costoUnitario = producto.costoPromedio;
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

    // 3. Generar número y CUFE (mock)
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

    // 5. XML UBL (esqueleto)
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
        tipoDocumento: "31", // Por defecto NIT; en real sería lookup
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

    // 6. Persistir factura
    const factura = await db.facturaVenta.create({
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

    // 7. Crear detalles
    for (const d of detallesData) {
      await db.detalleFacturaVenta.create({
        data: {
          facturaId: factura.id,
          ...d,
        },
      });

      // 8. Salida de inventario si es producto
      if (d.productoId && d.bodegaId) {
        await registrarMovimientoInventario({
          empresaId: session.empresaId,
          productoId: d.productoId,
          bodegaId: d.bodegaId,
          tipo: "salida",
          cantidad: d.cantidad,
          costoUnitario: d.costoUnitario,
          documentoTipo: "FACTURA_VENTA",
          documentoId: factura.id,
          fecha,
        });
      }
    }

    // 9. Actualizar cartera del tercero
    if (data.terceroId && saldoPendiente > 0) {
      await db.tercero.update({
        where: { id: data.terceroId },
        data: {
          saldoCartera: { increment: saldoPendiente },
        },
      });
    }

    // 10. Avanzar consecutivo DIAN
    await db.resolucionDian.update({
      where: { id: resolucion.id },
      data: { consecutivoSiguiente: { increment: 1 } },
    });

    // 11. Asiento contable (causación de venta)
    await generarAsientoVenta(factura.id, session.empresaId);

    return ok(factura);
  } catch (e) {
    return serverError("Error al crear factura", e);
  }
}

// Genera el asiento contable de la venta: Cliente (130505) / IVA (240805) / Ingresos (413595)
async function generarAsientoVenta(facturaId: string, empresaId: string) {
  const factura = await db.facturaVenta.findUnique({
    where: { id: facturaId },
    include: { detalles: true },
  });
  if (!factura) return;

  const cnt = await db.comprobante.count({ where: { empresaId } });
  const numero = `CG-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

  const cuentaCliente = await db.cuentaPuc.findUnique({ where: { codigo: "130505" } });
  const cuentaIva = await db.cuentaPuc.findUnique({ where: { codigo: "240805" } });
  const cuentaIngreso = await db.cuentaPuc.findUnique({ where: { codigo: "413595" } });
  const cuentaCosto = await db.cuentaPuc.findUnique({ where: { codigo: "613595" } });
  const cuentaInventario = await db.cuentaPuc.findUnique({ where: { codigo: "150505" } });

  if (!cuentaCliente || !cuentaIva || !cuentaIngreso) return;

  const comprobante = await db.comprobante.create({
    data: {
      empresaId,
      numero,
      tipo: "facturacion",
      fecha: factura.fecha,
      descripcion: `Factura de venta ${factura.numero}`,
      totalDebito: factura.total,
      totalCredito: factura.total,
      diferencia: 0,
      estado: "contabilizado",
      documentoOrigenId: factura.id,
      documentoOrigenTipo: "FACTURA_VENTA",
    },
  });

  // Cliente debita (total)
  await db.movimientoContable.create({
    data: {
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaCliente.id,
      terceroId: factura.terceroId ?? null,
      descripcion: `Factura ${factura.numero}`,
      debito: factura.total,
      credito: 0,
      fecha: factura.fecha,
    },
  });
  // Ingreso acredita (subtotal neto)
  await db.movimientoContable.create({
    data: {
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaIngreso.id,
      terceroId: factura.terceroId ?? null,
      descripcion: `Ingreso por venta ${factura.numero}`,
      debito: 0,
      credito: factura.subtotalNeto,
      fecha: factura.fecha,
    },
  });
  // IVA acredita
  if (factura.totalIva > 0) {
    await db.movimientoContable.create({
      data: {
        empresaId,
        comprobanteId: comprobante.id,
        cuentaId: cuentaIva.id,
        terceroId: factura.terceroId ?? null,
        descripcion: `IVA generado ${factura.numero}`,
        debito: 0,
        credito: factura.totalIva,
        fecha: factura.fecha,
      },
    });
  }

  // Costo de venta (si tiene productos)
  let costoTotalVenta = 0;
  for (const d of factura.detalles) {
    costoTotalVenta += d.costoUnitario * d.cantidad;
  }
  if (costoTotalVenta > 0 && cuentaCosto && cuentaInventario) {
    // Costo de mercancías (debito)
    await db.movimientoContable.create({
      data: {
        empresaId,
        comprobanteId: comprobante.id,
        cuentaId: cuentaCosto.id,
        descripcion: `Costo de mercancías ${factura.numero}`,
        debito: round(costoTotalVenta, 2),
        credito: 0,
        fecha: factura.fecha,
      },
    });
    // Inventario baja (credito)
    await db.movimientoContable.create({
      data: {
        empresaId,
        comprobanteId: comprobante.id,
        cuentaId: cuentaInventario.id,
        descripcion: `Salida de inventario ${factura.numero}`,
        debito: 0,
        credito: round(costoTotalVenta, 2),
        fecha: factura.fecha,
      },
    });
  }
}
