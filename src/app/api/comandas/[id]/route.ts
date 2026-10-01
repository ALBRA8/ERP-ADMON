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
// GET /api/comandas/[id] — devuelve comanda completa con todos
// los detalles y mesa asociada
// ============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const comanda = await db.comanda.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        mesa: true,
        detalles: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!comanda) return notFound("Comanda no encontrada");

    return ok(comanda);
  } catch (e) {
    return serverError("Error al obtener comanda", e);
  }
}
