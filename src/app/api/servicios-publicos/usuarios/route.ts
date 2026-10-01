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
// /api/servicios-publicos/usuarios
// GET lista (?q&estrato&uso + paginación), POST crea, PUT actualiza
// ============================================================

const schema = z.object({
  id: z.string().optional(),
  terceroId: z.string().nullish(),
  numeroContrato: z.string().min(2),
  direccion: z.string().min(3),
  estrato: z.number().int().min(1).max(6),
  uso: z.enum(["residencial", "comercial", "industrial", "oficial"]),
  tarifaFija: z.number().nonnegative().default(0),
  tarifaVariable: z.number().nonnegative().default(0),
  medidor: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");
    const estrato = getQueryInt(req, "estrato");
    const uso = getQuery(req, "uso");

    const where: any = { empresaId: session.empresaId };
    if (q) {
      where.OR = [
        { numeroContrato: { contains: q } },
        { direccion: { contains: q } },
        { medidor: { contains: q } },
      ];
    }
    if (estrato) where.estrato = estrato;
    if (uso) where.uso = uso;

    const [items, total] = await Promise.all([
      db.usuarioServicio.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.usuarioServicio.count({ where }),
    ]);

    // Lookup manual de tercero
    const tids = items.map((u) => u.terceroId).filter(Boolean) as string[];
    const terceros = tids.length
      ? await db.tercero.findMany({
          where: { id: { in: tids } },
          select: {
            id: true,
            nombre: true,
            numeroDocumento: true,
            telefono: true,
          },
        })
      : [];
    const tmap = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((u) => ({
      ...u,
      tercero: u.terceroId ? tmap.get(u.terceroId) ?? null : null,
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar usuarios de servicio", e);
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

    // validar tercero
    if (d.terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: d.terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }
    // validar contrato único
    const existente = await db.usuarioServicio.findFirst({
      where: {
        empresaId: session.empresaId,
        numeroContrato: d.numeroContrato,
      },
    });
    if (existente)
      return badRequest(
        `Ya existe un usuario con el contrato ${d.numeroContrato}`,
      );

    const usuario = await db.usuarioServicio.create({
      data: {
        empresaId: session.empresaId,
        terceroId: d.terceroId ?? null,
        numeroContrato: d.numeroContrato,
        direccion: d.direccion,
        estrato: d.estrato,
        uso: d.uso,
        tarifaFija: d.tarifaFija,
        tarifaVariable: d.tarifaVariable,
        medidor: d.medidor ?? null,
        estado: "activo",
      },
    });
    return ok(usuario);
  } catch (e) {
    return serverError("Error al crear usuario de servicio", e);
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

    const exists = await db.usuarioServicio.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return badRequest("Usuario de servicio no encontrado");

    if (d.terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: d.terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }

    const usuario = await db.usuarioServicio.update({
      where: { id },
      data: {
        terceroId: d.terceroId ?? null,
        numeroContrato: d.numeroContrato,
        direccion: d.direccion,
        estrato: d.estrato,
        uso: d.uso,
        tarifaFija: d.tarifaFija,
        tarifaVariable: d.tarifaVariable,
        medidor: d.medidor ?? null,
      },
    });
    return ok(usuario);
  } catch (e) {
    return serverError("Error al actualizar usuario de servicio", e);
  }
}
