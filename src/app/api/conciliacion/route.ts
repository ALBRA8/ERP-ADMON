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
// ERP Marsella — Conciliación bancaria (cabecera)
// GET  /api/conciliacion            ?cuentaBancariaId&estado
// POST /api/conciliacion            Calcula saldos finales y diferencia
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const cuentaBancariaId = getQuery(req, "cuentaBancariaId");
    const estado = getQuery(req, "estado");
    const where: any = { empresaId: session.empresaId };
    if (cuentaBancariaId) where.cuentaBancariaId = cuentaBancariaId;
    if (estado) where.estado = estado;
    const items = await db.conciliacionBancaria.findMany({
      where,
      orderBy: { fecha: "desc" },
      include: {
        cuentaBancaria: { include: { banco: true } },
        extracto: true,
      },
    });
    return ok({ items, total: items.length });
  } catch (e) {
    return serverError("Error al listar conciliaciones", e);
  }
}

const createSchema = z.object({
  cuentaBancariaId: z.string().min(1),
  extractoId: z.string().nullish(),
  saldoInicialLibro: z.number().default(0),
  saldoInicialExtracto: z.number().default(0),
  ajustesLibro: z.number().default(0),
  ajustesExtracto: z.number().default(0),
  observaciones: z.string().optional(),
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
    if (!cuenta) return badRequest("Cuenta bancaria no encontrada");
    if (d.extractoId) {
      const ext = await db.extractoBancario.findFirst({
        where: { id: d.extractoId, empresaId: session.empresaId },
      });
      if (!ext) return badRequest("Extracto no encontrado");
    }
    const saldoFinalLibro = round(
      d.saldoInicialLibro + d.ajustesLibro,
      2,
    );
    const saldoFinalExtracto = round(
      d.saldoInicialExtracto + d.ajustesExtracto,
      2,
    );
    const diferencia = round(saldoFinalLibro - saldoFinalExtracto, 2);
    const conciliacion = await db.conciliacionBancaria.create({
      data: {
        empresaId: session.empresaId,
        cuentaBancariaId: d.cuentaBancariaId,
        extractoId: d.extractoId ?? null,
        saldoInicialLibro: round(d.saldoInicialLibro, 2),
        saldoInicialExtracto: round(d.saldoInicialExtracto, 2),
        ajustesLibro: round(d.ajustesLibro, 2),
        ajustesExtracto: round(d.ajustesExtracto, 2),
        saldoFinalLibro,
        saldoFinalExtracto,
        diferencia,
        estado: "borrador",
        userId: session.userId,
        observaciones: d.observaciones ?? null,
      },
      include: {
        cuentaBancaria: { include: { banco: true } },
        extracto: true,
      },
    });
    return ok(conciliacion);
  } catch (e) {
    return serverError("Error al crear conciliación", e);
  }
}
