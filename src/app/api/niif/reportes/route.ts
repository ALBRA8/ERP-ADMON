import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
} from "@/lib/api";

// GET /api/niif/reportes?tipo=...&fechaInicio=...&fechaFin=...
// Lista los ReporteNIIF guardados con filtros opcionales.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  try {
    const tipo = getQuery(req, "tipo");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");

    const where: any = { empresaId: session.empresaId };
    if (tipo) where.tipo = tipo;
    if (fechaInicio || fechaFin) {
      where.fechaFin = {};
      if (fechaInicio) where.fechaFin.gte = new Date(fechaInicio);
      if (fechaFin) where.fechaFin.lte = new Date(fechaFin);
    }

    const items = await db.reporteNIIF.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Para cada item, contamos el número de registros del json_data
    const enriched = items.map((r) => {
      let totalRegistros = 0;
      try {
        const parsed = JSON.parse(r.json_data ?? "{}");
        if (r.tipo === "ESF") {
          totalRegistros =
            (parsed?.activo?.corriente?.lineas?.length ?? 0) +
            (parsed?.activo?.no_corriente?.lineas?.length ?? 0) +
            (parsed?.activo?.inventarios?.lineas?.length ?? 0) +
            (parsed?.activo?.clientes?.lineas?.length ?? 0) +
            (parsed?.activo?.efectivo?.lineas?.length ?? 0) +
            (parsed?.pasivo?.corriente?.lineas?.length ?? 0) +
            (parsed?.pasivo?.no_corriente?.lineas?.length ?? 0) +
            (parsed?.patrimonio?.lineas?.length ?? 0);
        } else if (r.tipo === "EER") {
          totalRegistros =
            (parsed?.ingresos?.length ?? 0) +
            (parsed?.costosVenta?.length ?? 0) +
            (parsed?.gastosAdmin?.length ?? 0) +
            (parsed?.costosProduccion?.length ?? 0) +
            (parsed?.otrosIngresos?.length ?? 0) +
            (parsed?.otrosGastos?.length ?? 0);
        } else if (r.tipo === "ECP") {
          totalRegistros =
            (parsed?.aumentos?.length ?? 0) +
            (parsed?.reducciones?.length ?? 0);
        } else if (r.tipo === "EFE") {
          totalRegistros =
            (parsed?.flujosOperacion?.length ?? 0) +
            (parsed?.flujosInversion?.length ?? 0) +
            (parsed?.flujosFinanciacion?.length ?? 0);
        }
      } catch {
        totalRegistros = 0;
      }
      return {
        ...r,
        totalRegistros,
      };
    });

    return ok({ items: enriched, total: enriched.length });
  } catch (e: any) {
    return serverError(`Error listando reportes: ${e?.message ?? e}`);
  }
}

// POST /api/niif/reportes → crea un nuevo reporte guardado
// (mismo comportamiento que /api/niif/guardar)
const crearSchema = z.object({
  tipo: z.enum(["ESF", "EER", "ECP", "EFE", "Notas"]),
  periodo: z.enum(["anual", "trimestral", "mensual"]).default("anual"),
  fechaInicio: z.string(),
  fechaFin: z.string(),
  json_data: z.record(z.string(), z.any()),
  archivo: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  try {
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = crearSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const { tipo, periodo, fechaInicio, fechaFin, json_data, archivo } = parsed.data;
    const reporte = await db.reporteNIIF.create({
      data: {
        empresaId: session.empresaId,
        tipo,
        periodo,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        json_data: JSON.stringify(json_data),
        archivo: archivo ?? null,
        userId: session.userId,
      },
    });
    return ok(reporte);
  } catch (e: any) {
    return serverError(`Error creando reporte NIIF: ${e?.message ?? e}`);
  }
}
