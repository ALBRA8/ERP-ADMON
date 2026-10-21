import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// POST /api/servicios-publicos/lecturas/bulk
// Body: { lecturas: [{ usuarioServicioId, lecturaActual, bloqueFacturacionId? }] }
// Para cada usuario busca la última lectura anterior automáticamente.
// Devuelve { creadas, errores }
// ============================================================

const itemSchema = z.object({
  usuarioServicioId: z.string(),
  lecturaActual: z.number(),
  bloqueFacturacionId: z.string().nullish(),
});

const schema = z.object({
  lecturas: z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    let creadas = 0;
    const errores: { usuarioServicioId: string; error: string }[] = [];

    for (const item of d.lecturas) {
      try {
        const usuario = await db.usuarioServicio.findFirst({
          where: {
            id: item.usuarioServicioId,
            empresaId: session.empresaId,
          },
        });
        if (!usuario) {
          errores.push({
            usuarioServicioId: item.usuarioServicioId,
            error: "Usuario no encontrado",
          });
          continue;
        }
        const ultima = await db.lecturaMedidor.findFirst({
          where: { usuarioServicioId: usuario.id },
          orderBy: { fechaLectura: "desc" },
        });
        const lecturaAnterior = ultima?.lecturaActual ?? 0;
        const consumo = item.lecturaActual - lecturaAnterior;
        if (consumo < 0) {
          errores.push({
            usuarioServicioId: usuario.id,
            error: `Consumo negativo (ant=${lecturaAnterior}, act=${item.lecturaActual})`,
          });
          continue;
        }
        await db.lecturaMedidor.create({
          data: {
            empresaId: session.empresaId,
            usuarioServicioId: usuario.id,
            bloqueFacturacionId: item.bloqueFacturacionId ?? null,
            fechaLectura: new Date(),
            lecturaAnterior,
            lecturaActual: item.lecturaActual,
            consumo,
            facturada: false,
          },
        });
        creadas++;
      } catch (e: any) {
        errores.push({
          usuarioServicioId: item.usuarioServicioId,
          error: e?.message ?? "Error interno",
        });
      }
    }
    return ok({ creadas, errores, total: d.lecturas.length });
  } catch (e) {
    return serverError("Error en importación masiva de lecturas", e);
  }
}
