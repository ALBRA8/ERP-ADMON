import { NextRequest } from "next/server";
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
// /api/mascotas/[id]
// GET, PUT, DELETE
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const mascota = await db.mascota.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!mascota) return notFound("Mascota no encontrada");
    let tercero = null;
    if (mascota.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: mascota.terceroId },
        select: {
          id: true,
          nombre: true,
          numeroDocumento: true,
          telefono: true,
        },
      });
    }
    return ok({ ...mascota, tercero });
  } catch (e) {
    return serverError("Error al obtener mascota", e);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const exists = await db.mascota.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return notFound("Mascota no encontrada");
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const {
      terceroId,
      nombre,
      especie,
      raza,
      sexo,
      fechaNacimiento,
      color,
      microchip,
      observaciones,
    } = body ?? {};
    if (terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }
    const mascota = await db.mascota.update({
      where: { id },
      data: {
        terceroId: terceroId ?? null,
        nombre,
        especie,
        raza: raza ?? null,
        sexo: sexo ?? null,
        fechaNacimiento: fechaNacimiento
          ? new Date(fechaNacimiento)
          : null,
        color: color ?? null,
        microchip: microchip ?? null,
        observaciones: observaciones ?? null,
      },
    });
    return ok(mascota);
  } catch (e) {
    return serverError("Error al actualizar mascota", e);
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
    const exists = await db.mascota.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return notFound("Mascota no encontrada");
    await db.mascota.delete({ where: { id } });
    return ok({ ok: true, id });
  } catch (e) {
    return serverError("Error al eliminar mascota", e);
  }
}
