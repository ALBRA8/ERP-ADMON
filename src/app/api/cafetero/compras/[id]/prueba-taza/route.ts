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
// POST /api/cafetero/compras/[id]/prueba-taza
// Crea una PruebaTaza (SCA 100 pts) y la asocia al control de
// calidad de la compra (crea el control si no existe).
// Calcula puntajeTotal y la clasificación SCA.
// ============================================================

const schema = z.object({
  catador: z.string().optional(),
  fragranciaAroma: z.number().min(0).max(10),
  sabor: z.number().min(0).max(10),
  saborResidual: z.number().min(0).max(10),
  acidez: z.number().min(0).max(10),
  cuerpo: z.number().min(0).max(10),
  balance: z.number().min(0).max(10),
  uniformidad: z.number().min(0).max(10),
  tazaLimpia: z.number().min(0).max(10),
  dulzor: z.number().min(0).max(10),
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
    const compra = await db.compraCafe.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { controlCalidad: true },
    });
    if (!compra) return notFound("Compra de café no encontrada");

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    // Asegura que exista el control de calidad (1-1 con compra)
    let controlId = compra.controlCalidad?.id;
    if (!controlId) {
      const cc = await db.controlCalidadCafe.create({
        data: {
          empresaId: session.empresaId,
          compraCafeId: compra.id,
          fecha: new Date(),
        },
      });
      controlId = cc.id;
    }

    // Puntaje total SCA = suma (máx 100 según SCA)
    const puntajeTotal = [
      d.fragranciaAroma,
      d.sabor,
      d.saborResidual,
      d.acidez,
      d.cuerpo,
      d.balance,
      d.uniformidad,
      d.tazaLimpia,
      d.dulzor,
    ].reduce((a, b) => a + b, 0);

    let clasificacion = "comercial_estandar";
    if (puntajeTotal >= 80) clasificacion = "cafe_especial";
    else if (puntajeTotal >= 70) clasificacion = "comercial_bueno";

    const prueba = await db.pruebaTaza.create({
      data: {
        empresaId: session.empresaId,
        controlCalidadId: controlId,
        catador: d.catador ?? null,
        fragranciaAroma: d.fragranciaAroma,
        sabor: d.sabor,
        saborResidual: d.saborResidual,
        acidez: d.acidez,
        cuerpo: d.cuerpo,
        balance: d.balance,
        uniformidad: d.uniformidad,
        tazaLimpia: d.tazaLimpia,
        dulzor: d.dulzor,
        puntajeTotal,
        observaciones: d.observaciones ?? null,
      },
    });

    return ok({
      ok: true,
      pruebaTaza: prueba,
      puntajeTotal,
      clasificacion,
      controlCalidadId: controlId,
    });
  } catch (e) {
    return serverError("Error al crear prueba de taza", e);
  }
}
