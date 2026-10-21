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
import { registrarSalidaMateriasPrimas } from "@/lib/produccion";

// ============================================================
// POST /api/produccion/ordenes/[id]/iniciar
// Body: { bodegaId }
// Cambia estado a "en_proceso", set fechaInicio = now(),
// registra salidas de materias primas.
// ============================================================

const schema = z.object({
  bodegaId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenProduccion.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!orden) return notFound("Orden de producción no encontrada");

    if (orden.estado !== "borrador" && orden.estado !== "en_proceso") {
      return badRequest(
        `La orden debe estar en estado "borrador" para iniciar (estado actual: ${orden.estado})`,
      );
    }

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    // Validar bodega
    const bodega = await db.bodega.findFirst({
      where: { id: d.bodegaId, empresaId: session.empresaId },
    });
    if (!bodega) return badRequest("Bodega no encontrada");

    // Verificar stock de materias primas
    const detallesMP = await db.detalleOrdenProduccion.findMany({
      where: { ordenId: orden.id, tipo: "materia_prima" },
    });
    const faltantes: { producto: string; requerido: number; disponible: number }[] = [];
    for (const det of detallesMP) {
      if (!det.productoId) continue;
      const saldo = await db.saldoInventario.findUnique({
        where: {
          productoId_bodegaId: {
            productoId: det.productoId,
            bodegaId: d.bodegaId,
          },
        },
      });
      const disponible = saldo ? saldo.cantidad : 0;
      if (disponible < det.cantidad) {
        const prod = await db.producto.findUnique({
          where: { id: det.productoId },
          select: { nombre: true, codigo: true },
        });
        faltantes.push({
          producto: prod ? `${prod.codigo} - ${prod.nombre}` : det.productoId,
          requerido: det.cantidad,
          disponible,
        });
      }
    }
    if (faltantes.length) {
      return badRequest(
        `Stock insuficiente para iniciar la orden. Faltan: ${faltantes
          .map((f) => `${f.producto} (req ${f.requerido}, disp ${f.disponible})`)
          .join("; ")}`,
        { faltantes },
      );
    }

    // Registrar salidas
    const { registrados, totalCosto } = await registrarSalidaMateriasPrimas(
      orden.id,
      d.bodegaId,
    );

    const updated = await db.ordenProduccion.update({
      where: { id: orden.id },
      data: {
        estado: "en_proceso",
        fechaInicio: new Date(),
      },
    });

    return ok({
      ok: true,
      orden: updated,
      salidasRegistradas: registrados,
      totalSalida: totalCosto,
    });
  } catch (e) {
    return serverError("Error al iniciar orden de producción", e);
  }
}
