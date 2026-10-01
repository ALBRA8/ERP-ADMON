import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
  getQuery,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { aplicarReceta } from "@/lib/produccion";
import { round } from "@/lib/currency";

// ============================================================
// GET /api/produccion/recetas/[id]/calcular-costo?cantidad=N
// Devuelve el costo total estimado de producir N unidades con la receta
// y el detalle por ingrediente con stock disponible (requiere bodegaId)
// ============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const cantidadStr = getQuery(req, "cantidad");
    const bodegaId = getQuery(req, "bodegaId");

    if (!cantidadStr) return badRequest("Parámetro cantidad requerido");
    const cantidad = parseFloat(cantidadStr);
    if (!Number.isFinite(cantidad) || cantidad <= 0)
      return badRequest("cantidad debe ser un número positivo");

    const receta = await db.recetaProducto.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { ingredientes: { orderBy: { createdAt: "asc" } } },
    });
    if (!receta) return notFound("Receta no encontrada");

    let verificacionStock: Awaited<
      ReturnType<typeof aplicarReceta>
    > | null = null;
    if (bodegaId) {
      const bodega = await db.bodega.findFirst({
        where: { id: bodegaId, empresaId: session.empresaId },
      });
      if (!bodega) return badRequest("Bodega no encontrada");
      verificacionStock = await aplicarReceta(receta as any, cantidad, bodegaId);
    }

    // Cálculo simple por ingredientes (sin verificar stock si no hay bodegaId)
    const ingredientes = receta.ingredientes.map((ing) => {
      const cantidadRequerida = round(ing.cantidad * cantidad, 4);
      const subtotal = round(cantidadRequerida * ing.costoUnitario, 2);
      return {
        id: ing.id,
        productoId: ing.productoId,
        descripcion: ing.descripcion,
        cantidadPorUnidad: ing.cantidad,
        cantidadRequerida,
        costoUnitario: ing.costoUnitario,
        subtotal,
        stockActual:
          verificacionStock?.ingredientes.find(
            (v) => v.productoId === ing.productoId,
          )?.stockActual ?? null,
        disponible:
          verificacionStock?.ingredientes.find(
            (v) => v.productoId === ing.productoId,
          )?.disponible ?? null,
      };
    });

    const totalCosto = round(
      ingredientes.reduce((s, x) => s + x.subtotal, 0),
      2,
    );
    const costoUnitario = cantidad > 0 ? round(totalCosto / cantidad, 2) : 0;

    return ok({
      recetaId: receta.id,
      nombre: receta.nombre,
      rendimiento: receta.rendimiento,
      cantidad,
      ingredientes,
      totalCosto,
      costoUnitario,
      verificacionStock: verificacionStock
        ? {
            todoDisponible: verificacionStock.todoDisponible,
            bodegaId,
          }
        : null,
    });
  } catch (e) {
    return serverError("Error al calcular costo de receta", e);
  }
}
