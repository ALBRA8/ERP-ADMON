import { NextRequest } from "next/server";
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
// POST /api/nomina/[id]/anular
// Anula la nómina: cambia estado a "anulada", revierte el
// comprobante contable creando un asiento reverso (mismos
// movimientos con débitos/créditos invertidos).
// ============================================================
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    if (!id) return badRequest("id requerido");

    const nomina = await db.nomina.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!nomina) return notFound("Nómina no encontrada");

    if (nomina.estado === "anulada") {
      return badRequest("La nómina ya está anulada");
    }

    // 1. Generar asiento reverso si hay comprobante contable original
    if (nomina.comprobanteContableId) {
      const original = await db.comprobante.findUnique({
        where: { id: nomina.comprobanteContableId },
        include: { movimientos: true },
      });
      if (original && original.movimientos.length > 0) {
        const cnt = await db.comprobante.count({
          where: {
            empresaId: session.empresaId,
          },
        });
        const numeroRev = `CG-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
        const totalDebito = round(
          original.movimientos.reduce((a, m) => a + Number(m.credito), 0),
          2,
        );
        const totalCredito = round(
          original.movimientos.reduce((a, m) => a + Number(m.debito), 0),
          2,
        );
        const comprobanteRev = await db.comprobante.create({
          data: {
            empresaId: session.empresaId,
            numero: numeroRev,
            tipo: "ajuste",
            fecha: new Date(),
            descripcion: `Anulación nómina ${nomina.numero} (reverso de ${original.numero})`,
            totalDebito,
            totalCredito,
            diferencia: 0,
            estado: "contabilizado",
            documentoOrigenId: nomina.id,
            documentoOrigenTipo: "ANULACION_NOMINA",
            centroCostoId: nomina.centroCostoId ?? null,
          },
        });
        // Movimientos invertidos
        const movsData = original.movimientos.map((m) => ({
          empresaId: session.empresaId,
          comprobanteId: comprobanteRev.id,
          cuentaId: m.cuentaId,
          terceroId: m.terceroId ?? null,
          centroCostoId: m.centroCostoId ?? null,
          descripcion: `Reverso: ${m.descripcion ?? `Nómina ${nomina.numero}`}`,
          debito: m.credito,
          credito: m.debito,
          fecha: new Date(),
        }));
        await db.movimientoContable.createMany({ data: movsData });

        // Marcar comprobante original como anulado
        await db.comprobante.update({
          where: { id: original.id },
          data: { estado: "anulado" },
        });
      }
    }

    // 2. Cambiar estado de la nómina
    await db.nomina.update({
      where: { id },
      data: { estado: "anulada", estadoDIAN: "rechazado" },
    });

    return ok({ ok: true, id, estado: "anulada" });
  } catch (e) {
    return serverError("Error al anular nómina", e);
  }
}
