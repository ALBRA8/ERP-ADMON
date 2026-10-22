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

// ============================================================
// /api/produccion/recetas/[id]
// GET    detalle receta con ingredientes
// PUT    actualiza receta + reemplaza ingredientes
// DELETE elimina receta (cascade ingredientes por schema)
// ============================================================

const ingredienteSchema = z.object({
  id: z.string().optional(),
  productoId: z.string().nullable().optional(),
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  costoUnitario: z.number().nonnegative().default(0),
});

const updateSchema = z.object({
  productoId: z.string().nullable().optional(),
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  rendimiento: z.number().positive().default(1),
  activa: z.boolean().default(true),
  ingredientes: z.array(ingredienteSchema).default([]),
});

async function lookupProductos(
  productoId: string,
  ingredientes: { productoId?: string | null }[],
) {
  const pids = new Set<string>([productoId]);
  for (const ing of ingredientes) {
    if (ing.productoId) pids.add(ing.productoId);
  }
  const productos = await db.producto.findMany({
    where: { id: { in: [...pids] } },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      inventariable: true,
      tipo: true,
    },
  });
  return new Map(productos.map((p) => [p.id, p]));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const receta = await db.recetaProducto.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { ingredientes: { orderBy: { createdAt: "asc" } } },
    });
    if (!receta) return notFound("Receta no encontrada");

    const pmap = receta.productoId
      ? await lookupProductos(receta.productoId, receta.ingredientes)
      : new Map();

    return ok({
      ...receta,
      producto: receta.productoId ? pmap.get(receta.productoId) ?? null : null,
      ingredientes: receta.ingredientes.map((ing) => ({
        ...ing,
        producto: ing.productoId ? pmap.get(ing.productoId) ?? null : null,
      })),
    });
  } catch (e) {
    return serverError("Error al obtener receta", e);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const existing = await db.recetaProducto.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return notFound("Receta no encontrada");

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    if (!d.productoId) return badRequest("productoId es obligatorio");
    const prod = await db.producto.findFirst({
      where: { id: d.productoId, empresaId: session.empresaId },
    });
    if (!prod) return badRequest("Producto no encontrado");

    await db.$transaction(async (tx) => {
      await tx.recetaProducto.update({
        where: { id },
        data: {
          productoId: d.productoId,
          nombre: d.nombre,
          descripcion: d.descripcion ?? null,
          rendimiento: d.rendimiento,
          activa: d.activa,
        },
      });
      await tx.recetaIngrediente.deleteMany({ where: { recetaId: id } });
      if (d.ingredientes.length) {
        await tx.recetaIngrediente.createMany({
          data: d.ingredientes.map((ing) => ({
            recetaId: id,
            empresaId: session.empresaId,
            productoId: ing.productoId ?? null,
            descripcion: ing.descripcion,
            cantidad: ing.cantidad,
            costoUnitario: ing.costoUnitario,
            subtotal: round(ing.cantidad * ing.costoUnitario, 2),
          })),
        });
      }
    });

    const full = await db.recetaProducto.findUnique({
      where: { id },
      include: { ingredientes: { orderBy: { createdAt: "asc" } } },
    });
    return ok(full);
  } catch (e) {
    return serverError("Error al actualizar receta", e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const receta = await db.recetaProducto.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!receta) return notFound("Receta no encontrada");

    await db.recetaProducto.delete({ where: { id } });
    return ok({ ok: true, id });
  } catch (e) {
    return serverError("Error al eliminar receta", e);
  }
}
