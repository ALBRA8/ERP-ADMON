import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, getQuery } from "@/lib/api";
import { generarEER } from "@/lib/niif";

// GET /api/niif/eer?fechaInicio=2026-01-01&fechaFin=2026-12-31
// Genera y devuelve el Estado de Resultado Integral (EER) bajo NIIF
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  const fechaInicio = getQuery(req, "fechaInicio");
  const fechaFin = getQuery(req, "fechaFin");
  if (!fechaInicio || !fechaFin)
    return badRequest("fechaInicio y fechaFin son requeridos (YYYY-MM-DD)");
  try {
    const data = await generarEER(session.empresaId, fechaInicio, fechaFin);
    return ok(data);
  } catch (e: any) {
    return serverError(`Error generando EER: ${e?.message ?? e}`);
  }
}
