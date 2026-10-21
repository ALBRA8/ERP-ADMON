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
import { reversarSalidasMateriasPrimas } from "@/lib/produccion";

// ============================================================
// POST /api/produccion/ordenes/[id]/anular
// Body: { bodegaId } (requerido si hubo salidas para revertirlas)
// Cambia estado a "anulada". No permite anular si ya finalizada.
// Reversa salidas de materias primas si la orden estaba "en_proceso".
// ============================================================

const schema = z.object({
  bodegaId: z.string().nullish(),
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

    if (orden.estado === "finalizada") {
      return badRequest("No se puede anular una orden finalizada");
    }
    if (orden.estado === "anulada") {
      return badRequest("La orden ya está anulada");
    }

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    // Si estaba en_proceso, reversar salidas (requiere bodegaId)
    let reversion = { reversados: 0, totalCosto: 0 };
    if (orden.estado === "en_proceso") {
      if (!d.bodegaId) {
        return badRequest(
          "Se requiere bodegaId para reversar las salidas de materia prima registradas (la orden estaba en_proceso)",
        );
      }
      // Validar bodega
      const bodega = await db.bodega.findFirst({
        where: { id: d.bodegaId, empresaId: session.empresaId },
      });
      if (!bodega) return badRequest("Bodega no encontrada");
      reversion = await reversarSalidasMateriasPrimas(orden.id, d.bodegaId);
    }

    const updated = await db.ordenProduccion.update({
      where: { id: orden.id },
      data: { estado: "anulada" },
    });

    return ok({
      ok: true,
      orden: updated,
      reversion,
    });
  } catch (e) {
    return serverError("Error al anular orden de producción", e);
  }
}
