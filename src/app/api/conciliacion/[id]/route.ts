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
// /api/conciliacion/[id]
// GET  Detalle con extracto y movimientos conciliados
// PUT  Actualizar (cerrar como "conciliada", marca extracto)
// ============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const conc = await db.conciliacionBancaria.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        cuentaBancaria: { include: { banco: true } },
        extracto: { include: { extractoMovimientos: true } },
      },
    });
    if (!conc) return notFound("Conciliación no encontrada");
    // Movimientos bancarios conciliados (de esta cuenta)
    const movsLibro = await db.movimientoBancario.findMany({
      where: {
        empresaId: session.empresaId,
        cuentaBancariaId: conc.cuentaBancariaId,
        conciliado: true,
      },
      orderBy: { fecha: "asc" },
    });
    return ok({
      ...conc,
      movimientosConciliados: movsLibro,
    });
  } catch (e) {
    return serverError("Error al obtener conciliación", e);
  }
}

const updateSchema = z.object({
  estado: z.enum(["borrador", "conciliada", "anulada"]).optional(),
  ajustesLibro: z.number().optional(),
  ajustesExtracto: z.number().optional(),
  saldoInicialLibro: z.number().optional(),
  saldoInicialExtracto: z.number().optional(),
  observaciones: z.string().optional(),
  cerrar: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const conc = await db.conciliacionBancaria.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!conc) return notFound("Conciliación no encontrada");

    // Recalcular saldos si cambiaron
    const saldoInicialLibro =
      d.saldoInicialLibro !== undefined ? d.saldoInicialLibro : conc.saldoInicialLibro;
    const saldoInicialExtracto =
      d.saldoInicialExtracto !== undefined
        ? d.saldoInicialExtracto
        : conc.saldoInicialExtracto;
    const ajustesLibro =
      d.ajustesLibro !== undefined ? d.ajustesLibro : conc.ajustesLibro;
    const ajustesExtracto =
      d.ajustesExtracto !== undefined ? d.ajustesExtracto : conc.ajustesExtracto;
    const saldoFinalLibro = round(saldoInicialLibro + ajustesLibro, 2);
    const saldoFinalExtracto = round(saldoInicialExtracto + ajustesExtracto, 2);
    const diferencia = round(saldoFinalLibro - saldoFinalExtracto, 2);

    let nuevoEstado = conc.estado;
    if (d.estado) nuevoEstado = d.estado;
    if (d.cerrar) nuevoEstado = "conciliada";

    const updated = await db.conciliacionBancaria.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        saldoInicialLibro: round(saldoInicialLibro, 2),
        saldoInicialExtracto: round(saldoInicialExtracto, 2),
        ajustesLibro: round(ajustesLibro, 2),
        ajustesExtracto: round(ajustesExtracto, 2),
        saldoFinalLibro,
        saldoFinalExtracto,
        diferencia,
        observaciones: d.observaciones ?? conc.observaciones,
      },
      include: { cuentaBancaria: { include: { banco: true } }, extracto: true },
    });

    // Si se cierra como conciliada, marcar extracto como conciliado
    let extractoActualizado: any = updated.extracto;
    if (d.cerrar && conc.extractoId) {
      await db.extractoBancario.update({
        where: { id: conc.extractoId },
        data: {
          estado: "conciliado",
          fechaConciliacion: new Date(),
        },
      });
      extractoActualizado = await db.extractoBancario.findUnique({
        where: { id: conc.extractoId },
      });
    }
    return ok({ ...updated, extracto: extractoActualizado });
  } catch (e) {
    return serverError("Error al actualizar conciliación", e);
  }
}
