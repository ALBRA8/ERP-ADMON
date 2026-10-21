// ============================================================
// MARSELLA ERP — API /api/empresa/plan
// GET : devuelve plan actual + límites + uso actual
// PUT : solo admin del sistema puede cambiar plan o módulos.
//        Body: { plan?, modulos?, limiteUsuarios?, limiteTerceros?,
//                limiteProductos?, limiteFacturasMes?, vigenteHasta?,
//                estado? }
//
// FIX-SEGURIDAD H-CRIT-004: el cambio a plan "enterprise" requiere
// process.env.SUPER_ADMIN_SECRET en el header X-Super-Admin-Secret.
// El founder (rol admin de empresa) no puede auto-asignarse
// enterprise sin ese secret. Cualquier otro plan (free/basic/pro)
// lo puede cambiar el admin de la empresa (downgrade / reorganización
// de módulos), pero "enterprise" es gateado por billing externo.
// ============================================================
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import {
  getResumenPlanUso,
  getPlanEmpresa,
  auditAction,
  MODULOS_SISTEMA,
} from "@/lib/tenant";
import { safeEqualStrings } from "@/lib/crypto";
import { logWarn } from "@/lib/logger";

// ---------- GET ----------
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const resumen = await getResumenPlanUso(session.empresaId);
    return ok(resumen);
  } catch (e) {
    return serverError("Error al obtener plan", e);
  }
}

// ---------- PUT ----------
const updatePlanSchema = z.object({
  empresaId: z.string().optional(), // si no se pasa, usa la empresa del session
  plan: z.enum(["free", "basic", "pro", "enterprise"]).optional(),
  modulos: z.array(z.string()).optional(),
  limiteUsuarios: z.number().int().positive().optional(),
  limiteTerceros: z.number().int().positive().optional(),
  limiteProductos: z.number().int().positive().optional(),
  limiteFacturasMes: z.number().int().positive().optional(),
  vigenteHasta: z.string().optional(), // ISO
  estado: z.enum(["activo", "suspendido", "cancelado"]).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // Solo admin puede cambiar planes
    if (session.rol !== "admin") {
      return forbidden("Solo admin puede modificar planes");
    }
    const body = await req.json();
    const parsed = updatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;
    const empresaId = data.empresaId || session.empresaId;

    // Solo se puede modificar la propia empresa (no cross-tenant).
    if (empresaId !== session.empresaId) {
      return forbidden(
        "No tiene permisos para modificar el plan de otra empresa",
      );
    }

    // H-CRIT-004: el upgrade a "enterprise" requiere SUPER_ADMIN_SECRET.
    // El founder (admin de empresa) no puede auto-asignarse enterprise.
    if (data.plan === "enterprise") {
      const provided = req.headers.get("x-super-admin-secret") ?? "";
      const expected = process.env.SUPER_ADMIN_SECRET ?? "";
      if (!expected || !safeEqualStrings(provided, expected)) {
        logWarn("intent de upgrade a enterprise sin super-admin secret", {
          empresaId,
          userId: session.userId,
        });
        return forbidden(
          "Upgrade a plan 'enterprise' requiere autorización del operador del SaaS (header X-Super-Admin-Secret inválido o ausente).",
        );
      }
    }

    // Asegurar que exista el registro de plan
    await getPlanEmpresa(empresaId);

    // Validar módulos
    let modulosStr: string | undefined;
    if (data.modulos) {
      const invalidos = data.modulos.filter(
        (m) => !MODULOS_SISTEMA.includes(m as any),
      );
      if (invalidos.length > 0) {
        return badRequest(
          `Módulos no válidos: ${invalidos.join(", ")}`,
        );
      }
      modulosStr = JSON.stringify(data.modulos);
    }

    const updated = await db.planSuscripcion.update({
      where: { empresaId },
      data: {
        plan: data.plan,
        modulos: modulosStr,
        limiteUsuarios: data.limiteUsuarios,
        limiteTerceros: data.limiteTerceros,
        limiteProductos: data.limiteProductos,
        limiteFacturasMes: data.limiteFacturasMes,
        vigenteHasta: data.vigenteHasta
          ? new Date(data.vigenteHasta)
          : undefined,
        estado: data.estado,
      },
    });

    await auditAction(
      session,
      "cambiar_plan",
      "empresa",
      empresaId,
      {
        plan: data.plan,
        modulos: data.modulos,
        limites: {
          usuarios: data.limiteUsuarios,
          terceros: data.limiteTerceros,
          productos: data.limiteProductos,
          facturasMes: data.limiteFacturasMes,
        },
        vigenteHasta: data.vigenteHasta,
        estado: data.estado,
      },
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      req.headers.get("user-agent")?.slice(0, 200) ?? null,
    );

    return ok(updated);
  } catch (e) {
    return serverError("Error al actualizar plan", e);
  }
}
