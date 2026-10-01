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

// ============================================================
// /api/servicios-publicos/tarifas
// GET lista (?tipoServicio&estrato + pag), POST crea, PUT actualiza
// ============================================================

const schema = z.object({
  id: z.string().optional(),
  tipoServicio: z.enum(["agua", "energia", "gas", "aseo"]),
  estrato: z.number().int().min(1).max(6),
  uso: z.enum(["residencial", "comercial", "industrial", "oficial"]),
  rangoDesde: z.number().nonnegative(),
  rangoHasta: z.number().nonnegative(),
  tarifa: z.number().nonnegative(),
  cargoFijo: z.number().nonnegative().default(0),
  activa: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const tipoServicio = getQuery(req, "tipoServicio");
    const estrato = getQueryInt(req, "estrato");
    const uso = getQuery(req, "uso");

    const where: any = { empresaId: session.empresaId };
    if (tipoServicio) where.tipoServicio = tipoServicio;
    if (estrato) where.estrato = estrato;
    if (uso) where.uso = uso;

    const [items, total] = await Promise.all([
      db.tarifaServicio.findMany({
        where,
        orderBy: [{ tipoServicio: "asc" }, { estrato: "asc" }, { rangoDesde: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.tarifaServicio.count({ where }),
    ]);
    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar tarifas de servicio", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;
    if (d.rangoHasta <= d.rangoDesde)
      return badRequest("rangoHasta debe ser mayor que rangoDesde");
    const tarifa = await db.tarifaServicio.create({
      data: {
        empresaId: session.empresaId,
        tipoServicio: d.tipoServicio,
        estrato: d.estrato,
        uso: d.uso,
        rangoDesde: d.rangoDesde,
        rangoHasta: d.rangoHasta,
        tarifa: d.tarifa,
        cargoFijo: d.cargoFijo,
        activa: d.activa ?? true,
      },
    });
    return ok(tarifa);
  } catch (e) {
    return serverError("Error al crear tarifa de servicio", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const { id, ...d } = parsed.data;
    if (!id) return badRequest("id requerido");
    const exists = await db.tarifaServicio.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return badRequest("Tarifa no encontrada");
    const tarifa = await db.tarifaServicio.update({
      where: { id },
      data: {
        tipoServicio: d.tipoServicio,
        estrato: d.estrato,
        uso: d.uso,
        rangoDesde: d.rangoDesde,
        rangoHasta: d.rangoHasta,
        tarifa: d.tarifa,
        cargoFijo: d.cargoFijo,
        activa: d.activa ?? exists.activa,
      },
    });
    return ok(tarifa);
  } catch (e) {
    return serverError("Error al actualizar tarifa de servicio", e);
  }
}
