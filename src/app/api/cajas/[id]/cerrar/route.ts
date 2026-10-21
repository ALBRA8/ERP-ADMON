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
// POST /api/cajas/[id]/cerrar
// Body: { ventasEfectivo, ventasTarjeta, ventasTransferencia,
//         otrosIngresos, gastosMenores, saldoFinalConteo,
//         observaciones?, turno? }
// Calcula saldoFinalSistema = saldoInicial + ventasEfectivo - gastosMenores
//          diferencia       = saldoFinalConteo - saldoFinalSistema
// Crea ArqueoCaja + cambia CajaPOS.estado = "cerrada"
// ============================================================

const cerrarSchema = z.object({
  ventasEfectivo: z.number().default(0),
  ventasTarjeta: z.number().default(0),
  ventasTransferencia: z.number().default(0),
  otrosIngresos: z.number().default(0),
  gastosMenores: z.number().default(0),
  saldoFinalConteo: z.number().default(0),
  observaciones: z.string().optional(),
  turno: z
    .enum(["manana", "tarde", "noche", "completo"])
    .default("completo"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = cerrarSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const caja = await db.cajaPOS.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!caja) return notFound("Caja no encontrada");
    if (caja.estado === "cerrada") {
      return badRequest("La caja ya está cerrada");
    }

    const saldoFinalSistema = round(
      caja.saldoInicial + d.ventasEfectivo + d.otrosIngresos - d.gastosMenores,
      2,
    );
    const diferencia = round(d.saldoFinalConteo - saldoFinalSistema, 2);
    const fecha = new Date();

    const arqueo = await db.arqueoCaja.create({
      data: {
        empresaId: session.empresaId,
        cajaId: caja.id,
        fecha,
        turno: d.turno,
        saldoInicial: round(caja.saldoInicial, 2),
        ventasEfectivo: round(d.ventasEfectivo, 2),
        ventasTarjeta: round(d.ventasTarjeta, 2),
        ventasTransferencia: round(d.ventasTransferencia, 2),
        otrosIngresos: round(d.otrosIngresos, 2),
        gastosMenores: round(d.gastosMenores, 2),
        saldoFinalSistema,
        saldoFinalConteo: round(d.saldoFinalConteo, 2),
        diferencia,
        observaciones: d.observaciones ?? null,
        userId: session.userId,
      },
    });

    await db.cajaPOS.update({
      where: { id: caja.id },
      data: {
        estado: "cerrada",
        saldoActual: round(d.saldoFinalConteo, 2),
      },
    });

    return ok({ arqueo, cajaId: caja.id, diferencia, saldoFinalSistema });
  } catch (e) {
    return serverError("Error al cerrar caja", e);
  }
}
