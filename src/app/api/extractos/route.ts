import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
  getQuery,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";

// ============================================================
// ERP Marsella — Extractos bancarios
// GET  /api/extractos                          Lista extractos por empresa
// POST /api/extractos                         Crea extracto + bulk movs
//      Body: { cuentaBancariaId, mes, anio, saldoInicial, saldoFinal,
//              movimientos?: [{fecha, descripcion, monto}] }
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const cuentaBancariaId = getQuery(req, "cuentaBancariaId");
    const where: any = { empresaId: session.empresaId };
    if (cuentaBancariaId) where.cuentaBancariaId = cuentaBancariaId;
    const extractos = await db.extractoBancario.findMany({
      where,
      orderBy: [{ anio: "desc" }, { mes: "desc" }],
      include: {
        cuentaBancaria: { include: { banco: true } },
        _count: { select: { extractoMovimientos: true } },
      },
    });
    const items = extractos.map((e) => ({
      id: e.id,
      cuentaBancariaId: e.cuentaBancariaId,
      cuenta: e.cuentaBancaria,
      mes: e.mes,
      anio: e.anio,
      saldoInicial: e.saldoInicial,
      saldoFinal: e.saldoFinal,
      archivo: e.archivo,
      estado: e.estado,
      fechaConciliacion: e.fechaConciliacion,
      createdAt: e.createdAt,
      movimientosCount: (e as any)._count?.extractoMovimientos ?? 0,
    }));
    return ok({ items, total: items.length });
  } catch (e) {
    return serverError("Error al listar extractos", e);
  }
}

const movItemSchema = z.object({
  fecha: z.string(),
  descripcion: z.string().min(1),
  monto: z.number(),
});

const createSchema = z.object({
  cuentaBancariaId: z.string().min(1),
  mes: z.number().int().min(1).max(12),
  anio: z.number().int().min(2000).max(2100),
  saldoInicial: z.number().default(0),
  saldoFinal: z.number().default(0),
  archivo: z.string().optional(),
  movimientos: z.array(movItemSchema).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const cuenta = await db.cuentaBancaria.findFirst({
      where: { id: d.cuentaBancariaId, empresaId: session.empresaId },
    });
    if (!cuenta) return notFound("Cuenta bancaria no encontrada");

    // ¿Existe ya un extracto para esta cuenta/mes/año?
    const existente = await db.extractoBancario.findFirst({
      where: {
        empresaId: session.empresaId,
        cuentaBancariaId: d.cuentaBancariaId,
        mes: d.mes,
        anio: d.anio,
      },
    });
    if (existente) {
      return badRequest(
        `Ya existe un extracto para ${d.mes}/${d.anio} en esta cuenta`,
      );
    }

    const extracto = await db.extractoBancario.create({
      data: {
        empresaId: session.empresaId,
        cuentaBancariaId: d.cuentaBancariaId,
        mes: d.mes,
        anio: d.anio,
        saldoInicial: round(d.saldoInicial, 2),
        saldoFinal: round(d.saldoFinal, 2),
        archivo: d.archivo ?? null,
        estado: "pendiente",
      },
      include: { cuentaBancaria: { include: { banco: true } } },
    });

    let creados = 0;
    if (d.movimientos && d.movimientos.length > 0) {
      await db.extractoMovimiento.createMany({
        data: d.movimientos.map((m) => ({
          empresaId: session.empresaId,
          extractoId: extracto.id,
          fecha: new Date(m.fecha),
          descripcion: m.descripcion,
          monto: round(m.monto, 2),
          conciliado: false,
        })),
      });
      creados = d.movimientos.length;
    }
    return ok({ ...extracto, movimientosCreados: creados });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe un extracto para ese mes/año/cuenta");
    }
    return serverError("Error al crear extracto", e);
  }
}
