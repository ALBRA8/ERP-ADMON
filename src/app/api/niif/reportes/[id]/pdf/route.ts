import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  ok,
  serverError,
  unauthorized,
  notFound,
  badRequest,
} from "@/lib/api";
import {
  generarPDFESF,
  generarPDFEER,
  generarPDFECP,
  generarPDFFE,
} from "@/lib/pdf";

// GET /api/niif/reportes/[id]/pdf
// Genera el PDF del reporte guardado según su tipo (ESF/EER/ECP/EFE).
// Content-Type: application/pdf
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();
  try {
    const { id } = await params;
    const reporte = await db.reporteNIIF.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!reporte) return notFound("Reporte no encontrado");

    const url = new URL(req.url);
    const download = url.searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";

    let pdfBuffer: Buffer;
    let filename: string;

    const fechaInicio = reporte.fechaInicio.toISOString().slice(0, 10);
    const fechaFin = reporte.fechaFin.toISOString().slice(0, 10);

    switch (reporte.tipo) {
      case "ESF":
        pdfBuffer = await generarPDFESF(session.empresaId, fechaFin);
        filename = `ESF-${fechaFin}.pdf`;
        break;
      case "EER":
        pdfBuffer = await generarPDFEER(session.empresaId, fechaInicio, fechaFin);
        filename = `EER-${fechaInicio}-${fechaFin}.pdf`;
        break;
      case "ECP":
        pdfBuffer = await generarPDFECP(session.empresaId, fechaInicio, fechaFin);
        filename = `ECP-${fechaInicio}-${fechaFin}.pdf`;
        break;
      case "EFE":
        pdfBuffer = await generarPDFFE(session.empresaId, fechaInicio, fechaFin);
        filename = `EFE-${fechaInicio}-${fechaFin}.pdf`;
        break;
      default:
        return badRequest(`Tipo de reporte no soportado para PDF: ${reporte.tipo}`);
    }

    return new Response(pdfBuffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return serverError(`Error generando PDF NIIF: ${e?.message ?? e}`);
  }
}
