// ============================================================
// MARSELLA ERP — API /api/medios-magneticos
// GET  : lista medios magnéticos con filtros (?anio&formato&page&pageSize)
// ============================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const anio = getQueryInt(req, "anio");
    const formato = getQuery(req, "formato");
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

    const where: any = { empresaId: session.empresaId };
    if (anio) where.anio = anio;
    if (formato) where.formato = formato;

    const [items, total] = await Promise.all([
      db.medioMagnetico.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { medioMagneticoDetalles: true } },
        },
      }),
      db.medioMagnetico.count({ where }),
    ]);

    // Calcular total retenido por medio (suma de MedioMagneticoDetalle.valorRetenido)
    const itemsConTotal = await Promise.all(
      items.map(async (m) => {
        const agg = await db.medioMagneticoDetalle.aggregate({
          where: { medioId: m.id },
          _sum: { valorRetenido: true, valorPago: true },
        });
        return {
          ...m,
          totalRetenido: agg._sum.valorRetenido ?? 0,
          totalPago: agg._sum.valorPago ?? 0,
          totalDetalles: m._count.medioMagneticoDetalles,
        };
      }),
    );

    return ok({ items: itemsConTotal, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar medios magnéticos", e);
  }
}
