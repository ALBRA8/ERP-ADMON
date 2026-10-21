// ============================================================
// MARSELLA ERP — API /api/resolucion-dian
// GET  : lista resoluciones DIAN de la empresa de la sesión
// POST : crea nueva resolución DIAN (sólo admin / contador)
// Valida sesión con getSession() y filtra SIEMPRE por empresaId.
// ============================================================
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { getSession, hasPermission } from "@/lib/auth";

// ---------- GET ----------
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const resoluciones = await db.resolucionDian.findMany({
      where: { empresaId: session.empresaId },
      orderBy: [{ activa: "desc" }, { fechaResolucion: "desc" }],
    });

    // Normalizar nombres de campos (DB usa minúsculas: rangoinicio, rangoinicioActual)
    const out = resoluciones.map((r) => ({
      id: r.id,
      empresaId: r.empresaId,
      numeroResolucion: r.numeroResolucion,
      fechaResolucion: r.fechaResolucion,
      fechaInicioVigencia: r.fechaInicioVigencia,
      fechaFinVigencia: r.fechaFinVigencia,
      prefijo: r.prefijo,
      rangoInicio: r.rangoinicio,
      rangoFin: r.rangoFin,
      rangoInicioActual: r.rangoinicioActual,
      rangoFinActual: r.rangoFinActual,
      consecutivoSiguiente: r.consecutivoSiguiente,
      tipoOperacion: r.tipoOperacion,
      ambiente: r.ambiente,
      activa: r.activa,
      createdAt: r.createdAt,
    }));

    return ok(out);
  } catch (e) {
    return serverError("Error al listar resoluciones DIAN", e);
  }
}

// ---------- POST ----------
const resolucionSchema = z.object({
  numeroResolucion: z.string().min(3),
  fechaResolucion: z.string().min(1), // ISO date
  fechaInicioVigencia: z.string().min(1),
  fechaFinVigencia: z.string().min(1),
  prefijo: z.string().min(1).max(8),
  rangoInicio: z.number().int().min(1),
  rangoFin: z.number().int().min(1),
  tipoOperacion: z
    .enum(["estandar", "pos", "exportacion", "no_dian"])
    .default("estandar"),
  ambiente: z.enum(["pruebas", "produccion"]).default("produccion"),
  activa: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // Escribir resolución: requiere parámetros (admin)
    if (!hasPermission(session.rol, "parametros:read")) {
      return forbidden("Su rol no permite gestionar resoluciones DIAN");
    }

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = resolucionSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    if (d.rangoFin <= d.rangoInicio) {
      return badRequest("rangoFin debe ser mayor que rangoInicio");
    }
    if (new Date(d.fechaFinVigencia) <= new Date(d.fechaInicioVigencia)) {
      return badRequest("fechaFinVigencia debe ser mayor que fechaInicioVigencia");
    }

    // Si la nueva queda activa, desactivar las demás para evitar
    // ambigüedad en consecutivo.
    if (d.activa) {
      await db.resolucionDian.updateMany({
        where: { empresaId: session.empresaId, activa: true },
        data: { activa: false },
      });
    }

    const creada = await db.resolucionDian.create({
      data: {
        empresaId: session.empresaId,
        numeroResolucion: d.numeroResolucion,
        fechaResolucion: new Date(d.fechaResolucion),
        fechaInicioVigencia: new Date(d.fechaInicioVigencia),
        fechaFinVigencia: new Date(d.fechaFinVigencia),
        prefijo: d.prefijo,
        rangoinicio: d.rangoInicio,
        rangoFin: d.rangoFin,
        rangoinicioActual: d.rangoInicio,
        rangoFinActual: d.rangoFin,
        consecutivoSiguiente: d.rangoInicio,
        tipoOperacion: d.tipoOperacion,
        ambiente: d.ambiente,
        activa: d.activa,
      },
    });

    return ok({
      id: creada.id,
      empresaId: creada.empresaId,
      numeroResolucion: creada.numeroResolucion,
      fechaResolucion: creada.fechaResolucion,
      fechaInicioVigencia: creada.fechaInicioVigencia,
      fechaFinVigencia: creada.fechaFinVigencia,
      prefijo: creada.prefijo,
      rangoInicio: creada.rangoinicio,
      rangoFin: creada.rangoFin,
      rangoInicioActual: creada.rangoinicioActual,
      rangoFinActual: creada.rangoFinActual,
      consecutivoSiguiente: creada.consecutivoSiguiente,
      tipoOperacion: creada.tipoOperacion,
      ambiente: creada.ambiente,
      activa: creada.activa,
      createdAt: creada.createdAt,
    });
  } catch (e) {
    return serverError("Error al crear resolución DIAN", e);
  }
}
