import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, getQuery } from "@/lib/api";
import { generarEFE } from "@/lib/niif";

// GET /api/niif/efe?fechaInicio=...&fechaFin=...
// Genera y devuelve el Estado de Flujos de Efectivo (EFE) bajo NIIF (método indirecto)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  const fechaInicio = getQuery(req, "fechaInicio");
  const fechaFin = getQuery(req, "fechaFin");
  if (!fechaInicio || !fechaFin)
    return badRequest("fechaInicio y fechaFin son requeridos (YYYY-MM-DD)");
  try {
    const data = await generarEFE(session.empresaId, fechaInicio, fechaFin);
    return ok(data);
  } catch (e: any) {
    return serverError(`Error generando EFE: ${e?.message ?? e}`);
  }
}
