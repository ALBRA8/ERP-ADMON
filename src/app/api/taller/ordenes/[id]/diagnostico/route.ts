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
// POST /api/taller/ordenes/[id]/diagnostico
// Body: { diagnostico, tecnicoAsignadoId?, observaciones? }
// Cambia estado a "diagnostico".
// ============================================================

const schema = z.object({
  diagnostico: z.string().min(2),
  tecnicoAsignadoId: z.string().optional(),
  observaciones: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenServicioTecnico.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!orden) return notFound("Orden de servicio no encontrada");

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    if (d.tecnicoAsignadoId) {
      const t = await db.tercero.findFirst({
        where: { id: d.tecnicoAsignadoId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Técnico (tercero) no encontrado");
    }

    const updated = await db.ordenServicioTecnico.update({
      where: { id: orden.id },
      data: {
        diagnostico: d.diagnostico,
        tecnicoAsignadoId: d.tecnicoAsignadoId ?? orden.tecnicoAsignadoId ?? null,
        observaciones: d.observaciones ?? orden.observaciones,
        estado: "diagnostico",
      },
    });
    return ok({ ok: true, orden: updated });
  } catch (e) {
    return serverError("Error al guardar diagnóstico", e);
  }
}
