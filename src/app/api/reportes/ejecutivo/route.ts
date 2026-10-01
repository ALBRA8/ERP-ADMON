import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { generarPDFReporteEjecutivo } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/ejecutivo
// Genera el PDF del reporte ejecutivo (dashboard en PDF).
// ============================================================
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  try {
    const pdfBuffer = await generarPDFReporteEjecutivo(session.empresaId);
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="reporte-ejecutivo-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/ejecutivo]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
