import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  getQuery,
  getQueryInt,
  withAuth,
  parseBody,
} from "@/lib/api";

// ============================================================
// GET /api/productos
// Patrón A-CRIT-006: withAuth + permiso RBAC.
// ============================================================
export async function GET(req: NextRequest) {
  return withAuth(req, { permission: "productos:read" }, async (session) => {
    try {
      const q = getQuery(req, "q");
      const page = getQueryInt(req, "page", 1) ?? 1;
      const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

      const inactivos = getQuery(req, "inactivos");
      const where: Prisma.ProductoWhereInput = {
        empresaId: session.empresaId,
      };
      if (!inactivos || inactivos === "0" || inactivos === "false") {
        where.activo = true;
      }
      if (q) {
        where.OR = [
          { codigo: { contains: q } },
          { nombre: { contains: q } },
          { codigoBarras: { contains: q } },
        ];
      }

      const [items, total] = await Promise.all([
        db.producto.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            unidadMedida: true,
            linea: true,
            impuesto: true,
            saldosInventario: { include: { bodega: true } },
          },
        }),
        db.producto.count({ where }),
      ]);

      return ok({
        items: items.map((p) => ({
          ...p,
          stockTotal: p.saldosInventario.reduce(
            (a, s) => a + Number(s.cantidad),
            0,
          ),
          valorInventario: p.saldosInventario.reduce(
            (a, s) => a + Number(s.costoTotal),
            0,
          ),
          bodegas: p.saldosInventario,
        })),
        total,
        page,
        pageSize,
      });
    } catch (e) {
      return serverError("Error al listar productos", e);
    }
  });
}

const productoSchema = z.object({
  codigo: z.string().min(2).max(50),
  codigoBarras: z.string().max(100).optional(),
  nombre: z.string().min(2).max(200),
  descripcion: z.string().max(2000).optional(),
  tipo: z.enum(["producto", "servicio", "kit", "insumo"]).default("producto"),
  inventariable: z.boolean().default(true),
  unidadMedidaId: z.string().nullish(),
  lineaId: z.string().nullish(),
  costoPromedio: z.number().nonnegative().default(0),
  ultimoCosto: z.number().nonnegative().default(0),
  precio1: z.number().nonnegative().default(0),
  precio2: z.number().nonnegative().default(0),
  precio3: z.number().nonnegative().default(0),
  impuestoId: z.string().nullish(),
  tarifaIva: z.number().nonnegative().default(19),
  stockMinimo: z.number().nonnegative().default(0),
  stockMaximo: z.number().nonnegative().default(0),
  manejaLotes: z.boolean().default(false),
  manejaSeriales: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  return withAuth(req, { permission: "productos:write" }, async (session) => {
    const parsed = await parseBody(req, productoSchema);
    if ("error" in parsed) return parsed.error;

    try {
      const producto = await db.producto.create({
        data: {
          empresaId: session.empresaId,
          ...parsed.data,
        },
      });
      return ok(producto);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2002") {
        return badRequest("Ya existe un producto con ese código");
      }
      if (err?.code === "P2003") {
        return badRequest("Referencia inválida (lineaId, unidadMedidaId, impuestoId u otra FK no existe)");
      }
      return serverError("Error al crear producto", e);
    }
  });
}

// PUT/DELETE mantienen su lógica anterior con `getSession` directo
// (no estaban en el scope A-CRIT-006 de "5 endpoints representativos").
// A-CRIT-007 sí aplica (validación tenant), por lo que filtramos por
// empresaId en el where.
export async function PUT(req: NextRequest) {
  return withAuth(req, { permission: "productos:write" }, async (session) => {
    try {
      const body = (await req.json().catch(() => ({}))) as {
        id?: string;
        [k: string]: unknown;
      };
      const { id, ...data } = body;
      if (!id) return badRequest("id requerido");
      const producto = await db.producto.update({
        where: { id, empresaId: session.empresaId },
        data: { ...(data as Record<string, unknown>), updatedAt: new Date() },
      });
      return ok(producto);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2025") {
        return badRequest("Producto no encontrado en su empresa");
      }
      return serverError("Error al actualizar producto", e);
    }
  });
}

export async function DELETE(req: NextRequest) {
  return withAuth(req, { permission: "productos:write" }, async (session) => {
    try {
      const id = getQuery(req, "id");
      if (!id) return badRequest("id requerido");
      await db.producto.update({
        where: { id, empresaId: session.empresaId },
        data: { activo: false },
      });
      return ok({ ok: true });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2025") {
        return badRequest("Producto no encontrado en su empresa");
      }
      return serverError("Error al eliminar producto", e);
    }
  });
}
