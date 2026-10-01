import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, serverError, unauthorized } from "@/lib/api";

// ============================================================
// GET /api/radian/eventos/stats
// Devuelve resumen agregado de eventos Radian:
//   - por_tipo: { 030: N, 031: N, ... }
//   - por_estado: { borrador: N, enviado: N, aceptado: N,
//                   rechazado: N, anulado: N }
//   - total
//   - ultimos_30_dias: [{ fecha: "yyyy-MM-dd", total: N }] para
//     gáfica de barras.
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const where = { empresaId: session.empresaId };

    // ---------- Por tipo ----------
    const porTipoRaw = await db.eventoRadian.groupBy({
      by: ["tipo"],
      where,
      _count: { _all: true },
    });
    const por_tipo: Record<string, number> = {};
    for (const r of porTipoRaw) {
      por_tipo[r.tipo] = r._count._all;
    }

    // ---------- Por estado ----------
    const porEstadoRaw = await db.eventoRadian.groupBy({
      by: ["estado"],
      where,
      _count: { _all: true },
    });
    const por_estado: Record<string, number> = {};
    for (const r of porEstadoRaw) {
      por_estado[r.estado] = r._count._all;
    }

    // ---------- Total ----------
    const total = await db.eventoRadian.count({ where });

    // ---------- Últimos 30 días ----------
    // Traemos todos los eventos de los últimos 30 días y
    // agrupamos por fecha en JS (SQLite no tiene date_trunc).
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    hace30.setHours(0, 0, 0, 0);

    const eventosRecientes = await db.eventoRadian.findMany({
      where: {
        empresaId: session.empresaId,
        fecha: { gte: hace30 },
      },
      select: { fecha: true, tipo: true },
    });

    // Generar bucket por día
    const buckets: Record<
      string,
      { total: number; por_tipo: Record<string, number> }
    > = {};
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { total: 0, por_tipo: {} };
    }
    for (const ev of eventosRecientes) {
      const key = new Date(ev.fecha).toISOString().slice(0, 10);
      if (buckets[key]) {
        buckets[key].total++;
        buckets[key].por_tipo[ev.tipo] =
          (buckets[key].por_tipo[ev.tipo] ?? 0) + 1;
      }
    }

    const ultimos_30_dias = Object.entries(buckets).map(([fecha, v]) => ({
      fecha,
      total: v.total,
      por_tipo: v.por_tipo,
    }));

    return ok({
      por_tipo,
      por_estado,
      total,
      ultimos_30_dias,
    });
  } catch (e) {
    return serverError("Error al obtener estadísticas Radian", e);
  }
}
