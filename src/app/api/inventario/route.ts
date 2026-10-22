import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQuery, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { registrarMovimientoInventario, getKardex } from "@/lib/inventario";

// GET: lista bodegas, saldos por bodega, kardex por producto
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const op = getQuery(req, "op"); // bodegas | saldos | kardex | movimientos

    if (op === "bodegas") {
      const items = await db.bodega.findMany({
        where: { empresaId: session.empresaId },
        include: {
          saldosInventario: {
            include: { producto: true },
          },
        },
      });
      const enriched = items.map((b) => ({
        ...b,
        productosCount: b.saldosInventario.length,
        valorTotal: b.saldosInventario.reduce((a, s) => a + Number(s.costoTotal), 0),
        cantidadTotal: b.saldosInventario.reduce((a, s) => a + s.cantidad, 0),
      }));
      return ok(enriched);
    }

    if (op === "saldos") {
      const saldos = await db.saldoInventario.findMany({
        where: { empresaId: session.empresaId },
        include: { producto: true, bodega: true },
        orderBy: { producto: { nombre: "asc" } },
      });
      return ok(saldos);
    }

    if (op === "kardex") {
      const productoId = getQuery(req, "productoId");
      const bodegaId = getQuery(req, "bodegaId");
      if (!productoId) return badRequest("productoId requerido");
      const fechaInicioStr = getQuery(req, "fechaInicio");
      const fechaFinStr = getQuery(req, "fechaFin");
      const fechaInicio = fechaInicioStr ? new Date(fechaInicioStr) : undefined;
      const fechaFin = fechaFinStr ? new Date(fechaFinStr) : undefined;
      const kardex = await getKardex(
        session.empresaId,
        productoId,
        bodegaId,
        fechaInicio,
        fechaFin,
      );
      return ok(kardex);
    }

    if (op === "movimientos") {
      const page = getQueryInt(req, "page", 1) ?? 1;
      const pageSize = getQueryInt(req, "pageSize", 100) ?? 100;
      const productoId = getQuery(req, "productoId");
      const where: any = { empresaId: session.empresaId };
      if (productoId) where.productoId = productoId;
      const [items, total] = await Promise.all([
        db.movimientoInventario.findMany({
          where,
          orderBy: { fecha: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { producto: true, bodega: true },
        }),
        db.movimientoInventario.count({ where }),
      ]);
      return ok({ items, total, page, pageSize });
    }

    return badRequest("op inválido (bodegas | saldos | kardex | movimientos)");
  } catch (e) {
    return serverError("Error al consultar inventario", e);
  }
}

const ajusteSchema = z.object({
  productoId: z.string(),
  bodegaId: z.string(),
  tipo: z.enum(["entrada", "salida", "ajuste"]),
  cantidad: z.number(),
  costoUnitario: z.number().default(0),
  motivo: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = ajusteSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const m = await registrarMovimientoInventario({
      empresaId: session.empresaId,
      productoId: parsed.data.productoId,
      bodegaId: parsed.data.bodegaId,
      tipo: parsed.data.tipo,
      cantidad: parsed.data.cantidad,
      costoUnitario: parsed.data.costoUnitario,
      documentoTipo: "AJUSTE_MANUAL",
    });
    return ok(m);
  } catch (e) {
    return serverError("Error al registrar movimiento", e);
  }
}
