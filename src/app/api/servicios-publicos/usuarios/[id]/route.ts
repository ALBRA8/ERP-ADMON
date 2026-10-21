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
// /api/servicios-publicos/usuarios/[id]
// GET, PUT, DELETE
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const usuario = await db.usuarioServicio.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        _count: { select: { lecturaMedidors: true } },
      },
    });
    if (!usuario) return notFound("Usuario de servicio no encontrado");
    let tercero = null;
    if (usuario.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: usuario.terceroId },
        select: {
          id: true,
          nombre: true,
          numeroDocumento: true,
          telefono: true,
          direccion: true,
        },
      });
    }
    // última lectura
    const ultimaLectura = await db.lecturaMedidor.findFirst({
      where: { usuarioServicioId: id },
      orderBy: { fechaLectura: "desc" },
    });
    return ok({
      ...usuario,
      tercero,
      ultimaLectura: ultimaLectura ?? null,
    });
  } catch (e) {
    return serverError("Error al obtener usuario de servicio", e);
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
    const exists = await db.usuarioServicio.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return notFound("Usuario de servicio no encontrado");
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const { terceroId, numeroContrato, direccion, estrato, uso, tarifaFija, tarifaVariable, medidor, estado } =
      body ?? {};
    if (terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }
    const usuario = await db.usuarioServicio.update({
      where: { id },
      data: {
        terceroId: terceroId ?? null,
        numeroContrato,
        direccion,
        estrato,
        uso,
        tarifaFija,
        tarifaVariable,
        medidor: medidor ?? null,
        estado: estado ?? exists.estado,
      },
    });
    return ok(usuario);
  } catch (e) {
    return serverError("Error al actualizar usuario de servicio", e);
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
    const exists = await db.usuarioServicio.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { _count: { select: { lecturaMedidors: true } } },
    });
    if (!exists) return notFound("Usuario de servicio no encontrado");
    if (exists._count.lecturaMedidors > 0) {
      // en lugar de borrar, inactivamos
      const upd = await db.usuarioServicio.update({
        where: { id },
        data: { estado: "inactivo" },
      });
      return ok({ ok: true, id, estado: upd.estado, softDelete: true });
    }
    await db.usuarioServicio.delete({ where: { id } });
    return ok({ ok: true, id });
  } catch (e) {
    return serverError("Error al eliminar usuario de servicio", e);
  }
}
