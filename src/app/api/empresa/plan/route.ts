// ============================================================
// MARSELLA ERP — API /api/empresa/plan
// GET : devuelve plan actual + límites + uso actual
// PUT : solo admin del sistema puede cambiar plan o módulos
//        Body: { plan?, modulos?, limiteUsuarios?, limiteTerceros?,
//                limiteProductos?, limiteFacturasMes?, vigenteHasta?,
//                estado? }
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

    // Si la empresa objetivo no es la del usuario, validar que sea admin
    // del sistema (en SaaS real se validaría rol de superadmin).
    // Aquí permitimos solo modificar la propia empresa por ahora.
    if (empresaId !== session.empresaId) {
      return forbidden(
        "No tiene permisos para modificar el plan de otra empresa",
      );
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
    );

    return ok(updated);
  } catch (e) {
    return serverError("Error al actualizar plan", e);
  }
}
