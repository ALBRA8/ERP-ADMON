import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, serverError, unauthorized, notFound } from "@/lib/api";

// GET /api/niif/reportes/[id] → devuelve un reporte guardado
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();
  try {
    const { id } = await params;
    const reporte = await db.reporteNIIF.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!reporte) return notFound("Reporte no encontrado");
    let parsed: any = null;
    try {
      parsed = JSON.parse(reporte.json_data ?? "{}");
    } catch {
      parsed = null;
    }
    return ok({ ...reporte, json_data: parsed });
  } catch (e: any) {
    return serverError(`Error obteniendo reporte: ${e?.message ?? e}`);
  }
}

// DELETE /api/niif/reportes/[id] → elimina un reporte guardado
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();
  try {
    const { id } = await params;
    const reporte = await db.reporteNIIF.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!reporte) return notFound("Reporte no encontrado");
    await db.reporteNIIF.delete({ where: { id } });
    return ok({ ok: true, id });
  } catch (e: any) {
    return serverError(`Error eliminando reporte: ${e?.message ?? e}`);
  }
}
