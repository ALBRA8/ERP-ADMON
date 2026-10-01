import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// POST /api/taller/ordenes/[id]/anular
// Cambia estado a "anulado"
// ============================================================

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenServicioTecnico.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!orden) return notFound("Orden de servicio no encontrada");
    if (orden.estado === "entregado") {
      return badRequest("No se puede anular una orden ya entregada");
    }
    const updated = await db.ordenServicioTecnico.update({
      where: { id: orden.id },
      data: { estado: "anulado" },
    });
    return ok({ ok: true, orden: updated });
  } catch (e) {
    return serverError("Error al anular orden", e);
  }
}
