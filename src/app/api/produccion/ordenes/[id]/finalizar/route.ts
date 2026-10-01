import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";
import {
  registrarEntradaProductoTerminado,
  generarAsientoProduccion,
} from "@/lib/produccion";

// ============================================================
// POST /api/produccion/ordenes/[id]/finalizar
// Body: { cantidadProducida, bodegaId }
// Cambia estado a "finalizada", set fechaFin = now().
// Registra entrada del producto terminado y genera asiento contable.
// ============================================================

const schema = z.object({
  cantidadProducida: z.number().positive(),
  bodegaId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenProduccion.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!orden) return notFound("Orden de producción no encontrada");

    if (orden.estado !== "en_proceso") {
      return badRequest(
        `La orden debe estar en estado "en_proceso" para finalizar (estado actual: ${orden.estado})`,
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    // Validar bodega
    const bodega = await db.bodega.findFirst({
      where: { id: d.bodegaId, empresaId: session.empresaId },
    });
    if (!bodega) return badRequest("Bodega no encontrada");

    // Recalcular costo unitario con la cantidad producida real
    const costoTotal = round(orden.costoTotal || 0, 2);
    const costoUnitario =
      d.cantidadProducida > 0
        ? round(costoTotal / d.cantidadProducida, 2)
        : 0;

    // Registrar entrada de producto terminado
    const entrada = await registrarEntradaProductoTerminado(
      orden.id,
      d.bodegaId,
      d.cantidadProducida,
      costoUnitario,
    );

    // Actualizar orden
    const updated = await db.ordenProduccion.update({
      where: { id: orden.id },
      data: {
        estado: "finalizada",
        fechaFin: new Date(),
        cantidadProducida: d.cantidadProducida,
        costoUnitario,
      },
    });

    // Generar asiento contable
    let asiento: { comprobanteId: string; numero: string } | null = null;
    try {
      asiento = await generarAsientoProduccion(orden.id, session.empresaId);
    } catch (e: any) {
      // Si falla la generación del asiento (ej: faltan cuentas PUC), no
      // revierte la entrada pero reporta el error al cliente.
      return ok({
        ok: true,
        orden: updated,
        entradaRegistrada: entrada.registrado,
        asientoContable: null,
        asientoError: e?.message ?? "Error al generar asiento",
      });
    }

    return ok({
      ok: true,
      orden: updated,
      entradaRegistrada: entrada.registrado,
      asientoContable: asiento,
    });
  } catch (e) {
    return serverError("Error al finalizar orden de producción", e);
  }
}
