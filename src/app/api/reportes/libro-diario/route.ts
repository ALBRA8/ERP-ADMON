import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { generarPDFLibroDiario } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/libro-diario?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
// Genera el PDF del libro diario (comprobantes contabilizados en
// el rango de fechas).
// ============================================================
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const fi = url.searchParams.get("fechaInicio");
  const ff = url.searchParams.get("fechaFin");
  const download = url.searchParams.get("download") === "1";

  const fechaInicio = fi ? new Date(fi) : undefined;
  const fechaFin = ff ? new Date(ff + "T23:59:59") : undefined;

  try {
    const pdfBuffer = await generarPDFLibroDiario(
      session.empresaId,
      fechaInicio,
      fechaFin,
    );
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="libro-diario-${fi ?? "all"}-${ff ?? "all"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/libro-diario]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
