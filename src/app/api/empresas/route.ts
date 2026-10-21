// ============================================================
// MARSELLA ERP — API /api/empresas
// GET  : devuelve la empresa de la sesión + catálogos asociados
//        (?op=tipos-documento | ?op=resoluciones opcional)
// PUT  : actualiza los campos editables de la empresa del usuario
// Valida sesión con getSession() y filtra SIEMPRE por empresaId.
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
  getQuery,
} from "@/lib/api";
import { getSession, hasPermission, requirePermission } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";

// ---------- GET ----------
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const op = getQuery(req, "op");

    // Catálogo: tipos de documento (read-only informativo)
    if (op === "tipos-documento") {
      const tipos = await db.tipoDocumento.findMany({
        where: { empresaId: session.empresaId },
        orderBy: { codigo: "asc" },
      });
      return ok(tipos);
    }

    // Catálogo: resoluciones DIAN (vista rápida)
    if (op === "resoluciones") {
      const resoluciones = await db.resolucionDian.findMany({
        where: { empresaId: session.empresaId },
        orderBy: { fechaResolucion: "desc" },
      });
      return ok(resoluciones);
    }

    // Por defecto: empresa completa
    const empresa = await db.empresa.findUnique({
      where: { id: session.empresaId },
    });
    if (!empresa) return badRequest("Empresa no encontrada");
    return ok(empresa);
  } catch (e) {
    return serverError("Error al obtener empresa", e);
  }
}

// ---------- PUT ----------
const empresaUpdateSchema = z.object({
  id: z.string().min(1),
  nit: z.string().min(3).optional(),
  razonSocial: z.string().min(2).optional(),
  nombreComercial: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  website: z.string().optional().or(z.literal("")).nullable(),
  representanteLegal: z.string().optional().nullable(),
  regimenTributario: z
    .enum(["simple", "comun", "gran_contribuyente"])
    .optional(),
  responsabilidad: z.enum(["iva", "no_responsable"]).optional(),
  moneda: z.enum(["COP", "USD", "EUR", "MXN", "ARS"]).optional(),
  decimales: z.number().int().min(0).max(6).optional(),
  zonaHoraria: z.string().optional(),
  logo: z.string().optional().nullable(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // FIX-SEGURIDAD H-CRIT-003: RBAC granular — solo admin y contador.
    const denied = await requirePermission(session, "parametros:write");
    if (denied) return denied;
    // FIX-SEGURIDAD H-CRIT-006: CSRF protection.
    const csrfDenied = await requireCsrf(req);
    if (csrfDenied) return csrfDenied;
    // Backward-compat: el check anterior era parametros:read; lo dejamos
    // como defensa en profundidad (ya cubierto por requirePermission arriba).
    if (!hasPermission(session.rol, "parametros:write")) {
      return forbidden("Su rol no permite editar parámetros");
    }

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = empresaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    // Seguridad: el id del cuerpo debe coincidir con la empresa de la sesión
    if (data.id !== session.empresaId) {
      return forbidden("No puede editar otra empresa");
    }

    // Separar id, el resto va a data
    const { id, ...patch } = data;

    // Limpiar strings vacíos → null para campos opcionales
    const cleanPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (v === "" && ["email", "website", "logo", "nombreComercial",
        "direccion", "telefono", "ciudad", "representanteLegal"].includes(k)) {
        cleanPatch[k] = null;
      } else {
        cleanPatch[k] = v;
      }
    }

    const updated = await db.empresa.update({
      where: { id: session.empresaId },
      data: cleanPatch,
    });

    return ok(updated);
  } catch (e) {
    return serverError("Error al actualizar empresa", e);
  }
}
