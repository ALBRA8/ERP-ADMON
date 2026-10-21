import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQuery, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/contabilidad/cierre/verificar?anio=2026&mes=10
//   Verifica si un período contable está cerrado.
//   Respuesta: { cerrado: boolean, motivo?: string, cierre?: CierrePeriodo }
//   - Si hay cierre mensual (mes>0) cerrado → cerrado=true
//   - Si hay cierre anual (mes=0) cerrado para el año → cerrado=true
//   - Si mes=0 en la query, verifica cierre anual del año
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const anio = getQueryInt(req, "anio");
    const mes = getQueryInt(req, "mes");
    if (!anio) return badRequest("anio requerido");
    if (mes === undefined) return badRequest("mes requerido (0=anual, 1-12=mensual)");

    // 1. Si se pregunta por mes específico (>0), buscar cierre mensual.
    // 2. Siempre buscar también cierre anual (mes=0).
    const where: any = {
      empresaId: session.empresaId,
      anio,
      estado: "cerrado",
      OR: [] as any[],
    };
    if (mes > 0) {
      where.OR.push({ mes });
    }
    where.OR.push({ mes: 0 }); // cierre anual

    const cierre = await db.cierrePeriodo.findFirst({
      where,
      orderBy: { mes: "desc" }, // mensual (mes>0) tiene prioridad sobre anual (mes=0)
    });

    if (!cierre) {
      return ok({ cerrado: false });
    }
    const motivo =
      cierre.mes === 0
        ? `Cierre anual ${anio}`
        : `Cierre mensual ${anio}-${String(cierre.mes).padStart(2, "0")}`;
    return ok({ cerrado: true, motivo, cierre });
  } catch (e) {
    return serverError("Error al verificar cierre", e);
  }
}
