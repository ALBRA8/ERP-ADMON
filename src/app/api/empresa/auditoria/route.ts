// ============================================================
// MARSELLA ERP — API /api/empresa/auditoria
// GET : lista logs de AuditoriaMultiTenant con paginación + filtros
//      ?fechaInicio&fechaFin&accion&page&pageSize
// ============================================================
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

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const accion = getQuery(req, "accion");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

    const where: any = { empresaId: session.empresaId };
    if (accion) where.accion = accion;
    if (fechaInicio || fechaFin) {
      where.createdAt = {};
      if (fechaInicio) {
        where.createdAt.gte = new Date(fechaInicio);
      }
      if (fechaFin) {
        // Incluir todo el día de fechaFin
        const f = new Date(fechaFin);
        f.setHours(23, 59, 59, 999);
        where.createdAt.lte = f;
      }
    }

    const [items, total, acciones] = await Promise.all([
      db.auditoriaMultiTenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.auditoriaMultiTenant.count({ where }),
      db.auditoriaMultiTenant.findMany({
        where: { empresaId: session.empresaId },
        select: { accion: true },
        distinct: ["accion"],
        orderBy: { accion: "asc" },
      }),
    ]);

    return ok({
      items,
      total,
      page,
      pageSize,
      accionesDisponibles: acciones.map((a) => a.accion),
    });
  } catch (e) {
    return serverError("Error al listar auditoría", e);
  }
}
