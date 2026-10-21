import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/mesas — lista mesas con filtros ?estado=...&ubicacion=...
// Ordena por posicionY, posicionX
// POST /api/mesas — crea mesa
// PUT /api/mesas — actualiza mesa (incluye estado)
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const estado = getQuery(req, "estado");
    const ubicacion = getQuery(req, "ubicacion");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (ubicacion) where.ubicacion = ubicacion;

    const items = await db.mesa.findMany({
      where,
      orderBy: [{ posicionY: "asc" }, { posicionX: "asc" }],
    });

    return ok({ items, total: items.length });
  } catch (e) {
    return serverError("Error al listar mesas", e);
  }
}

const mesaCreateSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  capacidad: z.number().int().min(1).default(4),
  ubicacion: z.string().optional(),
  posicionX: z.number().int().default(0),
  posicionY: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = mesaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;
    const mesa = await db.mesa.create({
      data: {
        empresaId: session.empresaId,
        codigo: data.codigo,
        nombre: data.nombre,
        capacidad: data.capacidad,
        ubicacion: data.ubicacion ?? null,
        posicionX: data.posicionX,
        posicionY: data.posicionY,
        estado: "disponible",
      },
    });
    return ok(mesa);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una mesa con ese código");
    }
    return serverError("Error al crear mesa", e);
  }
}

const mesaUpdateSchema = z.object({
  id: z.string(),
  codigo: z.string().min(1).optional(),
  nombre: z.string().min(1).optional(),
  capacidad: z.number().int().min(1).optional(),
  ubicacion: z.string().nullable().optional(),
  posicionX: z.number().int().optional(),
  posicionY: z.number().int().optional(),
  estado: z
    .enum(["disponible", "ocupada", "reservada", "inactiva"])
    .optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = mesaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const { id, ...data } = parsed.data;
    if (!id) return badRequest("id requerido");

    // Verificar propiedad
    const existing = await db.mesa.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return badRequest("Mesa no encontrada");

    const mesa = await db.mesa.update({
      where: { id },
      data,
    });
    return ok(mesa);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una mesa con ese código");
    }
    return serverError("Error al actualizar mesa", e);
  }
}
