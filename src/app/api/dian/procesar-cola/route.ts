import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, serverError, unauthorized } from "@/lib/api";
import { procesarColaDIAN } from "@/lib/dian-real";

// ============================================================
// POST /api/dian/procesar-cola
// Procesa todos los DIANEnvio pendientes o con proximoIntento vencido.
// Esta ruta se invoca vía cron job (/api/dian/cron) o manualmente.
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const url = new URL(req.url);
    const limite = parseInt(url.searchParams.get("limite") ?? "50", 10) || 50;

    const result = await procesarColaDIAN(session.empresaId, limite);
    return ok(result);
  } catch (e: any) {
    return serverError("Error procesando cola DIAN", e);
  }
}
