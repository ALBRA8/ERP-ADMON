import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQuery, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const q = getQuery(req, "q");
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

    const inactivos = getQuery(req, "inactivos");
    const where: any = { empresaId: session.empresaId };
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
        stockTotal: p.saldosInventario.reduce((a, s) => a + s.cantidad, 0),
        valorInventario: p.saldosInventario.reduce(
          (a, s) => a + s.costoTotal,
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
}

const productoSchema = z.object({
  codigo: z.string().min(2),
  codigoBarras: z.string().optional(),
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  tipo: z.enum(["producto", "servicio", "kit", "insumo"]).default("producto"),
  inventariable: z.boolean().default(true),
  unidadMedidaId: z.string().optional(),
  lineaId: z.string().optional(),
  costoPromedio: z.number().default(0),
  ultimoCosto: z.number().default(0),
  precio1: z.number().default(0),
  precio2: z.number().default(0),
  precio3: z.number().default(0),
  impuestoId: z.string().optional(),
  tarifaIva: z.number().default(19),
  stockMinimo: z.number().default(0),
  stockMaximo: z.number().default(0),
  manejaLotes: z.boolean().default(false),
  manejaSeriales: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = productoSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const producto = await db.producto.create({
      data: {
        empresaId: session.empresaId,
        ...parsed.data,
      },
    });
    return ok(producto);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe un producto con ese código");
    }
    return serverError("Error al crear producto", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return badRequest("id requerido");
    const producto = await db.producto.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
    return ok(producto);
  } catch (e) {
    return serverError("Error al actualizar producto", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const id = getQuery(req, "id");
    if (!id) return badRequest("id requerido");
    await db.producto.update({
      where: { id },
      data: { activo: false },
    });
    return ok({ ok: true });
  } catch (e) {
    return serverError("Error al eliminar producto", e);
  }
}
