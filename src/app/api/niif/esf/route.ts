import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, getQuery } from "@/lib/api";
import { generarESF } from "@/lib/niif";

// GET /api/niif/esf?fechaFin=2026-12-31
// Genera y devuelve el Estado de Situación Financiera (Balance General NIIF)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  const fechaFin = getQuery(req, "fechaFin");
  if (!fechaFin) return badRequest("fechaFin requerido (formato YYYY-MM-DD)");
  try {
    const data = await generarESF(session.empresaId, fechaFin);
    return ok(data);
  } catch (e: any) {
    return serverError(`Error generando ESF: ${e?.message ?? e}`);
  }
}
