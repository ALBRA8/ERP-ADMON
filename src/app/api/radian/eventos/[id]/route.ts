import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, serverError, unauthorized, notFound } from "@/lib/api";

// ============================================================
// GET /api/radian/eventos/[id]
// Devuelve el detalle completo de un evento Radian, incluyendo
// XML del evento y respuestaDIAN.
// ============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const evento = await db.eventoRadian.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!evento) return notFound("Evento Radian no encontrado");

    // Enriquecer con datos de la factura de compra si existe
    let facturaCompra: any = null;
    if (evento.facturaCompraId) {
      facturaCompra = await db.facturaCompra.findFirst({
        where: {
          id: evento.facturaCompraId,
          empresaId: session.empresaId,
        },
        include: { tercero: true },
      });
    }

    // Enriquecer con datos del tercero si existe
    let tercero: any = null;
    if (evento.terceroId) {
      tercero = await db.tercero.findFirst({
        where: { id: evento.terceroId, empresaId: session.empresaId },
      });
    }

    return ok({
      ...evento,
      facturaCompra,
      tercero,
    });
  } catch (e) {
    return serverError("Error al obtener detalle de evento Radian", e);
  }
}
