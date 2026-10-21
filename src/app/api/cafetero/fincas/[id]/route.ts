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
// /api/cafetero/fincas/[id]
// GET    detalle
// PUT    actualiza
// DELETE elimina
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const finca = await db.finca.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { _count: { select: { compras: true } } },
    });
    if (!finca) return notFound("Finca no encontrada");
    let propietario = null;
    if (finca.propietarioId) {
      propietario = await db.tercero.findUnique({
        where: { id: finca.propietarioId },
        select: { id: true, nombre: true, numeroDocumento: true },
      });
    }
    return ok({ ...finca, propietario });
  } catch (e) {
    return serverError("Error al obtener finca", e);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const exists = await db.finca.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return notFound("Finca no encontrada");
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const { nombre, ubicacion, municipio, propietarioId, hectareas, altura, sombra, observaciones } =
      body ?? {};
    if (propietarioId) {
      const t = await db.tercero.findFirst({
        where: { id: propietarioId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Propietario (tercero) no encontrado");
    }
    const finca = await db.finca.update({
      where: { id },
      data: {
        nombre,
        ubicacion: ubicacion ?? null,
        municipio: municipio ?? null,
        propietarioId: propietarioId ?? null,
        hectareas: hectareas ?? null,
        altura: altura ?? null,
        sombra: sombra ?? false,
        observaciones: observaciones ?? null,
      },
    });
    return ok(finca);
  } catch (e) {
    return serverError("Error al actualizar finca", e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const exists = await db.finca.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { _count: { select: { compras: true } } },
    });
    if (!exists) return notFound("Finca no encontrada");
    if (exists._count.compras > 0) {
      return badRequest(
        `No se puede eliminar: la finca tiene ${exists._count.compras} compra(s) asociada(s)`,
      );
    }
    await db.finca.delete({ where: { id } });
    return ok({ ok: true, id });
  } catch (e) {
    return serverError("Error al eliminar finca", e);
  }
}
