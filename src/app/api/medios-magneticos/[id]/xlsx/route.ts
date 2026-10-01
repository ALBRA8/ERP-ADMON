// ============================================================
// MARSELLA ERP — API /api/medios-magneticos/[id]/xlsx
// GET : devuelve archivo .xlsx con info del medio magnético
//        Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// ============================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  serverError,
  unauthorized,
  notFound,
  forbidden,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { requireTenantAccess } from "@/lib/tenant";
import {
  generarArchivoXLSX,
  type RegistroMedio,
} from "@/lib/medios-magneticos";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await ctx.params;

    const access = await requireTenantAccess(session, "medioMagnetico", id);
    if (!access.ok) {
      if (access.code === "NOT_FOUND") return notFound("Medio no encontrado");
      return forbidden(access.message);
    }

    const medio = await db.medioMagnetico.findUnique({
      where: { id },
      include: { medioMagneticoDetalles: true },
    });
    if (!medio) return notFound("Medio no encontrado");

    const empresa = await db.empresa.findUnique({
      where: { id: session.empresaId },
      select: { nit: true, razonSocial: true },
    });

    const registros: RegistroMedio[] = medio.medioMagneticoDetalles.map(
      (d) => ({
        tipoDocExpedida: d.tipoDocExpedida ?? "NIT",
        nitTercero: d.nitTercero,
        razonSocial: d.razonSocial,
        concepto: d.concepto,
        valorPago: d.valorPago,
        baseRetencion: d.baseRetencion,
        porcentaje: d.porcentaje,
        valorRetenido: d.valorRetenido,
        ciudad: d.ciudad,
      }),
    );

    const buffer = await generarArchivoXLSX(
      {
        formato: medio.formato,
        anio: medio.anio,
        nombre: medio.nombre,
        fechaGeneracion: medio.fechaGeneracion,
        totalRegistros: medio.totalRegistros,
      },
      registros,
      empresa
        ? { nit: empresa.nit, razonSocial: empresa.razonSocial }
        : null,
    );

    const filename = `formato-${medio.formato}-${medio.anio}.xlsx`;
    return new Response(buffer as any, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    return serverError("Error al generar XLSX", e);
  }
}
