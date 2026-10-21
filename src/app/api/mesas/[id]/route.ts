import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET    /api/mesas/[id] — devuelve mesa con comanda activa (abierta)
// PUT    /api/mesas/[id] — actualiza
// DELETE /api/mesas/[id] — desactiva (estado=inactiva)
// ============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const mesa = await db.mesa.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!mesa) return notFound("Mesa no encontrada");

    // Comanda activa (abierta) más reciente
    const comandaActiva = await db.comanda.findFirst({
      where: { mesaId: mesa.id, estado: "abierta" },
      include: { detalles: true },
      orderBy: { fechaApertura: "desc" },
    });

    return ok({ ...mesa, comandaActiva: comandaActiva ?? null });
  } catch (e) {
    return serverError("Error al obtener mesa", e);
  }
}

const mesaUpdateSchema = z.object({
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = mesaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const existing = await db.mesa.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return notFound("Mesa no encontrada");

    const mesa = await db.mesa.update({
      where: { id },
      data: parsed.data,
    });
    return ok(mesa);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una mesa con ese código");
    }
    return serverError("Error al actualizar mesa", e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const existing = await db.mesa.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return notFound("Mesa no encontrada");

    // Verificar que no tenga comanda abierta
    const comandaAbierta = await db.comanda.findFirst({
      where: { mesaId: id, estado: "abierta" },
    });
    if (comandaAbierta) {
      return badRequest(
        "No se puede desactivar una mesa con comanda abierta",
      );
    }

    const mesa = await db.mesa.update({
      where: { id },
      data: { estado: "inactiva" },
    });
    return ok(mesa);
  } catch (e) {
    return serverError("Error al desactivar mesa", e);
  }
}
