import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
  getQueryInt,
} from "@/lib/api";

// ============================================================
// GET /api/dian/envios
// Lista envíos DIAN con paginación y filtros (estado, fecha desde/hasta,
// tipo documento, búsqueda por CUFE o trackId).
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 25) ?? 25;
    const estado = getQuery(req, "estado");
    const tipoDocumento = getQuery(req, "tipoDocumento");
    const fechaDesde = getQuery(req, "fechaDesde");
    const fechaHasta = getQuery(req, "fechaHasta");
    const q = getQuery(req, "q");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (tipoDocumento) where.tipoDocumento = tipoDocumento;
    if (fechaDesde || fechaHasta) {
      where.createdAt = {};
      if (fechaDesde) where.createdAt.gte = new Date(fechaDesde);
      if (fechaHasta) where.createdAt.lte = new Date(fechaHasta + "T23:59:59");
    }
    if (q) {
      where.OR = [
        { cufe: { contains: q } },
        { trackId: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      db.dIANEnvio.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.dIANEnvio.count({ where }),
    ]);

    // No incluir xmlFirmado en la lista (puede ser muy grande). Solo en el detalle.
    const light = items.map((e) => ({
      id: e.id,
      facturaId: e.facturaId,
      nominaId: e.nominaId,
      tipoDocumento: e.tipoDocumento,
      cufe: e.cufe,
      trackId: e.trackId,
      estado: e.estado,
      intentos: e.intentos,
      maxIntentos: e.maxIntentos,
      proximoIntento: e.proximoIntento,
      mensajeError: e.mensajeError,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    return ok({ items: light, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar envíos DIAN", e);
  }
}

export async function POST() {
  return badRequest("Use GET para listar envíos");
}
