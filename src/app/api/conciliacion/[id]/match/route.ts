import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  notFound,
  withAuth,
  parseBody,
} from "@/lib/api";

// ============================================================
// POST /api/conciliacion/[id]/match
// Body: { movimientoBancarioId, extractoMovimientoId }
// Marca ambos como conciliado=true y vincula el movimiento bancario
// en el ExtractoMovimiento. A-CRIT-001: ambas escrituras en
// $transaction para que sean atómicas (no puede quedar un movimiento
// marcado como conciliado sin su par).
// ============================================================

const matchSchema = z.object({
  movimientoBancarioId: z.string().min(1),
  extractoMovimientoId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    { permission: "bancos:write" },
    async (session) => {
      try {
        const { id } = await params;
        const parsed = await parseBody(req, matchSchema);
        if ("error" in parsed) return parsed.error;
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
        if (!extMov)
          return notFound("Movimiento de extracto no encontrado");

        // TRANSACCIÓN: marcar ambos como conciliados atómicamente.
        // Si una escritura falla, ninguna se persiste (A-CRIT-001).
        await db.$transaction(async (tx) => {
          await tx.movimientoBancario.update({
            where: { id: mov.id },
            data: {
              conciliado: true,
              extractoId: extMov.extractoId,
            },
          });
          await tx.extractoMovimiento.update({
            where: { id: extMov.id },
            data: {
              conciliado: true,
              movimientoBancarioId: mov.id,
            },
          });
        });

        return ok({
          ok: true,
          movimientoBancarioId: mov.id,
          extractoMovimientoId: extMov.id,
        });
      } catch (e) {
        return serverError("Error al conciliar movimientos", e);
      }
    },
  );
}
