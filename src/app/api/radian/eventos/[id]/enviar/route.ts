import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { enviarEventoRadianADian } from "@/lib/radian";

// ============================================================
// POST /api/radian/eventos/[id]/enviar
// Reenvía el evento a DIAN (cola manual).
//
// Si éxito: estado = `aceptado`, guarda trackId.
// Si fallo: estado = `rechazado` con mensajeError.
// ============================================================
export async function POST(
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

    if (evento.estado === "anulado") {
      return badRequest("El evento está anulado y no puede enviarse");
    }
    if (evento.estado === "aceptado") {
      return badRequest("El evento ya fue aceptado por DIAN");
    }

    const res = await enviarEventoRadianADian(evento.id, session.empresaId);

    // Recargar estado final
    const eventoFinal = await db.eventoRadian.findUnique({
      where: { id: evento.id },
    });

    return ok({
      ok: res.ok,
      estado: res.estado,
      trackId: res.trackId,
      mensajeError: res.mensajeError,
      evento: eventoFinal,
    });
  } catch (e) {
    return serverError("Error al reenviar evento a DIAN", e);
  }
}
