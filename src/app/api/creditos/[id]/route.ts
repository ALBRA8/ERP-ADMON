import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/creditos/[id]
// Devuelve el crédito con todas sus cuotas, tercero y solicitud.
// ============================================================
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await ctx.params;

    const credito = await db.credito.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        tercero: true,
        solicitud: true,
        cuotas: { orderBy: { numero: "asc" } },
      },
    });
    if (!credito) return notFound("Crédito no encontrado");

    return ok(credito);
  } catch (e) {
    return serverError("Error al obtener crédito", e);
  }
}
