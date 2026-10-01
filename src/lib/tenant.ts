// ============================================================
// MARSELLA ERP — Middleware multi-tenant
// requireTenantAccess, auditAction, checkPlanLimits, requireModule
// Garantiza aislamiento por empresaId y respeta los límites del plan
// de suscripción (PlanSuscripcion) y los módulos activos.
// ============================================================
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

// ---------- Catálogos internos ----------

const LIMITES_POR_PLAN: Record<
  string,
  {
    label: string;
    limiteUsuarios: number;
    limiteTerceros: number;
    limiteProductos: number;
    limiteFacturasMes: number;
    modulos: string[];
  }
> = {
  free: {
    label: "Free",
    limiteUsuarios: 3,
    limiteTerceros: 50,
    limiteProductos: 50,
    limiteFacturasMes: 50,
    modulos: ["facturacion", "terceros"],
  },
  basic: {
    label: "Basic",
    limiteUsuarios: 5,
    limiteTerceros: 200,
    limiteProductos: 200,
    limiteFacturasMes: 200,
    modulos: ["facturacion", "terceros", "compras", "cartera", "contabilidad"],
  },
  pro: {
    label: "Pro",
    limiteUsuarios: 15,
    limiteTerceros: 1000,
    limiteProductos: 1000,
    limiteFacturasMes: 1500,
    modulos: [
      "facturacion",
      "terceros",
      "compras",
      "cartera",
      "contabilidad",
      "nomina",
      "bancos",
      "inventario",
      "medios_magneticos",
      "presupuesto",
    ],
  },
  enterprise: {
    label: "Enterprise",
    limiteUsuarios: 100,
    limiteTerceros: 50000,
    limiteProductos: 50000,
    limiteFacturasMes: 50000,
    modulos: [
      "facturacion",
      "terceros",
      "compras",
      "cartera",
      "contabilidad",
      "nomina",
      "bancos",
      "inventario",
      "medios_magneticos",
      "presupuesto",
      "mcp",
      "dian",
      "restaurante",
      "hotel",
    ],
  },
};

// Módulos válidos en el sistema
export const MODULOS_SISTEMA = [
  "facturacion",
  "terceros",
  "compras",
  "cartera",
  "contabilidad",
  "nomina",
  "bancos",
  "inventario",
  "medios_magneticos",
  "presupuesto",
  "mcp",
  "dian",
  "restaurante",
  "hotel",
] as const;

export type ModuloSistema = (typeof MODULOS_SISTEMA)[number];

// ---------- Helpers ----------

/** Obtiene (o crea si no existe) el PlanSuscripcion de la empresa. */
export async function getPlanEmpresa(
  empresaId: string,
): Promise<{
  id: string;
  plan: string;
  modulos: string[];
  limiteUsuarios: number;
  limiteTerceros: number;
  limiteProductos: number;
  limiteFacturasMes: number;
  vigenteHasta: Date | null;
  estado: string;
}> {
  let plan = await db.planSuscripcion.findUnique({
    where: { empresaId },
  });
  if (!plan) {
    plan = await db.planSuscripcion.create({
      data: {
        empresaId,
        plan: "free",
        modulos: JSON.stringify(LIMITES_POR_PLAN.free.modulos),
        limiteUsuarios: LIMITES_POR_PLAN.free.limiteUsuarios,
        limiteTerceros: LIMITES_POR_PLAN.free.limiteTerceros,
        limiteProductos: LIMITES_POR_PLAN.free.limiteProductos,
        limiteFacturasMes: LIMITES_POR_PLAN.free.limiteFacturasMes,
        estado: "activo",
      },
    });
  }
  let modulos: string[] = [];
  try {
    modulos = JSON.parse(plan.modulos) as string[];
    if (!Array.isArray(modulos)) modulos = [];
  } catch {
    modulos = [];
  }
  if (modulos.length === 0) {
    const def = LIMITES_POR_PLAN[plan.plan] ?? LIMITES_POR_PLAN.free;
    modulos = def.modulos;
  }
  return {
    id: plan.id,
    plan: plan.plan,
    modulos,
    limiteUsuarios: plan.limiteUsuarios,
    limiteTerceros: plan.limiteTerceros,
    limiteProductos: plan.limiteProductos,
    limiteFacturasMes: plan.limiteFacturasMes,
    vigenteHasta: plan.vigenteHasta,
    estado: plan.estado,
  };
}

