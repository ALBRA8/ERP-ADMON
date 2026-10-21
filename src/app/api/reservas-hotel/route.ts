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
// GET /api/reservas-hotel — lista con filtros
//   ?estado=...&fechaCheckin=...&habitacionId=...
// POST /api/reservas-hotel — crea reserva confirmada
//   body: { habitacionId, terceroId?, nombreHuesped,
//           fechaCheckin, fechaCheckout, tarifaNoche, observaciones? }
//   Calcula noches y tarifaTotal. Marca habitación como "reservada"
//   (solo si está disponible)
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const estado = getQuery(req, "estado");
    const fechaCheckin = getQuery(req, "fechaCheckin");
    const habitacionId = getQuery(req, "habitacionId");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (habitacionId) where.habitacionId = habitacionId;
    if (fechaCheckin) {
      const d = new Date(fechaCheckin);
      where.fechaCheckin = {
        gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      };
    }

    const [items, total] = await Promise.all([
      db.reservaHotel.findMany({
        where,
        orderBy: { fechaCheckin: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { habitacion: true },
      }),
      db.reservaHotel.count({ where }),
    ]);

    // Enriquecer con datos del tercero (no hay relación directa en el schema)
    const terceroIds = items
      .map((r) => r.terceroId)
      .filter((id): id is string => !!id);
    const terceros = terceroIds.length
      ? await db.tercero.findMany({
          where: { id: { in: terceroIds } },
          select: { id: true, nombre: true, numeroDocumento: true },
        })
      : [];
    const terceroMap = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((r) => ({
      ...r,
      tercero: r.terceroId ? terceroMap.get(r.terceroId) ?? null : null,
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar reservas", e);
  }
}

const reservaCreateSchema = z.object({
  habitacionId: z.string().min(1),
  terceroId: z.string().nullish(),
  nombreHuesped: z.string().min(2),
  fechaCheckin: z.string(),
  fechaCheckout: z.string(),
  tarifaNoche: z.number().nonnegative(),
  observaciones: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = reservaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    const habitacion = await db.habitacion.findFirst({
      where: { id: data.habitacionId, empresaId: session.empresaId },
    });
    if (!habitacion) return badRequest("Habitación no encontrada");

    if (habitacion.estado !== "disponible") {
      return badRequest(
        `La habitación no está disponible (estado: ${habitacion.estado})`,
      );
    }

    const fechaCheckin = new Date(data.fechaCheckin);
    const fechaCheckout = new Date(data.fechaCheckout);
    if (fechaCheckout <= fechaCheckin) {
      return badRequest(
        "La fecha de check-out debe ser posterior a la de check-in",
      );
    }
    const diffMs = fechaCheckout.getTime() - fechaCheckin.getTime();
    const noches = Math.max(
      1,
      Math.round(diffMs / (1000 * 60 * 60 * 24)),
    );
    const tarifaTotal = round(noches * data.tarifaNoche, 2);

    const reserva = await db.reservaHotel.create({
      data: {
        empresaId: session.empresaId,
        habitacionId: habitacion.id,
        terceroId: data.terceroId ?? null,
        fechaCheckin,
        fechaCheckout,
        noches,
        tarifaNoche: data.tarifaNoche,
        tarifaTotal,
        estado: "confirmada",
        observaciones: data.observaciones ?? null,
      },
      include: { habitacion: true },
    });

    // Enriquecer con tercero si viene
    let tercero: any = null;
    if (data.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: data.terceroId },
        select: { id: true, nombre: true, numeroDocumento: true },
      });
    }

    // Marcar habitación como reservada
    await db.habitacion.update({
      where: { id: habitacion.id },
      data: { estado: "reservada" },
    });

    return ok({ ...reserva, tercero });
  } catch (e) {
    return serverError("Error al crear reserva", e);
  }
}
