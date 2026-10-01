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
// POST /api/reservas-hotel/[id]/checkout
// Cambia estado a "checkout" y marca Habitacion.estado = "sucia"
// Devuelve resumen de la estancia (noches, tarifaTotal, habitacion)
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
      include: { habitacion: true },
    });
    if (!reserva) return notFound("Reserva no encontrada");

    let tercero: any = null;
    if (reserva.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: reserva.terceroId },
        select: { id: true, nombre: true, numeroDocumento: true },
      });
    }

    if (reserva.estado !== "checkin") {
      return badRequest(
        `La reserva no se puede check-out (estado actual: ${reserva.estado})`,
      );
    }

    await db.reservaHotel.update({
      where: { id: reserva.id },
      data: { estado: "checkout" },
    });

    await db.habitacion.update({
      where: { id: reserva.habitacionId },
      data: { estado: "sucia" },
    });

    return ok({
      ok: true,
      id: reserva.id,
      estado: "checkout",
      resumen: {
        reservaId: reserva.id,
        habitacion: reserva.habitacion
          ? {
              id: reserva.habitacion.id,
              numero: reserva.habitacion.numero,
              tipo: reserva.habitacion.tipo,
            }
          : null,
        huesped: tercero?.nombre ?? "—",
        fechaCheckin: reserva.fechaCheckin,
        fechaCheckout: reserva.fechaCheckout,
        noches: reserva.noches,
        tarifaNoche: reserva.tarifaNoche,
        tarifaTotal: reserva.tarifaTotal,
        consumosFacturados: 0, //placeholder — futuras consumos de minibar
      },
    });
  } catch (e) {
    return serverError("Error al hacer check-out", e);
  }
}
