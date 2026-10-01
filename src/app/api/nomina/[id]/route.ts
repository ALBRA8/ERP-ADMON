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
// GET /api/nomina/[id]
// Detalle completo de una nómina con sus DetalleNomina (incluye
// datos del tercero/empleado).
// ============================================================
export async function GET(
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
      include: {
        detalles: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!nomina) return notFound("Nómina no encontrada");

    // Cargar los terceros (empleados) por separado para evitar joins complejos
    const terceroIds = nomina.detalles.map((d) => d.terceroId);
    const terceros = await db.tercero.findMany({
      where: { id: { in: terceroIds } },
      include: { ciudad: true },
    });
    const terceroMap = new Map(terceros.map((t) => [t.id, t]));
    const detallesCompletos = nomina.detalles.map((d) => ({
      ...d,
      tercero: terceroMap.get(d.terceroId) ?? null,
    }));

    // Cargar comprobante contable si existe
    let comprobante: any = null;
    if (nomina.comprobanteContableId) {
      comprobante = await db.comprobante.findUnique({
        where: { id: nomina.comprobanteContableId },
        include: {
          movimientos: {
            include: { cuenta: true },
            orderBy: { debito: "desc" },
          },
        },
      });
    }

    return ok({ ...nomina, detalles: detallesCompletos, comprobante });
  } catch (e) {
    return serverError("Error al obtener nómina", e);
  }
}
