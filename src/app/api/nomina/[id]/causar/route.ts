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

// ============================================================
// POST /api/nomina/[id]/causar
// Cambia el estado de la nómina a "causada". Si la nómina no tiene
// comprobante contable, lo genera. Después de causada, no es editable.
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
      return badRequest("La nómina está anulada, no se puede causar");
    }
    if (nomina.estado === "causada") {
      return badRequest("La nómina ya está causada");
    }

    await db.nomina.update({
      where: { id },
      data: { estado: "causada" },
    });

    return ok({ ok: true, id, estado: "causada" });
  } catch (e) {
    return serverError("Error al causar nómina", e);
  }
}
