import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { generarPDFReciboCaja } from "@/lib/pdf";

// ============================================================
// GET /api/reportes/recibo/[id]
// Genera el PDF del recibo de caja (comprobante de ingreso).
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

  const recibo = await db.reciboCaja.findFirst({
    where: { id, empresaId: session.empresaId },
    include: { tercero: true },
  });
  if (!recibo)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const empresa = await db.empresa.findUnique({
    where: { id: session.empresaId },
  });
  if (!empresa) return new Response("Empresa no encontrada", { status: 500 });

  try {
    const pdfBuffer = await generarPDFReciboCaja(recibo, empresa);
    const disposition = download ? "attachment" : "inline";
    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="recibo-${recibo.numero}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[reportes/recibo]", e);
    return new Response(`Error al generar PDF: ${e?.message ?? e}`, {
      status: 500,
    });
  }
}
