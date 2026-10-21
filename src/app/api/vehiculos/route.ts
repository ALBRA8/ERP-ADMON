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
// /api/vehiculos
// GET (lista ?q&tipo&terceroId + pag), POST crea, PUT actualiza
// Placa única por empresa.
// ============================================================

const schema = z.object({
  id: z.string().optional(),
  terceroId: z.string().nullish(),
  placa: z.string().min(2),
  marca: z.string().min(1),
  modelo: z.string().min(1),
  anio: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  color: z.string().optional(),
  kilometraje: z.number().int().nonnegative().optional(),
  tipo: z
    .enum(["particular", "publico", "carga", "moto"])
    .optional(),
  observaciones: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");
    const tipo = getQuery(req, "tipo");
    const terceroId = getQuery(req, "terceroId");

    const where: any = { empresaId: session.empresaId };
    if (tipo) where.tipo = tipo;
    if (terceroId) where.terceroId = terceroId;
    if (q) {
      where.OR = [
        { placa: { contains: q } },
        { marca: { contains: q } },
        { modelo: { contains: q } },
        { color: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      db.vehiculo.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.vehiculo.count({ where }),
    ]);

    // Lookup manual tercero
    const tids = items.map((v) => v.terceroId).filter(Boolean) as string[];
    const terceros = tids.length
      ? await db.tercero.findMany({
          where: { id: { in: tids } },
          select: { id: true, nombre: true, numeroDocumento: true },
        })
      : [];
    const tmap = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((v) => ({
      ...v,
      tercero: v.terceroId ? tmap.get(v.terceroId) ?? null : null,
    }));
    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar vehículos", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
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
    // Placa única por empresa
    const existente = await db.vehiculo.findFirst({
      where: { empresaId: session.empresaId, placa: d.placa },
    });
    if (existente)
      return badRequest(`Ya existe un vehículo con placa ${d.placa}`);

    const vehiculo = await db.vehiculo.create({
      data: {
        empresaId: session.empresaId,
        terceroId: d.terceroId ?? null,
        placa: d.placa,
        marca: d.marca,
        modelo: d.modelo,
        anio: d.anio,
        color: d.color ?? null,
        kilometraje: d.kilometraje ?? 0,
        tipo: d.tipo ?? "particular",
        observaciones: d.observaciones ?? null,
      },
    });
    return ok(vehiculo);
  } catch (e) {
    return serverError("Error al crear vehículo", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const { id, ...d } = parsed.data;
    if (!id) return badRequest("id requerido");

    const exists = await db.vehiculo.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return badRequest("Vehículo no encontrado");

    if (d.terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: d.terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }
    // Si cambia la placa, validar unicidad
    if (d.placa && d.placa !== exists.placa) {
      const otro = await db.vehiculo.findFirst({
        where: {
          empresaId: session.empresaId,
          placa: d.placa,
          NOT: { id },
        },
      });
      if (otro) return badRequest(`Placa ${d.placa} ya está en uso`);
    }

    const vehiculo = await db.vehiculo.update({
      where: { id },
      data: {
        terceroId: d.terceroId ?? null,
        placa: d.placa,
        marca: d.marca,
        modelo: d.modelo,
        anio: d.anio,
        color: d.color ?? null,
        kilometraje: d.kilometraje ?? exists.kilometraje,
        tipo: d.tipo ?? exists.tipo,
        observaciones: d.observaciones ?? null,
      },
    });
    return ok(vehiculo);
  } catch (e) {
    return serverError("Error al actualizar vehículo", e);
  }
}
