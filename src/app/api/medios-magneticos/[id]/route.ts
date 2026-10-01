// ============================================================
// MARSELLA ERP — API /api/medios-magneticos/[id]
// GET    : detalle del medio con todos sus registros (paginación ?page&pageSize)
// DELETE : elimina el medio y sus detalles
// ============================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
  forbidden,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { requireTenantAccess, auditAction } from "@/lib/tenant";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await ctx.params;

    // Validar tenant access
    const access = await requireTenantAccess(session, "medioMagnetico", id);
    if (!access.ok) {
      if (access.code === "NOT_FOUND") return notFound("Medio no encontrado");
      return forbidden(access.message);
    }

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 100) ?? 100;

    const medio = await db.medioMagnetico.findUnique({
      where: { id },
      include: {
        medioMagneticoDetalles: {
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        },
      },
    });
    if (!medio) return notFound("Medio no encontrado");

    const total = await db.medioMagneticoDetalle.count({
      where: { medioId: id },
    });
    const agg = await db.medioMagneticoDetalle.aggregate({
      where: { medioId: id },
      _sum: { valorRetenido: true, valorPago: true, baseRetencion: true },
    });

    return ok({
      medio,
      registros: medio.medioMagneticoDetalles,
      total,
      page,
      pageSize,
      totalRetenido: agg._sum.valorRetenido ?? 0,
      totalPago: agg._sum.valorPago ?? 0,
      totalBase: agg._sum.baseRetencion ?? 0,
    });
  } catch (e) {
    return serverError("Error al obtener medio magnético", e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await ctx.params;

    const access = await requireTenantAccess(session, "medioMagnetico", id);
    if (!access.ok) {
      if (access.code === "NOT_FOUND") return notFound("Medio no encontrado");
      return forbidden(access.message);
    }

    // Cascade elimina los detalles automáticamente
    await db.medioMagnetico.delete({ where: { id } });

    await auditAction(session, "eliminar_medio_magnetico", "medioMagnetico", id);

    return ok({ ok: true, id });
  } catch (e) {
    return serverError("Error al eliminar medio magnético", e);
  }
}
