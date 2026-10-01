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
// POST /api/cajas/[id]/abrir
// Abre la caja: estado = "abierta", saldoActual = saldoInicial
// ============================================================
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const caja = await db.cajaPOS.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!caja) return notFound("Caja no encontrada");
    if (caja.estado === "abierta") {
      return badRequest("La caja ya está abierta");
    }
    const updated = await db.cajaPOS.update({
      where: { id },
      data: {
        estado: "abierta",
        saldoActual: round(caja.saldoInicial, 2),
      },
    });
    return ok(updated);
  } catch (e) {
    return serverError("Error al abrir caja", e);
  }
}
