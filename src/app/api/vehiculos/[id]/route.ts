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
// /api/vehiculos/[id]
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
    const vehiculo = await db.vehiculo.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!vehiculo) return notFound("Vehículo no encontrado");
    let tercero = null;
    if (vehiculo.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: vehiculo.terceroId },
        select: {
          id: true,
          nombre: true,
          numeroDocumento: true,
          telefono: true,
        },
      });
    }
    return ok({ ...vehiculo, tercero });
  } catch (e) {
    return serverError("Error al obtener vehículo", e);
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
    const exists = await db.vehiculo.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return notFound("Vehículo no encontrado");
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const { terceroId, placa, marca, modelo, anio, color, kilometraje, tipo, observaciones } =
      body ?? {};
    if (terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }
    if (placa && placa !== exists.placa) {
      const otro = await db.vehiculo.findFirst({
        where: {
          empresaId: session.empresaId,
          placa,
          NOT: { id },
        },
      });
      if (otro) return badRequest(`Placa ${placa} ya está en uso`);
    }
    const vehiculo = await db.vehiculo.update({
      where: { id },
      data: {
        terceroId: terceroId ?? null,
        placa,
        marca,
        modelo,
        anio,
        color: color ?? null,
        kilometraje: kilometraje ?? exists.kilometraje,
        tipo: tipo ?? exists.tipo,
        observaciones: observaciones ?? null,
      },
    });
    return ok(vehiculo);
  } catch (e) {
    return serverError("Error al actualizar vehículo", e);
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
    const exists = await db.vehiculo.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return notFound("Vehículo no encontrado");
    await db.vehiculo.delete({ where: { id } });
    return ok({ ok: true, id });
  } catch (e) {
    return serverError("Error al eliminar vehículo", e);
  }
}
