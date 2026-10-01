// ============================================================
// MARSELLA ERP — API /api/medios-magneticos/generar
// POST : genera un medio magnético con todos sus detalles
//        Body: { anio, formato, nombre? }
// Llama al generador correspondiente, crea MedioMagnetico + MedioMagneticoDetalle.
// ============================================================
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { getSession, hasPermission } from "@/lib/auth";
import {
  generarMedioMagnetico,
  NOMBRES_FORMATO,
  type CodigoFormatoDIAN,
} from "@/lib/medios-magneticos";
import { auditAction } from "@/lib/tenant";

const schema = z.object({
  anio: z.number().int().min(2010).max(2100),
  formato: z.enum(["1007", "2276", "2277", "1647", "2238"]),
  nombre: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // Cualquier rol con acceso a contabilidad/reportes puede generar medios
    if (!hasPermission(session.rol, "reportes:read") && session.rol !== "admin") {
      return forbidden("Sin permisos para generar medios magnéticos");
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const { anio, formato, nombre } = parsed.data;

    // Verificar que no exista ya un medio para ese año+formato
    const existing = await db.medioMagnetico.findUnique({
      where: {
        empresaId_anio_formato: {
          empresaId: session.empresaId,
          anio,
          formato,
        },
      },
    });
    if (existing) {
      return badRequest(
        `Ya existe un medio magnético para el año ${anio} formato ${formato}. Elimínelo primero si quiere regenerar.`,
      );
    }

    // Generar
    const resultado = await generarMedioMagnetico(
      session.empresaId,
      anio,
      formato as CodigoFormatoDIAN,
    );

    if (resultado.registros.length === 0) {
      return badRequest(
        `No se encontraron registros para el formato ${formato} del año ${anio}. Verifique que existan documentos con retenciones/IVA en el periodo.`,
      );
    }

    const ahora = new Date();
    const medio = await db.medioMagnetico.create({
      data: {
        empresaId: session.empresaId,
        anio,
        formato,
        nombre: nombre || NOMBRES_FORMATO[formato as CodigoFormatoDIAN],
        estado: "generado",
        fechaGeneracion: ahora,
        totalRegistros: resultado.totalRegistros,
        userId: session.userId,
        archivo: `formato-${formato}-${anio}.txt`,
        medioMagneticoDetalles: {
          createMany: {
            data: resultado.registros.map((r) => ({
              tipoDocExpedida: r.tipoDocExpedida || null,
              nitTercero: r.nitTercero,
              razonSocial: r.razonSocial,
              concepto: r.concepto,
              valorPago: r.valorPago,
              baseRetencion: r.baseRetencion,
              porcentaje: r.porcentaje,
              valorRetenido: r.valorRetenido,
              ciudad: r.ciudad ?? null,
            })),
          },
        },
      },
      include: {
        _count: { select: { medioMagneticoDetalles: true } },
      },
    });

    await auditAction(
      session,
      "generar_medio_magnetico",
      "medioMagnetico",
      medio.id,
      { anio, formato, totalRegistros: resultado.totalRegistros },
    );

    return ok({
      medio,
      totalRegistros: resultado.totalRegistros,
      totalRetenido: resultado.totalRetenido,
      totalPago: resultado.totalPago,
    });
  } catch (e) {
    return serverError("Error al generar medio magnético", e);
  }
}
