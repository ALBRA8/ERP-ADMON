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
// POST /api/cafetero/compras/[id]/control-calidad
// Crea o actualiza (upsert) ControlCalidadCafe (1-1 con la compra).
// Body: { almendraSana, broca, huevos, hongos, defectosTotales } (%)
// ============================================================

const schema = z.object({
  almendraSana: z.number().min(0).max(100),
  broca: z.number().min(0).max(100),
  huecos: z.number().min(0).max(100),
  hongos: z.number().min(0).max(100),
  defectosTotales: z.number().min(0).max(100),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const compra = await db.compraCafe.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { controlCalidad: true },
    });
    if (!compra) return notFound("Compra de café no encontrada");

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    let control = compra.controlCalidad;
    if (control) {
      control = await db.controlCalidadCafe.update({
        where: { id: control.id },
        data: {
          almendraSana: d.almendraSana,
          broca: d.broca,
          huecos: d.huecos,
          hongos: d.hongos,
          defectosTotales: d.defectosTotales,
          fecha: new Date(),
        },
      });
    } else {
      control = await db.controlCalidadCafe.create({
        data: {
          empresaId: session.empresaId,
          compraCafeId: compra.id,
          almendraSana: d.almendraSana,
          broca: d.broca,
          huecos: d.huecos,
          hongos: d.hongos,
          defectosTotales: d.defectosTotales,
          fecha: new Date(),
        },
      });
    }

    return ok({
      ok: true,
      controlCalidad: control,
      compraId: compra.id,
    });
  } catch (e) {
    return serverError("Error al guardar control de calidad", e);
  }
}
