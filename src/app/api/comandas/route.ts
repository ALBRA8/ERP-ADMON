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

// ============================================================
// GET /api/comandas — lista comandas con filtros
//   ?estado=...&mesaId=...&fechaInicio=...&fechaFin=... (paginado)
// POST /api/comandas — crea comanda abierta
//   body: { mesaId, meseroId?, observaciones?,
//           items: [{ productoId?, descripcion, cantidad, precioUnitario, observaciones? }] }
//   Marca la mesa como "ocupada" y devuelve la comanda completa.
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const estado = getQuery(req, "estado");
    const mesaId = getQuery(req, "mesaId");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (mesaId) where.mesaId = mesaId;
    if (fechaInicio || fechaFin) {
      where.fechaApertura = {};
      if (fechaInicio) where.fechaApertura.gte = new Date(fechaInicio);
      if (fechaFin) where.fechaApertura.lte = new Date(fechaFin);
    }

    const [items, total] = await Promise.all([
      db.comanda.findMany({
        where,
        orderBy: { fechaApertura: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          mesa: true,
          detalles: true,
        },
      }),
      db.comanda.count({ where }),
    ]);

    // Enriquecer con # items pendientes (solicitado|preparando)
    const enriched = items.map((c) => ({
      ...c,
      itemsPendientes: c.detalles.filter(
        (d) => d.estado === "solicitado" || d.estado === "preparando",
      ).length,
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar comandas", e);
  }
}

const itemSchema = z.object({
  productoId: z.string().nullish(),
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  observaciones: z.string().optional(),
});

const comandaCreateSchema = z.object({
  mesaId: z.string().min(1),
  meseroId: z.string().nullish(),
  observaciones: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = comandaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    // 1. Verificar mesa y propiedad
    const mesa = await db.mesa.findFirst({
      where: { id: data.mesaId, empresaId: session.empresaId },
    });
    if (!mesa) return badRequest("Mesa no encontrada");

    if (mesa.estado === "ocupada") {
      // Verificar si tiene comanda abierta
      const comandaAbierta = await db.comanda.findFirst({
        where: { mesaId: mesa.id, estado: "abierta" },
      });
      if (comandaAbierta) {
        return badRequest(
              "La mesa ya tiene una comanda abierta",
            );
      }
    }
    if (mesa.estado === "inactiva") {
      return badRequest("La mesa está inactiva");
    }

    // 2. Calcular subtotales
    const now = new Date();
    let total = 0;
    const detallesData = data.items.map((it) => {
      const subtotal = round(it.cantidad * it.precioUnitario, 2);
      total = round(total + subtotal, 2);
      return {
        empresaId: session.empresaId,
        productoId: it.productoId ?? null,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        subtotal,
        observaciones: it.observaciones ?? null,
        estado: "solicitado",
        horaSolicitud: now,
      };
    });

    // 3. Crear comanda
    const comanda = await db.comanda.create({
      data: {
        empresaId: session.empresaId,
        mesaId: mesa.id,
        meseroId: data.meseroId ?? null,
        estado: "abierta",
        fechaApertura: now,
        total,
        observaciones: data.observaciones ?? null,
        detalles: { create: detallesData },
      },
      include: {
        detalles: true,
        mesa: true,
      },
    });

    // 4. Marcar mesa como ocupada
    await db.mesa.update({
      where: { id: mesa.id },
      data: { estado: "ocupada" },
    });

    return ok(comanda);
  } catch (e) {
    return serverError("Error al crear comanda", e);
  }
}
