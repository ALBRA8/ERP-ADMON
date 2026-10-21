import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, unauthorized } from "@/lib/api";
import { procesarColaDIAN } from "@/lib/dian-real";
import { safeEqualStrings } from "@/lib/crypto";

// ============================================================
// POST /api/dian/cron
// Endpoint para invocar desde un cron externo. Protegido con
// header X-Cron-Secret == process.env.CRON_SECRET (401 si no coincide).
// Procesa la cola de DIANEnvio pendientes para TODAS las empresas.
// FIX-SEGURIDAD H-ALT-006 (audit): usar timingSafeEqual para evitar
// timing attacks en la comparación del secret.
// ============================================================
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || !safeEqualStrings(secret, expected)) {
    return unauthorized("Cron secret inválido");
  }

  // Procesar todas las empresas activas con ConfiguracionDIAN
  const empresas = await db.configuracionDIAN.findMany({
    where: { activo: true },
    select: { empresaId: true },
    distinct: ["empresaId"],
  });

  const summary = {
    empresas: empresas.length,
    processed: 0,
    accepted: 0,
    rejected: 0,
    errors: 0,
    rescheduled: 0,
    perEmpresa: [] as Array<{ empresaId: string; result: any }>,
  };

  for (const emp of empresas) {
    try {
      const r = await procesarColaDIAN(emp.empresaId, 100);
      summary.processed += r.processed;
      summary.accepted += r.accepted;
      summary.rejected += r.rejected;
      summary.errors += r.errors;
      summary.rescheduled += r.rescheduled;
      summary.perEmpresa.push({ empresaId: emp.empresaId, result: r });
    } catch (e: any) {
      summary.perEmpresa.push({
        empresaId: emp.empresaId,
        result: { error: e?.message ?? String(e) },
      });
    }
  }

  return ok(summary);
}
