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

// ============================================================
// POST /api/conciliacion/[id]/match
// Body: { movimientoBancarioId, extractoMovimientoId }
// Marca ambos como conciliado=true y vincula el movimiento
// bancario en el ExtractoMovimiento.
// ============================================================

const matchSchema = z.object({
  movimientoBancarioId: z.string().min(1),
  extractoMovimientoId: z.string().min(1),
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
    const parsed = matchSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    const conc = await db.conciliacionBancaria.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!conc) return notFound("Conciliación no encontrada");

    const mov = await db.movimientoBancario.findFirst({
      where: {
        id: d.movimientoBancarioId,
        empresaId: session.empresaId,
      },
    });
    if (!mov) return notFound("Movimiento bancario no encontrado");

    const extMov = await db.extractoMovimiento.findFirst({
      where: {
        id: d.extractoMovimientoId,
        empresaId: session.empresaId,
      },
    });
    if (!extMov) return notFound("Movimiento de extracto no encontrado");

    // Marca ambos como conciliados y los vincula
    await db.movimientoBancario.update({
      where: { id: mov.id },
      data: {
        conciliado: true,
        extractoId: extMov.extractoId,
      },
    });
    await db.extractoMovimiento.update({
      where: { id: extMov.id },
      data: {
        conciliado: true,
        movimientoBancarioId: mov.id,
      },
    });

    return ok({ ok: true, movimientoBancarioId: mov.id, extractoMovimientoId: extMov.id });
  } catch (e) {
    return serverError("Error al conciliar movimientos", e);
  }
}
