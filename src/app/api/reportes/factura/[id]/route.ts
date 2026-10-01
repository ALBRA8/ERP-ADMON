import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { generarPDFFactura } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/factura/[id]
// Genera el PDF de la factura electrónica.
// ?download=1 → fuerza descarga (attachment).
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

  const factura = await db.facturaVenta.findFirst({
    where: { id, empresaId: session.empresaId },
    include: {
      detalles: { orderBy: { id: "asc" } },
      tercero: true,
    },
  });
  if (!factura) return new Response("Not found", { status: 404 });

  const empresa = await db.empresa.findUnique({
    where: { id: session.empresaId },
  });
  if (!empresa) return new Response("Empresa no encontrada", { status: 500 });

  try {
    const pdfBuffer = await generarPDFFactura(factura, empresa);
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="factura-${factura.numero}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/factura]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