/**
 * requireTenantAccess — Valida que `entityId` pertenezca a la empresa
 * del usuario autenticado. Lanza error si la entidad no existe o no
 * pertenece a la empresa de la sesión.
 *
 * Soporta las entidades más comunes: factura, facturaCompra, reciboCaja,
 * comprobanteEgreso, tercero, producto, medioMagnetico, etc.
 */
export async function requireTenantAccess(
  session: SessionPayload,
  entidad: string,
  entityId: string,
): Promise<{ ok: true; data: any } | { ok: false; code: string; message: string }> {
  const empresaId = session.empresaId;
  try {
    let registro: any = null;
    switch (entidad) {
      case "factura":
      case "facturaVenta":
        registro = await db.facturaVenta.findUnique({
          where: { id: entityId },
          select: { id: true, empresaId: true },
        });
        break;
      case "facturaCompra":
        registro = await db.facturaCompra.findUnique({
          where: { id: entityId },
          select: { id: true, empresaId: true },
        });
        break;
      case "reciboCaja":
        registro = await db.reciboCaja.findUnique({
          where: { id: entityId },
          select: { id: true, empresaId: true },
        });
        break;
      case "comprobanteEgreso":
      case "egreso":
        registro = await db.comprobanteEgreso.findUnique({
          where: { id: entityId },
          select: { id: true, empresaId: true },
        });
        break;
      case "tercero":
        registro = await db.tercero.findUnique({
          where: { id: entityId },
          select: { id: true, empresaId: true },
        });
        break;
      case "producto":
        registro = await db.producto.findUnique({
          where: { id: entityId },
          select: { id: true, empresaId: true },
        });
        break;
      case "medioMagnetico":
        registro = await db.medioMagnetico.findUnique({
          where: { id: entityId },
          select: { id: true, empresaId: true },
        });
        break;
      case "empresa":
        // Especial: la entidad coincide con la empresa del usuario
        if (entityId === empresaId) {
          return { ok: true, data: { id: entityId, empresaId } };
        }
        return {
          ok: false,
          code: "FORBIDDEN_TENANT",
          message: "La empresa no pertenece al usuario",
        };
      default:
        return {
          ok: false,
          code: "ENTIDAD_NO_SOPORTADA",
          message: `Entidad '${entidad}' no soportada para validación de tenant`,
        };
    }
    if (!registro) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: `${entidad} no encontrada`,
      };
    }
    if (registro.empresaId !== empresaId) {
      return {
        ok: false,
        code: "FORBIDDEN_TENANT",
        message: `Acceso denegado: ${entidad} no pertenece a su empresa`,
      };
    }
    return { ok: true, data: registro };
  } catch (e: any) {
    return {
      ok: false,
      code: "TENANT_CHECK_ERROR",
      message: e?.message ?? "Error validando acceso tenant",
    };
  }
}

/**
 * auditAction — Registra un evento en AuditoriaMultiTenant.
 * Best-effort: si falla el log, no rompe la operación principal.
 */
