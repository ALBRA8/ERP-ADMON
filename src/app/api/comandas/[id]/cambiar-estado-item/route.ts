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
// POST /api/comandas/[id]/cambiar-estado-item
// Body: { detalleId, estado }
//   estado: solicitado | preparando | listo | servido | anulado
// Si pasa a "listo", set horaListo = now()
// ============================================================
const ESTADOS_VALIDOS = [
  "solicitado",
  "preparando",
  "listo",
  "servido",
  "anulado",
] as const;

const schema = z.object({
  detalleId: z.string().min(1),
  estado: z.enum(ESTADOS_VALIDOS),
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const { detalleId, estado } = parsed.data;

    // Verificar comanda y propiedad
    const comanda = await db.comanda.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!comanda) return notFound("Comanda no encontrada");
    if (comanda.estado !== "abierta") {
      return badRequest("La comanda no está abierta");
    }

    const detalle = await db.detalleComanda.findFirst({
      where: { id: detalleId, comandaId: comanda.id },
    });
    if (!detalle) return notFound("Detalle no encontrado");

    const updateData: any = { estado };
    if (estado === "listo") {
      updateData.horaListo = new Date();
    }
    // Si sale de "anulado" y vuelve a activo, recalculara total abajo
    const updated = await db.detalleComanda.update({
      where: { id: detalle.id },
      data: updateData,
    });

    // Recalcular total de la comanda (excluye anulados)
    const detalles = await db.detalleComanda.findMany({
      where: { comandaId: comanda.id },
    });
    const nuevoTotal = detalles
      .filter((d) => d.estado !== "anulado")
      .reduce((acc, d) => acc + d.subtotal, 0);
    await db.comanda.update({
      where: { id: comanda.id },
      data: { total: nuevoTotal },
    });

    return ok(updated);
  } catch (e) {
    return serverError("Error al cambiar estado del item", e);
  }
}
