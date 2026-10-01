import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { generarPDFLibroMayor } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/mayor?cuentaId=X&fechaInicio=...&fechaFin=...
// Genera el PDF del libro mayor de una cuenta.
// ============================================================
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const cuentaId = url.searchParams.get("cuentaId");
  const fi = url.searchParams.get("fechaInicio");
  const ff = url.searchParams.get("fechaFin");
  const download = url.searchParams.get("download") === "1";

  if (!cuentaId)
    return new Response("cuentaId requerido", { status: 400 });

  const fechaInicio = fi ? new Date(fi) : undefined;
  const fechaFin = ff ? new Date(ff + "T23:59:59") : undefined;

  try {
    const pdfBuffer = await generarPDFLibroMayor(
      cuentaId,
      session.empresaId,
      fechaInicio,
      fechaFin,
    );
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="libro-mayor-${cuentaId.slice(-6)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/mayor]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
