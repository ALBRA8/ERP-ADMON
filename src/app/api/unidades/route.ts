// ============================================================
// /api/unidades — Catálogo de Unidades de Medida
// Devuelve lista filtrada por empresaId de la sesión.
// ============================================================
import { db } from "@/lib/db";
import { ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const items = await db.unidadMedida.findMany({
      where: { empresaId: session.empresaId },
      orderBy: [{ codigo: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
      },
    });

    return ok(items);
  } catch (e) {
    return serverError("Error al listar unidades de medida", e);
  }
}
