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
// POST /api/reservas-hotel/[id]/cancelar
// Cambia estado a "cancelada", libera la habitación (estado = "disponible")
// ============================================================
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const reserva = await db.reservaHotel.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!reserva) return notFound("Reserva no encontrada");

    if (reserva.estado === "checkout" || reserva.estado === "cancelada") {
      return badRequest(
        `La reserva no se puede cancelar (estado actual: ${reserva.estado})`,
      );
    }

    await db.reservaHotel.update({
      where: { id: reserva.id },
      data: { estado: "cancelada" },
    });

    // Liberar habitación (solo si estaba reservada u ocupada por esta reserva)
    const hab = await db.habitacion.findUnique({
      where: { id: reserva.habitacionId },
    });
    if (hab && (hab.estado === "reservada" || hab.estado === "ocupada")) {
      await db.habitacion.update({
        where: { id: hab.id },
        data: { estado: "disponible" },
      });
    }

    return ok({ ok: true, id: reserva.id, estado: "cancelada" });
  } catch (e) {
    return serverError("Error al cancelar reserva", e);
  }
}
