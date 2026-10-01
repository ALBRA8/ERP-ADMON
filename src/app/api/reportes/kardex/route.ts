import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { generarPDFKardex } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/kardex?productoId=X&bodegaId=Y&fechaInicio=...&fechaFin=...
// Genera el PDF del kardex valorizado.
// ============================================================
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const productoId = url.searchParams.get("productoId");
  const bodegaId = url.searchParams.get("bodegaId") || undefined;
  const fi = url.searchParams.get("fechaInicio");
  const ff = url.searchParams.get("fechaFin");
  const download = url.searchParams.get("download") === "1";

  if (!productoId)
    return new Response("productoId requerido", { status: 400 });

  const fechaInicio = fi ? new Date(fi) : undefined;
  const fechaFin = ff ? new Date(ff + "T23:59:59") : undefined;

  try {
    const pdfBuffer = await generarPDFKardex(
      productoId,
      session.empresaId,
      bodegaId,
      fechaInicio,
      fechaFin,
    );
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="kardex-${productoId.slice(-6)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/kardex]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
