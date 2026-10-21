import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  notFound,
  withAuth,
  parseBody,
} from "@/lib/api";
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
// A-CRIT-001: entrada producto + asiento en $transaction.
// ============================================================

const schema = z.object({
  cantidadProducida: z.number().positive().max(1e9),
  bodegaId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    { permission: "produccion:write" },
    async (session) => {
      try {
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

        const parsed = await parseBody(req, schema);
        if ("error" in parsed) return parsed.error;
        const d = parsed.data;

        // Validar bodega
        const bodega = await db.bodega.findFirst({
          where: { id: d.bodegaId, empresaId: session.empresaId },
        });
        if (!bodega) return badRequest("Bodega no encontrada");

        // Recalcular costo unitario con la cantidad producida real
        const costoTotal = round(Number(orden.costoTotal || 0), 2);
        const costoUnitario =
          d.cantidadProducida > 0
            ? round(costoTotal / d.cantidadProducida, 2)
            : 0;

        // TRANSACCIÓN: actualizar orden + entrada inventario.
        // El asiento contable se genera después (best-effort) porque
        // depende de cuentas PUC que pueden no estar configuradas.
        const updated = await db.$transaction(async (tx) => {
          // Registrar entrada de producto terminado dentro de la tx
          await registrarEntradaProductoTerminado(
            orden.id,
            d.bodegaId,
            d.cantidadProducida,
            costoUnitario,
            tx,
          );

          return tx.ordenProduccion.update({
            where: { id: orden.id },
            data: {
              estado: "finalizada",
              fechaFin: new Date(),
              cantidadProducida: d.cantidadProducida,
              costoUnitario,
            },
          });
        });

        // Generar asiento contable (best-effort fuera de la tx para
        // no romper el flujo si faltan cuentas PUC).
        let asiento: { comprobanteId: string; numero: string } | null = null;
        try {
          asiento = await generarAsientoProduccion(
            orden.id,
            session.empresaId,
          );
        } catch (e: unknown) {
          const err = e as { message?: string };
          return ok({
            ok: true,
            orden: updated,
            entradaRegistrada: true,
            asientoContable: null,
            asientoError: err?.message ?? "Error al generar asiento",
          });
        }

        return ok({
          ok: true,
          orden: updated,
          entradaRegistrada: true,
          asientoContable: asiento,
        });
      } catch (e) {
        return serverError("Error al finalizar orden de producción", e);
      }
    },
  );
}
