import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/reservas-hotel/[id] — devuelve reserva con habitación
// y tercero asociados
// ============================================================
export async function GET(
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

    // Enriquecer con tercero (no hay relación directa en el schema)
    let tercero: any = null;
    if (reserva.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: reserva.terceroId },
        select: { id: true, nombre: true, numeroDocumento: true },
      });
    }

    return ok({ ...reserva, tercero });
  } catch (e) {
    return serverError("Error al obtener reserva", e);
  }
}
