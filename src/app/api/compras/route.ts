import { NextRequest } from "next/server";
import { z } from "zod";
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
import { round } from "@/lib/currency";

// ============================================================
// GET /api/compras
// ============================================================
export async function GET(req: NextRequest) {
  return withAuth(req, { permission: "compras:read" }, async (session) => {
    try {
      const page = getQueryInt(req, "page", 1) ?? 1;
      const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
      const q = getQuery(req, "q");

      const where: {
        empresaId: string;
        OR?: Array<Record<string, unknown>>;
      } = { empresaId: session.empresaId };
      if (q) {
        where.OR = [
          { numero: { contains: q } },
          { nombreProveedor: { contains: q } },
          { nitProveedor: { contains: q } },
        ];
      }

      const [items, total] = await Promise.all([
        db.facturaCompra.findMany({
          where,
          orderBy: { fecha: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { tercero: true, detalles: true },
        }),
        db.facturaCompra.count({ where }),
      ]);
      return ok({ items, total, page, pageSize });
    } catch (e) {
      return serverError("Error al listar compras", e);
    }
  });
}

const itemSchema = z.object({
  productoId: z.string().nullish(),
  descripcion: z.string().max(500),
  cantidad: z.number().positive().max(1e9),
  unidadMedida: z.string().max(20).default("UND"),
  precioUnitario: z.number().nonnegative().max(1e12),
  descuentoValor: z.number().nonnegative().default(0),
  tarifaIva: z.number().nonnegative().max(100).default(19),
  bodegaDestinoId: z.string().nullish(),
});

const compraSchema = z.object({
  proveedorFacturaNumero: z.string().max(50).optional(),
  terceroId: z.string().nullish(),
  nombreProveedor: z.string().min(2).max(200),
  nitProveedor: z.string().max(20),
  fechaVencimiento: z.string().optional(),
  items: z.array(itemSchema).min(1),
  bodegaDestinoId: z.string().nullish(),
  observaciones: z.string().max(2000).nullish(),
});

// ============================================================
// POST /api/compras
// Crea factura compra + detalles + entradas inventario + cartera
// en una sola `db.$transaction` (A-CRIT-001).
// ============================================================
export async function POST(req: NextRequest) {
  return withAuth(req, { permission: "compras:write" }, async (session) => {
    const parsed = await parseBody(req, compraSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;

    try {
      // Validar FKs antes de la transacción (A-CRIT-007 + robustez)
      if (data.terceroId) {
        const prov = await db.tercero.findFirst({
          where: { id: data.terceroId, empresaId: session.empresaId },
          select: { id: true, nombre: true },
        });
        if (!prov) return badRequest("Tercero (proveedor) no encontrado en su empresa");
      }
      if (data.bodegaDestinoId) {
        const bod = await db.bodega.findFirst({
          where: { id: data.bodegaDestinoId, empresaId: session.empresaId },
          select: { id: true },
        });
        if (!bod) return badRequest("Bodega destino no encontrada en su empresa");
      }
      // Validar productoId por item
      for (const [idx, item] of data.items.entries()) {
        if (item.productoId) {
          const prod = await db.producto.findFirst({
            where: { id: item.productoId, empresaId: session.empresaId },
            select: { id: true },
          });
          if (!prod) return badRequest(`Item #${idx + 1}: producto no encontrado en su empresa`);
        }
      }

      // Cálculos puros (sin BD)
      let subtotal = 0;
      let descuentoTotal = 0;
      let totalIva = 0;
      let total = 0;
      const detallesData: Array<{
        productoId?: string;
        descripcion: string;
        cantidad: number;
        unidadMedida: string;
        precioUnitario: number;
        descuentoValor: number;
        subtotal: number;
        tarifaIva: number;
        iva: number;
        total: number;
        bodegaDestinoId?: string;
      }> = [];

      for (const item of data.items) {
        const gross = round(item.cantidad * item.precioUnitario, 2);
        const subtotalItem = round(gross - item.descuentoValor, 2);
        const iva = round(subtotalItem * (item.tarifaIva / 100), 2);
        const totalItem = round(subtotalItem + iva, 2);

        subtotal += gross;
        descuentoTotal += item.descuentoValor;
        totalIva += iva;
        total += totalItem;

        detallesData.push({
          productoId: item.productoId,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidadMedida: item.unidadMedida,
          precioUnitario: item.precioUnitario,
          descuentoValor: item.descuentoValor,
          subtotal: subtotalItem,
          tarifaIva: item.tarifaIva,
          iva,
          total: totalItem,
          bodegaDestinoId: item.bodegaDestinoId ?? data.bodegaDestinoId,
        });
      }

      const fechaVencimiento = data.fechaVencimiento
        ? new Date(data.fechaVencimiento)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // TRANSACCIÓN: factura + detalles + entradas inventario + cartera.
      const factura = await db.$transaction(async (tx) => {
        const cnt = await tx.facturaCompra.count({
          where: { empresaId: session.empresaId },
        });
        const numero = `COM-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

        const fac = await tx.facturaCompra.create({
          data: {
            empresaId: session.empresaId,
            numero,
            proveedorFacturaNumero: data.proveedorFacturaNumero,
            terceroId: data.terceroId,
            nombreProveedor: data.nombreProveedor,
            nitProveedor: data.nitProveedor,
            fecha: new Date(),
            fechaVencimiento,
            subtotal,
            descuentoTotal,
            totalIva,
            total,
            saldoPendiente: total,
            estadoCartera: "pendiente",
            bodegaDestinoId: data.bodegaDestinoId,
            observaciones: data.observaciones,
          },
        });

        for (const d of detallesData) {
          await tx.detalleFacturaCompra.create({
            data: { facturaId: fac.id, ...d },
          });

          // Entrada al inventario si es producto (atómica dentro de la tx)
          if (d.productoId && d.bodegaDestinoId) {
            await registrarEntradaInventarioTx(tx, {
              empresaId: session.empresaId,
              productoId: d.productoId,
              bodegaId: d.bodegaDestinoId,
              tipo: "entrada",
              cantidad: d.cantidad,
              costoUnitario: d.precioUnitario,
              documentoTipo: "FACTURA_COMPRA",
              documentoId: fac.id,
            });
          }
        }

        // Aumentar saldo cartera del proveedor
        if (data.terceroId) {
          await tx.tercero.update({
            where: { id: data.terceroId },
            data: { saldoCartera: { increment: total } },
          });
        }

        return fac;
      });

      return ok(factura);
    } catch (e) {
      return serverError("Error al crear compra", e);
    }
  });
}

// ============================================================
// registrarEntradaInventarioTx
// Versión transaccional (recibe `tx`) de `registrarMovimientoInventario`
// para entrada de inventario. Recalcula costo promedio ponderado dentro
// de la transacción. A-CRIT-001 + A-ALT-011.
// ============================================================
async function registrarEntradaInventarioTx(
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
  },
): Promise<void> {
  const cantidad = Math.abs(input.cantidad);
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
      fecha: new Date(),
    },
  });

  const saldo = await tx.saldoInventario.findUnique({
    where: {
      productoId_bodegaId: {
        productoId: input.productoId,
        bodegaId: input.bodegaId,
      },
    },
  });

  if (saldo) {
    const prevCantidad = Number(saldo.cantidad);
    const prevCostoProm = Number(saldo.costoPromedio);
    const prevTotal = round(prevCantidad * prevCostoProm, 2);
    const entryTotal = round(cantidad * input.costoUnitario, 2);
    const nuevaCantidad = round(prevCantidad + cantidad, 4);
    const nuevoCostoPromedio =
      nuevaCantidad > 0 ? round((prevTotal + entryTotal) / nuevaCantidad, 4) : 0;
    const nuevoCostoTotal = round(prevTotal + entryTotal, 2);

    await tx.saldoInventario.update({
      where: { id: saldo.id },
      data: {
        cantidad: nuevaCantidad,
        costoTotal: nuevoCostoTotal,
        costoPromedio: nuevoCostoPromedio,
      },
    });

    await tx.producto.update({
      where: { id: input.productoId },
      data: {
        costoPromedio: nuevoCostoPromedio,
        ultimoCosto: input.costoUnitario,
      },
    });
  } else {
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
