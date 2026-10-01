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
// POST /api/reservas-hotel/[id]/checkin
// Body opcional: { observaciones? }
// Cambia estado a "checkin" y marca Habitacion.estado = "ocupada"
// ============================================================
const checkinSchema = z.object({
  observaciones: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const body: any = await req.json().catch(() => ({}));
    const parsed = checkinSchema.safeParse(body || {});
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }

    const reserva = await db.reservaHotel.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { habitacion: true },
    });
    if (!reserva) return notFound("Reserva no encontrada");

    if (reserva.estado !== "confirmada") {
      return badRequest(
        `La reserva no se puede check-in (estado actual: ${reserva.estado})`,
      );
    }

    await db.reservaHotel.update({
      where: { id: reserva.id },
      data: {
        estado: "checkin",
        observaciones: parsed.data.observaciones ?? reserva.observaciones,
      },
    });

    await db.habitacion.update({
      where: { id: reserva.habitacionId },
      data: { estado: "ocupada" },
    });

    const updated = await db.reservaHotel.findFirst({
      where: { id: reserva.id },
      include: { habitacion: true },
    });
    let tercero: any = null;
    if (updated?.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: updated.terceroId },
        select: { id: true, nombre: true, numeroDocumento: true },
      });
    }
    return ok(updated ? { ...updated, tercero } : null);
  } catch (e) {
    return serverError("Error al hacer check-in", e);
  }
}
