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
import { registrarMovimientoInventario } from "@/lib/inventario";
import { round } from "@/lib/currency";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");

    const where: any = { empresaId: session.empresaId };
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
}

const itemSchema = z.object({
  productoId: z.string().optional(),
  descripcion: z.string(),
  cantidad: z.number().positive(),
  unidadMedida: z.string().default("UND"),
  precioUnitario: z.number().nonnegative(),
  descuentoValor: z.number().default(0),
  tarifaIva: z.number().default(19),
  bodegaDestinoId: z.string().optional(),
});

const compraSchema = z.object({
  proveedorFacturaNumero: z.string().optional(),
  terceroId: z.string().optional(),
  nombreProveedor: z.string().min(2),
  nitProveedor: z.string(),
  fechaVencimiento: z.string().optional(),
  items: z.array(itemSchema).min(1),
  bodegaDestinoId: z.string().optional(),
  observaciones: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = compraSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    // Generar número interno
    const cnt = await db.facturaCompra.count({
      where: { empresaId: session.empresaId },
    });
    const numero = `COM-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

    let subtotal = 0;
    let descuentoTotal = 0;
    let totalIva = 0;
    let total = 0;
    const detallesData: any[] = [];

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

    const factura = await db.facturaCompra.create({
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
      await db.detalleFacturaCompra.create({
        data: { facturaId: factura.id, ...d },
      });

      // Entrada al inventario si es producto
      if (d.productoId && d.bodegaDestinoId) {
        await registrarMovimientoInventario({
          empresaId: session.empresaId,
          productoId: d.productoId,
          bodegaId: d.bodegaDestinoId,
          tipo: "entrada",
          cantidad: d.cantidad,
          costoUnitario: d.precioUnitario,
          documentoTipo: "FACTURA_COMPRA",
          documentoId: factura.id,
        });
      }
    }

    // Aumentar saldo cartera del tercero proveedor
    if (data.terceroId) {
      await db.tercero.update({
        where: { id: data.terceroId },
        data: { saldoCartera: { increment: total } },
      });
    }

    return ok(factura);
  } catch (e) {
    return serverError("Error al crear compra", e);
  }
}
