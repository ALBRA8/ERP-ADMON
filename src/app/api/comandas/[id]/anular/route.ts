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
import { round } from "@/lib/currency";

// ============================================================
// POST /api/comandas/[id]/anular
// Anula comanda: estado = "anulada", libera la mesa (disponible)
// ============================================================
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const comanda = await db.comanda.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!comanda) return notFound("Comanda no encontrada");

    if (comanda.estado !== "abierta") {
      return badRequest(
        `La comanda no se puede anular (estado actual: ${comanda.estado})`,
      );
    }

    await db.comanda.update({
      where: { id: comanda.id },
      data: { estado: "anulada", fechaCierre: new Date() },
    });

    // Liberar la mesa
    await db.mesa.update({
      where: { id: comanda.mesaId },
      data: { estado: "disponible" },
    });

    return ok({ ok: true, id: comanda.id, estado: "anulada" });
  } catch (e) {
    return serverError("Error al anular comanda", e);
  }
}
