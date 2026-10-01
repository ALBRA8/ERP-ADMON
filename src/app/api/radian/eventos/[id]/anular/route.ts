import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";

// ============================================================
// POST /api/radian/eventos/[id]/anular
// Anula el evento (cambia estado a `anulado`). Solo se permite
// anular eventos en estado `borrador` o `rechazado`. Los
// aceptados por DIAN no se pueden anular por esta vía.
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
      return badRequest("El evento ya está anulado");
    }
    if (evento.estado === "aceptado") {
      return badRequest(
        "No se puede anular un evento ya aceptado por DIAN. Si requiere revertir, debe enviar un evento contrario.",
      );
    }
    if (evento.estado === "enviado") {
      return badRequest(
        "No se puede anular un evento en estado enviado. Espere respuesta de DIAN o reenvíe primero.",
      );
    }

    const updated = await db.eventoRadian.update({
      where: { id: evento.id },
      data: {
        estado: "anulado",
        mensajeError: null,
        observaciones: [
          evento.observaciones ?? "",
          `[Anulado por ${session.email} el ${new Date().toISOString()}]`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });

    return ok({
      ok: true,
      evento: updated,
      mensaje: "Evento anulado",
    });
  } catch (e) {
    return serverError("Error al anular evento Radian", e);
  }
}
