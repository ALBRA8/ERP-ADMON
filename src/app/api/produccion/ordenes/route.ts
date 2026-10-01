import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";
import { calcularCostoProduccion } from "@/lib/produccion";

// ============================================================
// /api/produccion/ordenes
// GET    lista con filtros ?estado&fechaInicio&fechaFin + paginación
// POST   crea orden PROD-2026-NNNNNN, estado=borrador
// ============================================================

const detalleSchema = z.object({
  tipo: z.enum(["materia_prima", "mano_obra", "costo_indirecto"]),
  productoId: z.string().nullish(),
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  costoUnitario: z.number().nonnegative().default(0),
});

const crearOrdenSchema = z.object({
  productoResultanteId: z.string().optional(),
  cantidadProducir: z.number().positive(),
  recetaId: z.string().optional(),
  observaciones: z.string().optional(),
  detalles: z.array(detalleSchema).default([]),
});

async function genNumero(empresaId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.ordenProduccion.count({ where: { empresaId } });
  return `PROD-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const estado = getQuery(req, "estado");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");
    const q = getQuery(req, "q");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (fechaInicio || fechaFin) {
      where.fechaInicio = {};
      if (fechaInicio) where.fechaInicio.gte = new Date(fechaInicio);
      if (fechaFin)
        where.fechaInicio.lte = new Date(fechaFin + "T23:59:59");
    }
    if (q) {
      where.OR = [{ numero: { contains: q } }, { observaciones: { contains: q } }];
    }

    const [items, total] = await Promise.all([
      db.ordenProduccion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          detalles: { orderBy: { createdAt: "asc" } },
        },
      }),
      db.ordenProduccion.count({ where }),
    ]);

    // Lookup productos resultantes y de detalles
    const pids = new Set<string>();
    for (const o of items) {
      if (o.productoResultanteId) pids.add(o.productoResultanteId);
      for (const d of o.detalles) {
        if (d.productoId) pids.add(d.productoId);
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

    const enriched = items.map((o) => ({
      ...o,
      productoResultante: o.productoResultanteId
        ? pmap.get(o.productoResultanteId) ?? null
        : null,
      detalles: o.detalles.map((d) => ({
        ...d,
        producto: d.productoId ? pmap.get(d.productoId) ?? null : null,
      })),
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar órdenes de producción", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = crearOrdenSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    // Validar producto resultante si viene
    if (d.productoResultanteId) {
      const p = await db.producto.findFirst({
        where: { id: d.productoResultanteId, empresaId: session.empresaId },
      });
      if (!p) return badRequest("Producto resultante no encontrado");
    }

    // Cargar receta si viene recetaId
    let detalles = d.detalles;
    let productoResultanteId = d.productoResultanteId;
    if (d.recetaId) {
      const receta = await db.recetaProducto.findFirst({
        where: { id: d.recetaId, empresaId: session.empresaId },
        include: { ingredientes: true },
      });
      if (!receta) return badRequest("Receta no encontrada");
      // Heredar producto resultante de la receta si no se especificó
      if (!productoResultanteId) productoResultanteId = receta.productoId;
      // Cargar ingredientes como detalles tipo materia_prima (si no se pasaron manualmente)
      if (!detalles.length) {
        detalles = receta.ingredientes.map((ing) => ({
          tipo: "materia_prima" as const,
          productoId: ing.productoId ?? undefined,
          descripcion: ing.descripcion,
          cantidad: round(ing.cantidad * d.cantidadProducir, 4),
          costoUnitario: ing.costoUnitario,
        }));
      }
    }

    // Calcular costos por tipo
    let costoMateriaPrima = 0;
    let costoManoObra = 0;
    let costoIndirectos = 0;
    for (const det of detalles) {
      const subtotal = round(det.cantidad * det.costoUnitario, 2);
      if (det.tipo === "materia_prima") costoMateriaPrima = round(costoMateriaPrima + subtotal, 2);
      else if (det.tipo === "mano_obra") costoManoObra = round(costoManoObra + subtotal, 2);
      else costoIndirectos = round(costoIndirectos + subtotal, 2);
    }
    const calc = calcularCostoProduccion({
      costoMateriaPrima,
      costoManoObra,
      costoIndirectos,
      cantidadProducida: 0,
    });

    const numero = await genNumero(session.empresaId);
    const orden = await db.$transaction(async (tx) => {
      const o = await tx.ordenProduccion.create({
        data: {
          empresaId: session.empresaId,
          numero,
          fechaInicio: new Date(),
          estado: "borrador",
          productoResultanteId: productoResultanteId ?? null,
          cantidadProducir: d.cantidadProducir,
          cantidadProducida: 0,
          costoMateriaPrima,
          costoManoObra,
          costoIndirectos,
          costoTotal: calc.costoTotal,
          costoUnitario: 0,
          observaciones: d.observaciones ?? null,
        },
      });
      if (detalles.length) {
        await tx.detalleOrdenProduccion.createMany({
          data: detalles.map((det) => ({
            ordenId: o.id,
            empresaId: session.empresaId,
            tipo: det.tipo,
            productoId: det.productoId ?? null,
            descripcion: det.descripcion,
            cantidad: det.cantidad,
            costoUnitario: det.costoUnitario,
            subtotal: round(det.cantidad * det.costoUnitario, 2),
          })),
        });
      }
      return o;
    });

    const full = await db.ordenProduccion.findUnique({
      where: { id: orden.id },
      include: { detalles: { orderBy: { createdAt: "asc" } } },
    });
    return ok(full);
  } catch (e) {
    return serverError("Error al crear orden de producción", e);
  }
}
