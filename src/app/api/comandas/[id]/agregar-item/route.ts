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
// POST /api/comandas/[id]/agregar-item
// Body: { productoId?, descripcion, cantidad, precioUnitario, observaciones? }
// Agrega item a la comanda abierta y recalcula total.
// ============================================================
const addItemSchema = z.object({
  productoId: z.string().optional(),
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  observaciones: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;

    const body = await req.json();
    const parsed = addItemSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    const comanda = await db.comanda.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { detalles: true },
    });
    if (!comanda) return notFound("Comanda no encontrada");
    if (comanda.estado !== "abierta") {
      return badRequest("La comanda no está abierta");
    }

    const subtotal = round(data.cantidad * data.precioUnitario, 2);
    const now = new Date();

    // Crear detalle
    await db.detalleComanda.create({
      data: {
        comandaId: comanda.id,
        empresaId: session.empresaId,
        productoId: data.productoId ?? null,
        descripcion: data.descripcion,
        cantidad: data.cantidad,
        precioUnitario: data.precioUnitario,
        subtotal,
        observaciones: data.observaciones ?? null,
        estado: "solicitado",
        horaSolicitud: now,
      },
    });

    // Recalcular total
    const nuevoTotal = round(
      comanda.detalles
        .filter((d) => d.estado !== "anulado")
        .reduce((acc, d) => acc + d.subtotal, 0) + subtotal,
      2,
    );

    const updated = await db.comanda.update({
      where: { id: comanda.id },
      data: { total: nuevoTotal },
      include: {
        detalles: { orderBy: { createdAt: "asc" } },
        mesa: true,
      },
    });

    return ok(updated);
  } catch (e) {
    return serverError("Error al agregar item", e);
  }
}
