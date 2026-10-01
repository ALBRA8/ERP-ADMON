import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/ciudades
// Devuelve el catálogo de ciudades (Códigos Dane) asociadas a
// la empresa activa. Se usa para poblar el <Select> de ciudad
// en formularios de Terceros, Empresa, etc.
// ============================================================
export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const ciudades = await db.ciudad.findMany({
      where: { empresaId: session.empresaId },
      orderBy: [{ departamento: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        codigoDane: true,
        nombre: true,
        departamento: true,
      },
    });

    return ok(ciudades);
  } catch (e) {
    return serverError("Error al listar ciudades", e);
  }
}
