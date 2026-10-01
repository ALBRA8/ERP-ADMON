// ============================================================
// /api/mcp/logs — Log de auditoría de invocaciones MCP
// ============================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, serverError, unauthorized, getQuery, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = Math.min(getQueryInt(req, "pageSize", 50) ?? 50, 200);
    const conexionId = getQuery(req, "conexionId");
    const direccion = getQuery(req, "direccion"); // inbound | outbound
    const tipo = getQuery(req, "tipo"); // resource | tool | prompt
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");

    const where: any = { empresaId: session.empresaId };
    if (conexionId) where.conexionId = conexionId;
    if (direccion) where.direccion = direccion;
    if (tipo) where.tipo = tipo;
    if (fechaInicio || fechaFin) {
      where.createdAt = {};
      if (fechaInicio) where.createdAt.gte = new Date(fechaInicio);
      if (fechaFin) where.createdAt.lte = new Date(fechaFin);
    }

    const [items, total] = await Promise.all([
      db.mCPLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { conexion: { select: { nombre: true, endpoint: true } } },
      }),
      db.mCPLog.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar logs MCP", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // Borra logs > 90 días
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await db.mCPLog.deleteMany({
      where: { empresaId: session.empresaId, createdAt: { lt: cutoff } },
    });
    return ok({ deleted: result.count });
  } catch (e) {
    return serverError("Error al limpiar logs MCP", e);
  }
}
// trigger reload 1790817436
