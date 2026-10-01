// ============================================================
// /api/lineas — Catálogo de Líneas de Clasificación
// Devuelve lista filtrada por empresaId de la sesión.
// ============================================================
import { db } from "@/lib/db";
import { ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const items = await db.lineaClasificacion.findMany({
      where: { empresaId: session.empresaId },
      orderBy: [{ nivel: "asc" }, { codigo: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        nivel: true,
      },
    });

    return ok(items);
  } catch (e) {
    return serverError("Error al listar líneas de clasificación", e);
  }
}
