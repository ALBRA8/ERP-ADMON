import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQuery, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/contabilidad/cierre
//   Lista los cierres de período contable de la empresa.
//   Filtros: ?anio=2026  |  ?estado=cerrado  |  paginación
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const anio = getQueryInt(req, "anio");
    const estado = getQuery(req, "estado");
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

    const where: any = { empresaId: session.empresaId };
    if (anio) where.anio = anio;
    if (estado) where.estado = estado;

    const [items, total] = await Promise.all([
      db.cierrePeriodo.findMany({
        where,
        orderBy: [{ anio: "desc" }, { mes: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.cierrePeriodo.count({ where }),
    ]);
    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar cierres", e);
  }
}

const cierreSchema = z.object({
  anio: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(0).max(12), // 0 = cierre anual
  tipo: z.enum(["mensual", "anual"]).default("mensual"),
  observaciones: z.string().optional(),
});

// ============================================================
// POST /api/contabilidad/cierre
//   Crea (o actualiza) un cierre de período contable.
//   Body: { anio, mes, tipo, observaciones? }
//   Si ya existe un cierre para (empresaId, anio, mes), lo marca
//   como "cerrado" actualizando observaciones y fechaCierre.
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = cierreSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;
    if (data.tipo === "mensual" && (data.mes < 1 || data.mes > 12)) {
      return badRequest("Para cierre mensual, mes debe estar entre 1 y 12");
    }
    if (data.tipo === "anual" && data.mes !== 0) {
      return badRequest("Para cierre anual, mes debe ser 0");
    }

    const existing = await db.cierrePeriodo.findUnique({
      where: {
        empresaId_anio_mes: {
          empresaId: session.empresaId,
          anio: data.anio,
          mes: data.mes,
        },
      },
    });

    if (existing) {
      const updated = await db.cierrePeriodo.update({
        where: { id: existing.id },
        data: {
          estado: "cerrado",
          fechaCierre: new Date(),
          observaciones: data.observaciones ?? existing.observaciones,
          tipo: data.tipo,
        },
      });
      return ok(updated);
    }

    const cierre = await db.cierrePeriodo.create({
      data: {
        empresaId: session.empresaId,
        anio: data.anio,
        mes: data.mes,
        tipo: data.tipo,
        estado: "cerrado",
        fechaCierre: new Date(),
        observaciones: data.observaciones,
        userId: session.userId,
      },
    });
    return ok(cierre);
  } catch (e) {
    return serverError("Error al crear cierre", e);
  }
}
