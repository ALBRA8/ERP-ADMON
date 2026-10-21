import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";

// POST /api/niif/guardar
// Persiste un ReporteNIIF con { tipo, periodo, fechaInicio, fechaFin, json_data }
// y opcionalmente `archivo` (path/url del PDF si ya se generó)
const guardarSchema = z.object({
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
    const parsed = guardarSchema.safeParse(body);
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
    return serverError(`Error guardando reporte NIIF: ${e?.message ?? e}`);
  }
}

// GET /api/niif/guardar → alias para listar reportes guardados
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  try {
    const items = await db.reporteNIIF.findMany({
      where: { empresaId: session.empresaId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({ items, total: items.length });
  } catch (e: any) {
    return serverError(`Error listando reportes NIIF: ${e?.message ?? e}`);
  }
}
