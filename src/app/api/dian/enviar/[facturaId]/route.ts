import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { enviarFacturaADian } from "@/lib/dian-real";

// ============================================================
// POST /api/dian/enviar/[facturaId]
// Toma una factura existente, firma el XML con el certificado,
// envía a DIAN, registra en DIANEnvio, actualiza FacturaVenta.estadoDIAN.
// Si falla, programa reintento en DIANEnvio.proximoIntento.
// ============================================================
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ facturaId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { facturaId } = await params;
    if (!facturaId) return badRequest("facturaId requerido");

    const result = await enviarFacturaADian(facturaId, session.empresaId);
    if (!result.ok) {
      // Si la factura no se encontró
      if (result.mensaje === "Factura no encontrada") {
        return notFound(result.mensaje);
      }
      // Errores esperables (no config, sin CUFE): 400 con mensaje útil
      return badRequest(result.mensaje ?? "Error de envío DIAN");
    }
    return ok(result);
  } catch (e: any) {
    return serverError("Error al enviar factura a DIAN", e);
  }
}
