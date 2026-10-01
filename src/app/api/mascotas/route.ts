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
// /api/mascotas
// GET (lista ?q&especie&terceroId + pag), POST crea, PUT actualiza
// ============================================================

const schema = z.object({
  id: z.string().optional(),
  terceroId: z.string().nullish(),
  nombre: z.string().min(2),
  especie: z.string().min(2),
  raza: z.string().optional(),
  sexo: z.enum(["M", "H"]).optional(),
  fechaNacimiento: z.string().optional(),
  color: z.string().optional(),
  microchip: z.string().optional(),
  observaciones: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");
    const especie = getQuery(req, "especie");
    const terceroId = getQuery(req, "terceroId");

    const where: any = { empresaId: session.empresaId };
    if (especie) where.especie = especie;
    if (terceroId) where.terceroId = terceroId;
    if (q) {
      where.OR = [
        { nombre: { contains: q } },
        { raza: { contains: q } },
        { color: { contains: q } },
        { microchip: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      db.mascota.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.mascota.count({ where }),
    ]);

    const tids = items.map((m) => m.terceroId).filter(Boolean) as string[];
    const terceros = tids.length
      ? await db.tercero.findMany({
          where: { id: { in: tids } },
          select: { id: true, nombre: true, numeroDocumento: true },
        })
      : [];
    const tmap = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((m) => ({
      ...m,
      tercero: m.terceroId ? tmap.get(m.terceroId) ?? null : null,
    }));
    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar mascotas", e);
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

    if (d.terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: d.terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }

    const mascota = await db.mascota.create({
      data: {
        empresaId: session.empresaId,
        terceroId: d.terceroId ?? null,
        nombre: d.nombre,
        especie: d.especie,
        raza: d.raza ?? null,
        sexo: d.sexo ?? null,
        fechaNacimiento: d.fechaNacimiento
          ? new Date(d.fechaNacimiento)
          : null,
        color: d.color ?? null,
        microchip: d.microchip ?? null,
        observaciones: d.observaciones ?? null,
      },
    });
    return ok(mascota);
  } catch (e) {
    return serverError("Error al crear mascota", e);
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

    const exists = await db.mascota.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return badRequest("Mascota no encontrada");

    if (d.terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: d.terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }

    const mascota = await db.mascota.update({
      where: { id },
      data: {
        terceroId: d.terceroId ?? null,
        nombre: d.nombre,
        especie: d.especie,
        raza: d.raza ?? null,
        sexo: d.sexo ?? null,
        fechaNacimiento: d.fechaNacimiento
          ? new Date(d.fechaNacimiento)
          : null,
        color: d.color ?? null,
        microchip: d.microchip ?? null,
        observaciones: d.observaciones ?? null,
      },
    });
    return ok(mascota);
  } catch (e) {
    return serverError("Error al actualizar mascota", e);
  }
}
