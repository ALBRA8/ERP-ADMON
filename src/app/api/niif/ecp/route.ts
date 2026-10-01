import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, getQuery } from "@/lib/api";
import { generarECP } from "@/lib/niif";

// GET /api/niif/ecp?fechaInicio=...&fechaFin=...
// Genera y devuelve el Estado de Cambios en el Patrimonio (ECP) bajo NIIF
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  const fechaInicio = getQuery(req, "fechaInicio");
  const fechaFin = getQuery(req, "fechaFin");
  if (!fechaInicio || !fechaFin)
    return badRequest("fechaInicio y fechaFin son requeridos (YYYY-MM-DD)");
  try {
    const data = await generarECP(session.empresaId, fechaInicio, fechaFin);
    return ok(data);
  } catch (e: any) {
    return serverError(`Error generando ECP: ${e?.message ?? e}`);
  }
}
