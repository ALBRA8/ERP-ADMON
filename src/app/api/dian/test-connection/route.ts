import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, serverError, unauthorized } from "@/lib/api";
import { testConnectionDIAN } from "@/lib/dian-real";

// ============================================================
// POST /api/dian/test-connection
// Prueba la conexión con DIAN en el ambiente configurado.
// Sin certificado, responde { ok:false, message:"No hay certificado..." }
// sin crashear.
// ============================================================
export async function POST(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const result = await testConnectionDIAN(session.empresaId);
    return ok(result);
  } catch (e: any) {
    // El propio testConnectionDIAN maneja errores comunes.
    return ok({
      ok: false,
      message: "Error probando conexión DIAN: " + (e?.message ?? String(e)),
    });
  }
}
