import { NextRequest, NextResponse } from "next/server";
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
  if (!factura)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const empresa = await db.empresa.findUnique({
    where: { id: session.empresaId },
  });
  if (!empresa) return new Response("Empresa no encontrada", { status: 500 });

  try {
    // Serializar Decimal → number antes de pasar al generador PDF.
    const facturaPlain = {
      ...factura,
      subtotalBruto: Number(factura.subtotalBruto),
      descuentoTotal: Number(factura.descuentoTotal),
      subtotalNeto: Number(factura.subtotalNeto),
      totalIva: Number(factura.totalIva),
      totalImpoconsumo: Number(factura.totalImpoconsumo),
      total: Number(factura.total),
      saldoPendiente: Number(factura.saldoPendiente ?? 0),
      efectivoRecibido: factura.efectivoRecibido != null ? Number(factura.efectivoRecibido) : undefined,
      cambio: factura.cambio != null ? Number(factura.cambio) : undefined,
    };
    const pdfBuffer = await generarPDFFactura(facturaPlain as any, empresa);
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
