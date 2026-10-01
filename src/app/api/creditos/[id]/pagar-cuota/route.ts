import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// POST /api/creditos/[id]/pagar-cuota
// Marca una cuota como pagada, crea ComprobanteEgreso automático,
// decrementa Credito.saldoCapital y ajusta Tercero.saldoCartera.
// ============================================================
const schema = z.object({
  cuotaId: z.string().min(1),
  fechaPago: z.coerce.date().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await ctx.params;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const { cuotaId, fechaPago } = parsed.data;
    const fecha = fechaPago ?? new Date();

    // Cargar crédito + cuota
    const credito = await db.credito.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        tercero: true,
        cuotas: { orderBy: { numero: "asc" } },
      },
    });
    if (!credito) return notFound("Crédito no encontrado");

    const cuota = credito.cuotas.find((c) => c.id === cuotaId);
    if (!cuota) return notFound("Cuota no encontrada en este crédito");
    if (cuota.estado === "pagada") {
      return badRequest("La cuota ya está pagada");
    }

    const nombreTercero =
      credito.tercero?.nombreComercial ??
      credito.tercero?.nombre ??
      "Tercero sin nombre";

    // Transacción: crear comprobante, marcar cuota, bajar saldo capital y cartera
    const resultado = await db.$transaction(async (tx) => {
      // Crear comprobante de egreso (tipo egreso, forma pago transferencia)
      const cnt = await tx.comprobanteEgreso.count({
        where: { empresaId: session.empresaId },
      });
      const numero = `CE-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
      const egreso = await tx.comprobanteEgreso.create({
        data: {
          empresaId: session.empresaId,
          numero,
          terceroId: credito.terceroId ?? null,
          nombreTercero,
          fecha,
          valorTotal: cuota.totalCuota,
          concepto: `Pago cuota ${cuota.numero}/${credito.cuotaN} crédito`,
          formaPago: "transferencia",
          observaciones: `CuotaId=${cuota.id} CréditoId=${credito.id}`,
          estado: "vigente",
        },
      });

      // Marcar cuota pagada
      const cuotaActualizada = await tx.cuotaCredito.update({
        where: { id: cuota.id },
        data: {
          estado: "pagada",
          fechaPago: fecha,
          comprobanteEgresoId: egreso.id,
        },
      });

      // Decrementar saldo capital del crédito (por el capital de la cuota)
      const nuevoSaldo = Math.max(
        0,
        Math.round((credito.saldoCapital - cuota.capital) * 100) / 100,
      );
      const creditoActualizado = await tx.credito.update({
        where: { id: credito.id },
        data: {
          saldoCapital: nuevoSaldo,
          estado: nuevoSaldo <= 0.005 ? "pagado" : "vigente",
        },
      });

      // Ajustar saldoCartera del tercero (baja por el capital pagado)
      if (credito.terceroId) {
        await tx.tercero.update({
          where: { id: credito.terceroId },
          data: {
            saldoCartera: {
              decrement: cuota.capital,
            },
          },
        });
      }

      return { cuota: cuotaActualizada, egreso, credito: creditoActualizado };
    });

    return ok({
      cuota: resultado.cuota,
      comprobanteEgreso: resultado.egreso,
      credito: resultado.credito,
    });
  } catch (e) {
    return serverError("Error al pagar cuota", e);
  }
}
