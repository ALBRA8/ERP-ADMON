import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  serverError,
  unauthorized,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/cafetero/pruebas-taza
// Lista todas las pruebas de taza de la empresa, opcionalmente
// filtradas por puntaje mínimo (?min=80) y paginación.
// Incluye controlCalidadId y la compra asociada vía lookup.
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const min = getQueryInt(req, "min");

    const where: any = { empresaId: session.empresaId };
    if (min !== undefined) where.puntajeTotal = { gte: min };

    const [items, total] = await Promise.all([
      db.pruebaTaza.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.pruebaTaza.count({ where }),
    ]);

    // Para cada prueba, lookup del controlCalidad y compra asociada
    const ccIds = items.map((p) => p.controlCalidadId).filter(Boolean) as string[];
    const controles = ccIds.length
      ? await db.controlCalidadCafe.findMany({
          where: { id: { in: ccIds } },
          select: { id: true, compraCafeId: true, compraCafe: true },
        })
      : [];
    const ccMap = new Map(controles.map((c) => [c.id, c]));

    const enriched = items.map((p) => {
      const cc = p.controlCalidadId ? ccMap.get(p.controlCalidadId) ?? null : null;
      return {
        ...p,
        controlCalidad: cc,
        compra: cc?.compraCafe ?? null,
      };
    });

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar pruebas de taza", e);
  }
}
