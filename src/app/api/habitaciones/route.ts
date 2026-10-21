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
// GET /api/habitaciones — lista con filtros ?estado=...&tipo=...&planta=...
// Ordena por planta, numero
// POST /api/habitaciones — crea habitación
// PUT /api/habitaciones — actualiza (incluye estado)
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const estado = getQuery(req, "estado");
    const tipo = getQuery(req, "tipo");
    const planta = getQueryInt(req, "planta");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;
    if (planta !== undefined) where.planta = planta;

    const items = await db.habitacion.findMany({
      where,
      orderBy: [{ planta: "asc" }, { numero: "asc" }],
    });

    return ok({ items, total: items.length });
  } catch (e) {
    return serverError("Error al listar habitaciones", e);
  }
}

const habCreateSchema = z.object({
  codigo: z.string().min(1),
  numero: z.string().min(1),
  tipo: z
    .enum(["sencilla", "doble", "suite", "matrimonial"])
    .default("sencilla"),
  capacidad: z.number().int().min(1).default(2),
  precioBase: z.number().nonnegative().default(0),
  planta: z.number().int().min(0).default(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = habCreateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;
    const habitacion = await db.habitacion.create({
      data: {
        empresaId: session.empresaId,
        codigo: data.codigo,
        numero: data.numero,
        tipo: data.tipo,
        capacidad: data.capacidad,
        precioBase: data.precioBase,
        planta: data.planta,
        estado: "disponible",
      },
    });
    return ok(habitacion);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una habitación con ese código");
    }
    return serverError("Error al crear habitación", e);
  }
}

const habUpdateSchema = z.object({
  id: z.string(),
  codigo: z.string().min(1).optional(),
  numero: z.string().min(1).optional(),
  tipo: z
    .enum(["sencilla", "doble", "suite", "matrimonial"])
    .optional(),
  capacidad: z.number().int().min(1).optional(),
  precioBase: z.number().nonnegative().optional(),
  planta: z.number().int().min(0).optional(),
  estado: z
    .enum(["disponible", "ocupada", "sucia", "mantenimiento"])
    .optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = habUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const { id, ...data } = parsed.data;
    if (!id) return badRequest("id requerido");

    const existing = await db.habitacion.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return badRequest("Habitación no encontrada");

    const habitacion = await db.habitacion.update({
      where: { id },
      data,
    });
    return ok(habitacion);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una habitación con ese código");
    }
    return serverError("Error al actualizar habitación", e);
  }
}
