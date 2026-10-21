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

// ============================================================
// POST /api/taller/ordenes/[id]/agregar-detalle
// Body: { tipo: 'repuesto'|'mano_obra'|'insumo', descripcion, cantidad, precioUnitario }
// Calcula subtotal = cantidad * precioUnitario. Recalcula
// valorRepuestos / valorManoObra / valorTotal.
// ============================================================

const schema = z.object({
  tipo: z.enum(["repuesto", "mano_obra", "insumo"]),
  descripcion: z.string().min(2),
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenServicioTecnico.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { detalleServicioTecnicos: true },
    });
    if (!orden) return notFound("Orden de servicio no encontrada");

    if (orden.estado === "entregado" || orden.estado === "anulado") {
      return badRequest(
        `No se pueden agregar detalles a una orden ${orden.estado}`,
      );
    }

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    const subtotal = d.cantidad * d.precioUnitario;

    const detalle = await db.detalleServicioTecnico.create({
      data: {
        ordenId: orden.id,
        empresaId: session.empresaId,
        tipo: d.tipo,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario,
        subtotal,
      },
    });

    // Recalcular totales
    const detalles = [...orden.detalleServicioTecnicos, detalle];
    const valorRepuestos = detalles
      .filter((x) => x.tipo === "repuesto")
      .reduce((s, x) => s + x.subtotal, 0);
    const valorManoObra = detalles
      .filter((x) => x.tipo === "mano_obra")
      .reduce((s, x) => s + x.subtotal, 0);
    const valorInsumos = detalles
      .filter((x) => x.tipo === "insumo")
      .reduce((s, x) => s + x.subtotal, 0);
    const valorTotal = valorRepuestos + valorManoObra + valorInsumos;

    const updated = await db.ordenServicioTecnico.update({
      where: { id: orden.id },
      data: {
        valorRepuestos,
        valorManoObra: valorManoObra + valorInsumos,
        valorTotal,
      },
    });

    return ok({
      ok: true,
      detalle,
      orden: updated,
      valorRepuestos,
      valorManoObra: updated.valorManoObra,
      valorTotal,
    });
  } catch (e) {
    return serverError("Error al agregar detalle a la orden", e);
  }
}
