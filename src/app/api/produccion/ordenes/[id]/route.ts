import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/produccion/ordenes/[id]
// Detalle completo de la orden con detalles
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenProduccion.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { detalles: { orderBy: { createdAt: "asc" } } },
    });
    if (!orden) return notFound("Orden de producción no encontrada");

    // Lookup productos
    const pids = new Set<string>();
    if (orden.productoResultanteId) pids.add(orden.productoResultanteId);
    for (const d of orden.detalles) {
      if (d.productoId) pids.add(d.productoId);
    }
    const productos = pids.size
      ? await db.producto.findMany({
          where: { id: { in: [...pids] } },
          select: {
            id: true,
            codigo: true,
            nombre: true,
            inventariable: true,
            tipo: true,
          },
        })
      : [];
    const pmap = new Map(productos.map((p) => [p.id, p]));

    // Lookup comprobante contable si existe
    let comprobante: any = null;
    if (orden.comprobanteContableId) {
      comprobante = await db.comprobante.findUnique({
        where: { id: orden.comprobanteContableId },
        select: {
          id: true,
          numero: true,
          fecha: true,
          descripcion: true,
          totalDebito: true,
          totalCredito: true,
          estado: true,
        },
      });
    }

    return ok({
      ...orden,
      productoResultante: orden.productoResultanteId
        ? pmap.get(orden.productoResultanteId) ?? null
        : null,
      detalles: orden.detalles.map((d) => ({
        ...d,
        producto: d.productoId ? pmap.get(d.productoId) ?? null : null,
      })),
      comprobante,
    });
  } catch (e) {
    return serverError("Error al obtener orden de producción", e);
  }
}
