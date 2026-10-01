import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/cafetero/compras/[id]
// Detalle completo de una compra de café
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const compra = await db.compraCafe.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        finca: true,
        controlCalidad: {
          include: {
            // PruebaTaza no tiene relación formal con ControlCalidadCafe;
            // la buscamos vía controlCalidadId luego.
          },
        },
      },
    });
    if (!compra) return notFound("Compra de café no encontrada");

    // Lookup manual de tercero
    let tercero = null;
    if (compra.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: compra.terceroId },
        select: { id: true, nombre: true, numeroDocumento: true, tipo: true, telefono: true, direccion: true },
      });
    }

    // Lookup de PruebaTaza vinculada al controlCalidad
    let pruebaTaza = null;
    if (compra.controlCalidad) {
      pruebaTaza = await db.pruebaTaza.findFirst({
        where: {
          empresaId: session.empresaId,
          controlCalidadId: compra.controlCalidad.id,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return ok({
      ...compra,
      tercero,
      controlCalidad: compra.controlCalidad
        ? { ...compra.controlCalidad, pruebaTaza }
        : null,
    });
  } catch (e) {
    return serverError("Error al obtener compra de café", e);
  }
}
