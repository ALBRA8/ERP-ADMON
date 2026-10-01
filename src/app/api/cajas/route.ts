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
// ERP Marsella — Cajas POS
// GET  /api/cajas          Lista cajas
// POST /api/cajas          Crea
// PUT  /api/cajas          Actualiza (incluye abrir/cerrar)
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const q = getQuery(req, "q");
    const estado = getQuery(req, "estado");
    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (q) {
      where.OR = [
        { nombre: { contains: q } },
        { codigo: { contains: q } },
        { ubicacion: { contains: q } },
      ];
    }
    const cajas = await db.cajaPOS.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    // Buscar responsables (Tercero)
    const respIds = cajas
      .map((c) => c.responsableId)
      .filter(Boolean) as string[];
    let responsablesMap: Record<string, any> = {};
    if (respIds.length) {
      const resps = await db.tercero.findMany({
        where: { id: { in: respIds } },
        select: { id: true, nombre: true, apellido1: true, numeroDocumento: true },
      });
      responsablesMap = Object.fromEntries(resps.map((r) => [r.id, r]));
    }
    const items = cajas.map((c) => ({
      ...c,
      responsable: c.responsableId ? responsablesMap[c.responsableId] : null,
    }));
    return ok({ items, total: items.length });
  } catch (e) {
    return serverError("Error al listar cajas", e);
  }
}

const createSchema = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(2).max(120),
  ubicacion: z.string().optional(),
  responsableId: z.string().optional(),
  saldoInicial: z.number().default(0),
  estado: z.enum(["abierta", "cerrada"]).default("abierta"),
  activa: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const caja = await db.cajaPOS.create({
      data: {
        empresaId: session.empresaId,
        codigo: d.codigo,
        nombre: d.nombre,
        ubicacion: d.ubicacion ?? null,
        responsableId: d.responsableId ?? null,
        saldoInicial: round(d.saldoInicial, 2),
        saldoActual: round(d.saldoInicial, 2),
        estado: d.estado,
        activa: d.activa,
      },
    });
    return ok(caja);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una caja con ese código en la empresa");
    }
    return serverError("Error al crear caja", e);
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  codigo: z.string().optional(),
  nombre: z.string().optional(),
  ubicacion: z.string().optional(),
  responsableId: z.string().optional().nullable(),
  saldoInicial: z.number().optional(),
  saldoActual: z.number().optional(),
  estado: z.enum(["abierta", "cerrada"]).optional(),
  activa: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const { id, ...rest } = d;
    const existing = await db.cajaPOS.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return badRequest("Caja no encontrada");
    const dataUpdate: any = {};
    for (const k of [
      "codigo",
      "nombre",
      "ubicacion",
      "responsableId",
      "estado",
      "activa",
    ] as const) {
      if ((rest as any)[k] !== undefined) dataUpdate[k] = (rest as any)[k];
    }
    if (rest.saldoInicial !== undefined)
      dataUpdate.saldoInicial = round(rest.saldoInicial, 2);
    if (rest.saldoActual !== undefined)
      dataUpdate.saldoActual = round(rest.saldoActual, 2);
    const updated = await db.cajaPOS.update({
      where: { id },
      data: dataUpdate,
    });
    return ok(updated);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una caja con ese código en la empresa");
    }
    return serverError("Error al actualizar caja", e);
  }
}