export async function auditAction(
  session: SessionPayload,
  accion: string,
  entidad?: string,
  entityId?: string,
  detalles?: any,
  ip?: string | null,
  userAgent?: string | null,
): Promise<void> {
  try {
    await db.auditoriaMultiTenant.create({
      data: {
        empresaId: session.empresaId,
        userId: session.userId,
        accion,
        entidad: entidad ?? null,
        entityId: entityId ?? null,
        detalles: detalles ? JSON.stringify(detalles) : null,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });
  } catch (e) {
    // No romper el flujo principal por errores de auditoría
    console.error("[auditAction] error registrando auditoría:", e);
  }
}

/**
 * checkPlanLimits — Verifica límites del plan antes de crear una entidad.
 * tipoEntidad: "usuarios" | "terceros" | "productos" | "facturasMes"
 * Devuelve { ok, motivo?, limite, actual }.
 */
export async function checkPlanLimits(
  session: SessionPayload,
  tipoEntidad: "usuarios" | "terceros" | "productos" | "facturasMes",
): Promise<{
  ok: boolean;
  motivo?: string;
  limite: number;
  actual: number;
}> {
  const plan = await getPlanEmpresa(session.empresaId);
  if (plan.estado === "suspendido") {
    return {
      ok: false,
      motivo: "Plan suspendido. Contacte al administrador.",
      limite: 0,
      actual: 0,
    };
  }
  if (plan.vigenteHasta && plan.vigenteHasta < new Date()) {
    return {
      ok: false,
      motivo: "Suscripción vencida. Renueve para continuar.",
      limite: 0,
      actual: 0,
    };
  }

  let limite = 0;
  let actual = 0;
  switch (tipoEntidad) {
    case "usuarios":
      limite = plan.limiteUsuarios;
      actual = await db.usuario.count({
        where: { empresaId: session.empresaId },
      });
      break;
    case "terceros":
      limite = plan.limiteTerceros;
      actual = await db.tercero.count({
        where: { empresaId: session.empresaId },
      });
      break;
    case "productos":
      limite = plan.limiteProductos;
      actual = await db.producto.count({
        where: { empresaId: session.empresaId },
      });
      break;
    case "facturasMes": {
      limite = plan.limiteFacturasMes;
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      actual = await db.facturaVenta.count({
        where: {
          empresaId: session.empresaId,
          createdAt: { gte: inicioMes },
        },
      });
      break;
    }
    default:
      return { ok: false, motivo: "Tipo de entidad inválido", limite: 0, actual: 0 };
  }

  if (actual >= limite) {
    return {
      ok: false,
      motivo: `Límite alcanzado: ${actual}/${limite} ${tipoEntidad}. Upgrade su plan para continuar.`,
      limite,
      actual,
    };
  }
  return { ok: true, limite, actual };
}

/**
 * requireModule — Verifica que la empresa tenga el módulo activo
 * en PlanSuscripcion.modulos. Devuelve { ok: true } o
 * { ok: false, code: "MODULE_NOT_ENABLED" }.
 */
export async function requireModule(
  session: SessionPayload,
  modulo: string,
): Promise<{ ok: boolean; code?: string; message?: string }> {
  const plan = await getPlanEmpresa(session.empresaId);
  if (plan.estado === "suspendido") {
    return {
      ok: false,
      code: "PLAN_SUSPENDIDO",
      message: "Plan suspendido",
    };
  }
  if (!plan.modulos.includes(modulo)) {
    return {
      ok: false,
      code: "MODULE_NOT_ENABLED",
      message: `El módulo '${modulo}' no está activo en su plan (${plan.plan}).`,
    };
  }
  return { ok: true };
}

/** Devuelve info consolidada de plan + uso actual para dashboard admin. */
export async function getResumenPlanUso(empresaId: string) {
  const plan = await getPlanEmpresa(empresaId);
  const [usuarios, terceros, productos, facturasMes] = await Promise.all([
    db.usuario.count({ where: { empresaId } }),
    db.tercero.count({ where: { empresaId } }),
    db.producto.count({ where: { empresaId } }),
    (async () => {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      return db.facturaVenta.count({
        where: { empresaId, createdAt: { gte: inicioMes } },
      });
    })(),
  ]);
  const def = LIMITES_POR_PLAN[plan.plan] ?? LIMITES_POR_PLAN.free;
  return {
    plan: plan.plan,
    label: def.label,
    estado: plan.estado,
    vigenteHasta: plan.vigenteHasta,
    modulos: plan.modulos,
    modulosDisponibles: MODULOS_SISTEMA,
    limites: {
      usuarios: plan.limiteUsuarios,
      terceros: plan.limiteTerceros,
      productos: plan.limiteProductos,
      facturasMes: plan.limiteFacturasMes,
    },
    uso: {
      usuarios,
      terceros,
      productos,
      facturasMes,
    },
  };
}

/** Lista de planes disponibles para mostrar en UI de upgrade. */
export const PLANES_DISPONIBLES = Object.entries(LIMITES_POR_PLAN).map(
  ([key, v]) => ({
    plan: key,
    label: v.label,
    limiteUsuarios: v.limiteUsuarios,
    limiteTerceros: v.limiteTerceros,
    limiteProductos: v.limiteProductos,
    limiteFacturasMes: v.limiteFacturasMes,
    modulos: v.modulos,
  }),
);
