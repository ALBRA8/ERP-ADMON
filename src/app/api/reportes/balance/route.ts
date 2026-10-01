import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { generarPDFBalancePrueba } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/balance
// Genera el PDF del balance de prueba (todas las cuentas con
// débitos/créditos/saldos).
// ============================================================
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  try {
    const pdfBuffer = await generarPDFBalancePrueba(session.empresaId);
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="balance-prueba-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/balance]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
