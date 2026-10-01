import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// POST /api/taller/ordenes/[id]/iniciar-reparacion
// Cambia estado a "en_reparacion"
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
    if (orden.estado !== "diagnostico") {
      return badRequest(
        `La orden debe estar en estado "diagnostico" para iniciar reparación (estado actual: ${orden.estado})`,
      );
    }
    const updated = await db.ordenServicioTecnico.update({
      where: { id: orden.id },
      data: { estado: "en_reparacion" },
    });
    return ok({ ok: true, orden: updated });
  } catch (e) {
    return serverError("Error al iniciar reparación", e);
  }
}
