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
// GET /api/taller/ordenes/[id]
// Detalle completo: orden + detalles + tercero + técnico
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenServicioTecnico.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        detalleServicioTecnicos: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!orden) return notFound("Orden de servicio no encontrada");

    // Lookup tercero y técnico
    const ids = [orden.terceroId, orden.tecnicoAsignadoId].filter(
      Boolean,
    ) as string[];
    const terceros = ids.length
      ? await db.tercero.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            nombre: true,
            numeroDocumento: true,
            telefono: true,
            email: true,
            direccion: true,
          },
        })
      : [];
    const tmap = new Map(terceros.map((t) => [t.id, t]));

    return ok({
      ...orden,
      tercero: orden.terceroId ? tmap.get(orden.terceroId) ?? null : null,
      tecnico: orden.tecnicoAsignadoId
        ? tmap.get(orden.tecnicoAsignadoId) ?? null
        : null,
    });
  } catch (e) {
    return serverError("Error al obtener orden de servicio", e);
  }
}
