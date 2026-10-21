// ============================================================
// /api/mcp/conexiones/route.ts — CRUD de conexiones MCP externas
// ============================================================
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound, getQuery } from "@/lib/api";
import { getSession, requirePermission } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { requireCsrf } from "@/lib/csrf";
import { auditAction } from "@/lib/tenant";
import { logInfo, logWarn } from "@/lib/logger";
import { isPrivateOrBlockedHost } from "@/lib/url-safety";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const items = await db.mCPConexion.findMany({
      where: { empresaId: session.empresaId },
      orderBy: { createdAt: "desc" },
    });
    // No devolvemos authTokenEnc; sí devolvemos catálogos parseados
    const safe = items.map((c) => {
      const { authTokenEnc, resources, tools, prompts, ...rest } = c;
      return {
        ...rest,
        hasAuthToken: !!authTokenEnc,
        resourcesCount: countJson(resources),
        toolsCount: countJson(tools),
        promptsCount: countJson(prompts),
        resourcesList: parseJsonArr(resources),
        toolsList: parseJsonArr(tools),
        promptsList: parseJsonArr(prompts),
      };
    });
    return ok({ items: safe });
  } catch (e) {
    return serverError("Error al listar conexiones MCP", e);
  }
}

function countJson(s: string | null): number {
  if (!s) return 0;
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function parseJsonArr(s: string | null): any[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const createSchema = z.object({
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  tipoTransporte: z.enum(["sse", "websocket", "stdio"]).default("sse"),
  endpoint: z.string().url(),
  authToken: z.string().optional(),
  authHeader: z.string().default("Authorization"),
  authPrefix: z.string().default("Bearer"),
  activo: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // FIX-SEGURIDAD H-CRIT-003: RBAC — solo admin puede crear conexiones MCP.
    const denied = await requirePermission(session, "mcp:write");
    if (denied) return denied;
    // FIX-SEGURIDAD H-CRIT-006: CSRF protection.
    const csrfDenied = await requireCsrf(req);
    if (csrfDenied) return csrfDenied;
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    // FIX-SEGURIDAD H-ALT-005 (SSRF): bloquear endpoints que apunten a
    // IPs privadas / localhost / link-local / metadata cloud.
    const urlCheck = isPrivateOrBlockedHost(d.endpoint);
    if (!urlCheck.ok) {
      logWarn("mcp conexion endpoint bloqueado por SSRF", {
        endpoint: d.endpoint,
        reason: urlCheck.reason,
        userId: session.userId,
      });
      return badRequest(`Endpoint no permitido: ${urlCheck.reason}`);
    }

    const conexion = await db.mCPConexion.create({
      data: {
        empresaId: session.empresaId,
        nombre: d.nombre,
        descripcion: d.descripcion ?? null,
        tipoTransporte: d.tipoTransporte,
        endpoint: d.endpoint,
        authTokenEnc: d.authToken ? encrypt(d.authToken) : null,
        authHeader: d.authHeader,
        authPrefix: d.authPrefix,
        activo: d.activo,
      },
    });

    // FIX-SEGURIDAD H-ALT-008: auditar creación de conexión MCP.
    await auditAction(
      session,
      "mcp_conexion_create",
      "mCPConexion",
      conexion.id,
      { nombre: d.nombre, endpoint: d.endpoint, tipoTransporte: d.tipoTransporte },
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      req.headers.get("user-agent")?.slice(0, 200) ?? null,
    );
    logInfo("mcp conexion creada", {
      conexionId: conexion.id,
      endpoint: d.endpoint,
    });

    const { authTokenEnc, ...safe } = conexion;
    return ok({ ...safe, hasAuthToken: !!authTokenEnc });
  } catch (e) {
    return serverError("Error al crear conexión MCP", e);
  }
}

const updateSchema = z.object({
  id: z.string(),
  nombre: z.string().min(2).optional(),
  descripcion: z.string().optional(),
  tipoTransporte: z.enum(["sse", "websocket", "stdio"]).optional(),
  endpoint: z.string().url().optional(),
  authToken: z.string().optional(),
  authHeader: z.string().optional(),
  authPrefix: z.string().optional(),
  activo: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // FIX-SEGURIDAD H-CRIT-003: RBAC — solo admin puede modificar conexiones MCP.
    const denied = await requirePermission(session, "mcp:write");
    if (denied) return denied;
    // FIX-SEGURIDAD H-CRIT-006: CSRF protection.
    const csrfDenied = await requireCsrf(req);
    if (csrfDenied) return csrfDenied;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const { id, authToken, ...rest } = d;
    const existing = await db.mCPConexion.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return notFound("Conexión no encontrada");

    // FIX-SEGURIDAD H-ALT-005 (SSRF): si se actualiza el endpoint,
    // validar que no apunte a host privado/blocked.
    if (rest.endpoint) {
      const urlCheck = isPrivateOrBlockedHost(rest.endpoint);
      if (!urlCheck.ok) {
        return badRequest(`Endpoint no permitido: ${urlCheck.reason}`);
      }
    }

    const data: any = { ...rest };
    if (authToken !== undefined) {
      data.authTokenEnc = authToken ? encrypt(authToken) : null;
    }
    const updated = await db.mCPConexion.update({ where: { id }, data });
    const { authTokenEnc, ...safe } = updated;
    return ok({ ...safe, hasAuthToken: !!authTokenEnc });
  } catch (e) {
    return serverError("Error al actualizar conexión MCP", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // FIX-SEGURIDAD H-CRIT-003: RBAC — solo admin puede eliminar conexiones MCP.
    const denied = await requirePermission(session, "mcp:write");
    if (denied) return denied;
    // FIX-SEGURIDAD H-CRIT-006: CSRF protection.
    const csrfDenied = await requireCsrf(req);
    if (csrfDenied) return csrfDenied;
    const id = getQuery(req, "id");
    if (!id) return badRequest("id requerido");
    const existing = await db.mCPConexion.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return notFound("Conexión no encontrada");
    await db.mCPConexion.delete({ where: { id } });

    // FIX-SEGURIDAD H-ALT-008: auditar eliminación.
    await auditAction(
      session,
      "mcp_conexion_delete",
      "mCPConexion",
      id,
      { nombre: existing.nombre },
    );

    return ok({ ok: true });
  } catch (e) {
    return serverError("Error al eliminar conexión MCP", e);
  }
}
