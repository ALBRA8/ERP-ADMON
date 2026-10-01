import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, serverError, unauthorized, getQuery } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/presupuesto/ejecucion?vigencia=2026
// Devuelve ejecución presupuestal por rubro:
//   apropiacionInicial, cdpTotal, crpTotal, obligado, pagado, saldo
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const vigenciaParam = getQuery(req, "vigencia");
    const vigencia =
      vigenciaParam && Number.isFinite(parseInt(vigenciaParam, 10))
        ? parseInt(vigenciaParam, 10)
        : new Date().getFullYear();

    // Cargar todos los rubros de la vigencia
    const rubros = await db.rubroPresupuestal.findMany({
      where: { empresaId: session.empresaId, vigencia },
      orderBy: { codigo: "asc" },
      include: {
        cdps: {
          where: { estado: { not: "anulado" } },
          include: {
            crps: {
              where: { estado: { not: "anulado" } },
            },
          },
        },
      },
    });

    // Agregar ejecución por rubro
    const items = rubros.map((r) => {
      const cdpTotal = r.cdps.reduce((acc, cdp) => acc + (cdp.valor ?? 0), 0);
      const crpTotal = r.cdps.reduce(
        (acc, cdp) =>
          acc +
          cdp.crps.reduce((s, crp) => s + (crp.valor ?? 0), 0),
        0,
      );
      // "Obligado" = CRP emitidos (compromisos) que aún no son pagos.
      // "Pagado" = monto ejecutado (proxy: comprobantes de egreso asociados
      //   a CRPs que cuenten con afectación — aquí se asume 0 ya que el
      //   modelo Marsella no guarda FK directo CRP↔Egreso; el agente de
      //   presupuesto futuro lo puede ampliar con detalle de ordenes de pago).
      const obligado = crpTotal;
      const pagado = 0;
      const saldo = Math.max(0, r.apropiacionInicial - cdpTotal);
      const porcentajeEjecucion =
        r.apropiacionInicial > 0
          ? Math.min(100, (cdpTotal / r.apropiacionInicial) * 100)
          : 0;
      return {
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        tipo: r.tipo,
        nivel: r.nivel,
        cuentaPadreId: r.cuentaPadreId,
        apropiacionInicial: r.apropiacionInicial,
        cdpTotal,
        crpTotal,
        obligado,
        pagado,
        saldo,
        porcentajeEjecucion,
      };
    });

    // Totales
    const totales = items.reduce(
      (acc, it) => ({
        apropiacionInicial: acc.apropiacionInicial + it.apropiacionInicial,
        cdpTotal: acc.cdpTotal + it.cdpTotal,
        crpTotal: acc.crpTotal + it.crpTotal,
        obligado: acc.obligado + it.obligado,
        pagado: acc.pagado + it.pagado,
        saldo: acc.saldo + it.saldo,
      }),
      {
        apropiacionInicial: 0,
        cdpTotal: 0,
        crpTotal: 0,
        obligado: 0,
        pagado: 0,
        saldo: 0,
      },
    );

    return ok({ items, totales, vigencia });
  } catch (e) {
    return serverError("Error al obtener ejecución presupuestal", e);
  }
}
