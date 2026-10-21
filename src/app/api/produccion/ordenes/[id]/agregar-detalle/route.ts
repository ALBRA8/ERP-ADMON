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
import { calcularCostoProduccion } from "@/lib/produccion";

// ============================================================
// POST /api/produccion/ordenes/[id]/agregar-detalle
// Body: { tipo, productoId?, descripcion, cantidad, costoUnitario }
// Calcula subtotal = cantidad * costoUnitario. Recalcula
// costoMateriaPrima / costoManoObra / costoIndirectos / costoTotal.
// ============================================================

const schema = z.object({
  tipo: z.enum(["materia_prima", "mano_obra", "costo_indirecto"]),
  productoId: z.string().nullish(),
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  costoUnitario: z.number().nonnegative().default(0),
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
      include: { detalles: true },
    });
    if (!orden) return notFound("Orden de producción no encontrada");

    if (orden.estado === "finalizada" || orden.estado === "anulada") {
      return badRequest(
        `No se pueden agregar detalles a una orden ${orden.estado}`,
      );
    }

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    // Validar producto si viene
    if (d.productoId) {
      const p = await db.producto.findFirst({
        where: { id: d.productoId, empresaId: session.empresaId },
      });
      if (!p) return badRequest("Producto no encontrado");
    }

    const subtotal = round(d.cantidad * d.costoUnitario, 2);

    const detalle = await db.detalleOrdenProduccion.create({
      data: {
        ordenId: orden.id,
        empresaId: session.empresaId,
        tipo: d.tipo,
        productoId: d.productoId ?? null,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        costoUnitario: d.costoUnitario,
        subtotal,
      },
    });

    // Recalcular totales
    const detalles = [...orden.detalles, detalle];
    const costoMateriaPrima = round(
      detalles
        .filter((x) => x.tipo === "materia_prima")
        .reduce((s, x) => s + x.subtotal, 0),
      2,
    );
    const costoManoObra = round(
      detalles
        .filter((x) => x.tipo === "mano_obra")
        .reduce((s, x) => s + x.subtotal, 0),
      2,
    );
    const costoIndirectos = round(
      detalles
        .filter((x) => x.tipo === "costo_indirecto")
        .reduce((s, x) => s + x.subtotal, 0),
      2,
    );
    const calc = calcularCostoProduccion({
      costoMateriaPrima,
      costoManoObra,
      costoIndirectos,
      cantidadProducida: orden.cantidadProducida,
    });

    const updated = await db.ordenProduccion.update({
      where: { id: orden.id },
      data: {
        costoMateriaPrima,
        costoManoObra,
        costoIndirectos,
        costoTotal: calc.costoTotal,
        costoUnitario: calc.costoUnitario,
      },
    });

    return ok({
      ok: true,
      detalle,
      orden: updated,
      costoMateriaPrima,
      costoManoObra,
      costoIndirectos,
      costoTotal: calc.costoTotal,
      costoUnitario: calc.costoUnitario,
    });
  } catch (e) {
    return serverError("Error al agregar detalle a la orden", e);
  }
}
