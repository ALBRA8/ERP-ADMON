import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, serverError, unauthorized, notFound } from "@/lib/api";

// ============================================================
// GET /api/dian/envios/[id]
// Detalle de un envío específico con respuesta DIAN (parsed JSON) y
// XML firmado (para inspección / debugging).
// ============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const envio = await db.dIANEnvio.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!envio) return notFound("Envío DIAN no encontrado");

    // Parsear respuestaDian si es JSON válido
    let respuestaDian: any = null;
    if (envio.respuestaDian) {
      try {
        respuestaDian = JSON.parse(envio.respuestaDian);
      } catch {
        respuestaDian = { raw: envio.respuestaDian };
      }
    }

    return ok({
      ...envio,
      respuestaDian,
    });
  } catch (e) {
    return serverError("Error al leer envío DIAN", e);
  }
}
