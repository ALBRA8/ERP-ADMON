import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { generarPDFNomina } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/nomina/[id]
// Genera el PDF del comprobante de nómina.
// ============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  // Pre-validar existencia + pertenencia a la empresa
  const existe = await db.nomina.findFirst({
    where: { id, empresaId: session.empresaId },
    select: { id: true },
  });
  if (!existe) return new Response("Not found", { status: 404 });

  try {
    const pdfBuffer = await generarPDFNomina(id, session.empresaId);
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="nomina-${id.slice(-6)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/nomina]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
