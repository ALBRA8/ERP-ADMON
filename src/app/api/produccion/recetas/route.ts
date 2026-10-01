import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";

// ============================================================
// /api/produccion/recetas
// GET    lista recetas con include ingredientes
// POST   crea receta + ingredientes atómicos
// PUT    actualiza receta + reemplaza ingredientes
// ============================================================

const ingredienteSchema = z.object({
  productoId: z.string().nullable().optional(),
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  costoUnitario: z.number().nonnegative().default(0),
});

const recetaSchema = z.object({
  productoId: z.string().nullable().optional(),
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  rendimiento: z.number().positive().default(1),
  activa: z.boolean().default(true),
  ingredientes: z.array(ingredienteSchema).default([]),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const productoId = getQuery(req, "productoId");
    const soloActivas = getQuery(req, "activas");

    const where: any = { empresaId: session.empresaId };
    if (productoId) where.productoId = productoId;
    if (soloActivas === "1" || soloActivas === "true") where.activa = true;

    const items = await db.recetaProducto.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        ingredientes: { orderBy: { createdAt: "asc" } },
      },
    });

    // Lookup productos
    const pids = new Set<string>();
    for (const r of items) {
      if (r.productoId) pids.add(r.productoId);
      for (const ing of r.ingredientes) {
        if (ing.productoId) pids.add(ing.productoId);
      }
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

    const enriched = items.map((r) => ({
      ...r,
      producto: pmap.get(r.productoId) ?? null,
      ingredientes: r.ingredientes.map((ing) => ({
        ...ing,
        producto: ing.productoId ? pmap.get(ing.productoId) ?? null : null,
      })),
    }));

    return ok(enriched);
  } catch (e) {
    return serverError("Error al listar recetas", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = recetaSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    let prod: any = null;
    if (d.productoId) {
      prod = await db.producto.findFirst({
        where: { id: d.productoId, empresaId: session.empresaId },
      });
      if (!prod) return badRequest("Producto no encontrado");
    }

    const receta = await db.$transaction(async (tx) => {
      const r = await tx.recetaProducto.create({
        data: {
          empresaId: session.empresaId,
          productoId: d.productoId,
          nombre: d.nombre,
          descripcion: d.descripcion ?? null,
          rendimiento: d.rendimiento,
          activa: d.activa,
        },
      });
      if (d.ingredientes.length) {
        await tx.recetaIngrediente.createMany({
          data: d.ingredientes.map((ing) => ({
            recetaId: r.id,
            empresaId: session.empresaId,
            productoId: ing.productoId ?? null,
            descripcion: ing.descripcion,
            cantidad: ing.cantidad,
            costoUnitario: ing.costoUnitario,
            subtotal: round(ing.cantidad * ing.costoUnitario, 2),
          })),
        });
      }
      return r;
    });

    const full = await db.recetaProducto.findUnique({
      where: { id: receta.id },
      include: { ingredientes: { orderBy: { createdAt: "asc" } } },
    });
    return ok(full);
  } catch (e) {
    return serverError("Error al crear receta", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = recetaSchema.extend({ id: z.string() }).safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    const existing = await db.recetaProducto.findFirst({
      where: { id: d.id, empresaId: session.empresaId },
    });
    if (!existing) return badRequest("Receta no encontrada");

    const prod = await db.producto.findFirst({
      where: { id: d.productoId, empresaId: session.empresaId },
    });
    if (!prod) return badRequest("Producto no encontrado");

    await db.$transaction(async (tx) => {
      await tx.recetaProducto.update({
        where: { id: d.id },
        data: {
          productoId: d.productoId,
          nombre: d.nombre,
          descripcion: d.descripcion ?? null,
          rendimiento: d.rendimiento,
          activa: d.activa,
        },
      });
      // Reemplazar ingredientes
      await tx.recetaIngrediente.deleteMany({ where: { recetaId: d.id } });
      if (d.ingredientes.length) {
        await tx.recetaIngrediente.createMany({
          data: d.ingredientes.map((ing) => ({
            recetaId: d.id,
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
      where: { id: d.id },
      include: { ingredientes: { orderBy: { createdAt: "asc" } } },
    });
    return ok(full);
  } catch (e) {
    return serverError("Error al actualizar receta", e);
  }
}
