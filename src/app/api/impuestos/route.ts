// ============================================================
// /api/impuestos — Catálogo de Impuestos
// Devuelve lista filtrada por empresaId de la sesión.
// ============================================================
import { db } from "@/lib/db";
import { ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const items = await db.impuesto.findMany({
      where: { empresaId: session.empresaId, activo: true },
      orderBy: [{ tarifa: "asc" }, { codigo: "asc" }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        tarifa: true,
      },
    });

    return ok(items);
  } catch (e) {
    return serverError("Error al listar impuestos", e);
  }
}
