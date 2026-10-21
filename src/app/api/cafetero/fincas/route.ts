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
// /api/cafetero/fincas
// GET    lista (filtros ?q + paginación)
// POST   crea
// PUT    actualiza (requiere id en body)
// ============================================================

const fincaSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().min(2),
  ubicacion: z.string().optional(),
  municipio: z.string().optional(),
  propietarioId: z.string().nullish(),
  hectareas: z.number().nonnegative().optional(),
  altura: z.number().int().nonnegative().optional(),
  sombra: z.boolean().optional(),
  observaciones: z.string().optional(),
});

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
        { nombre: { contains: q } },
        { municipio: { contains: q } },
        { ubicacion: { contains: q } },
      ];
    }
    const [items, total] = await Promise.all([
      db.finca.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.finca.count({ where }),
    ]);

    // Lookup manual de propietario (Finca.propietarioId no tiene relation)
    const ids = items
      .map((f) => f.propietarioId)
      .filter(Boolean) as string[];
    const terceros = ids.length
      ? await db.tercero.findMany({
          where: { id: { in: ids } },
          select: { id: true, nombre: true, numeroDocumento: true },
        })
      : [];
    const map = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((f) => ({
      ...f,
      propietario: f.propietarioId ? map.get(f.propietarioId) ?? null : null,
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar fincas", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = fincaSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const data = parsed.data;

    if (data.propietarioId) {
      const t = await db.tercero.findFirst({
        where: { id: data.propietarioId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Propietario (tercero) no encontrado");
    }

    const finca = await db.finca.create({
      data: {
        empresaId: session.empresaId,
        nombre: data.nombre,
        ubicacion: data.ubicacion ?? null,
        municipio: data.municipio ?? null,
        propietarioId: data.propietarioId ?? null,
        hectareas: data.hectareas ?? null,
        altura: data.altura ?? null,
        sombra: data.sombra ?? false,
        observaciones: data.observaciones ?? null,
      },
    });
    return ok(finca);
  } catch (e) {
    return serverError("Error al crear finca", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = fincaSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const { id, ...data } = parsed.data;
    if (!id) return badRequest("id requerido");

    const exists = await db.finca.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return badRequest("Finca no encontrada");

    if (data.propietarioId) {
      const t = await db.tercero.findFirst({
        where: { id: data.propietarioId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Propietario (tercero) no encontrado");
    }

    const finca = await db.finca.update({
      where: { id },
      data: {
        nombre: data.nombre,
        ubicacion: data.ubicacion ?? null,
        municipio: data.municipio ?? null,
        propietarioId: data.propietarioId ?? null,
        hectareas: data.hectareas ?? null,
        altura: data.altura ?? null,
        sombra: data.sombra ?? false,
        observaciones: data.observaciones ?? null,
      },
    });
    return ok(finca);
  } catch (e) {
    return serverError("Error al actualizar finca", e);
  }
}
