// ============================================================
// api.ts — Helpers comunes de API (responses, errors, validation)
// Refactor A-CRIT-006: withAuth/parseBody útiles + serialización
// Decimal (Prisma) → number para que los componentes UI (que usan
// `number`) sigan funcionando tras la migración Float→Decimal
// (A-CRIT-002) sin tener que refactorizar cada consumidor.
// ============================================================
import { NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { requireAuth, hasPermission, type SessionPayload } from "@/lib/auth";

// ---------- Serialización Decimal → number ----------
// Prisma con SQLite expone los campos `Decimal` como instancias de
// `Decimal` (decimal.js), cuyo `valueOf()` devuelve *string* y cuyo
// `toJSON()` también devuelve string. Si los enviamos tal cual al
// cliente, JSON.stringify los serializa como STRING (ej. "17000") y
// además la aritmética `decimal + 1` produce concatenación de
// strings. Para no tener que envolver cada lectura con `Number()` en
// 150 endpoints, pre-procesamos el árbol de datos antes de
// serializar, convirtiendo cualquier Decimal a number.
function isDecimalLike(v: unknown): v is { toNumber: () => number } {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { toNumber?: unknown }).toNumber === "function"
  );
}

function convertDecimals(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isDecimalLike(value)) return value.toNumber();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = convertDecimals(value[i]);
    }
    return out;
  }
  if (typeof value === "object") {
    // Date y RegExp pasan tal cual (no son "planos")
    if (value instanceof Date || value instanceof RegExp) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = convertDecimals(v);
    }
    return out;
  }
  return value;
}

function jsonBody(data: unknown, init?: ResponseInit): NextResponse {
  // Pre-procesamos el árbol para convertir Decimal → number antes
  // de JSON.stringify (que llamaría toJSON y devolvería string).
  const processed = convertDecimals(data);
  return NextResponse.json(processed, init);
}

export function ok<T>(data: T, init?: ResponseInit) {
  return jsonBody(data, init);
}

export function badRequest(message: string, details?: unknown) {
  return jsonBody({ error: message, details }, { status: 400 });
}

export function unauthorized(message = "No autenticado") {
  return jsonBody({ error: message }, { status: 401 });
}

export function forbidden(message = "No tiene permisos para esta acción") {
  return jsonBody({ error: message }, { status: 403 });
}

export function notFound(message = "Recurso no encontrado") {
  return jsonBody({ error: message }, { status: 404 });
}

export function serverError(message: string, error?: unknown) {
  // No filtrar stack traces ni errores Prisma al cliente (A-ALT-006).
  // El log completo queda en el servidor; al cliente solo message.
  console.error("[serverError]", message, error);
  return jsonBody({ error: message }, { status: 500 });
}

// ---------- RBAC helpers ----------
/**
 * Verifica que la sesión tenga el permiso requerido.
 * Devuelve `null` si está permitido, o una `Response` 403 si no.
 */
export function requirePermission(
  session: SessionPayload,
  permission: string,
): Response | null {
  if (hasPermission(session.rol, permission)) return null;
  return forbidden(`Permiso requerido: ${permission}`);
}

// ---------- Wrappers estandarizados (A-CRIT-006) ----------
/**
 * `withAuth` valida la sesión (y opcionalmente un permiso RBAC) y
 * ejecuta el handler con la sesión garantizada. Reemplaza el patrón
 * manual `await getSession(); if (!session) return unauthorized();`
 * repetido en 143 endpoints.
 *
 * Uso:
 *   export async function GET(req: NextRequest) {
 *     return withAuth(req, { permission: "terceros:read" }, async (session) => {
 *       ...
 *       return ok(data);
 *     });
 *   }
 */
export async function withAuth<T>(
  req: Request,
  options: { permission?: string },
  handler: (session: SessionPayload, req: Request) => Promise<T>,
): Promise<T | Response> {
  try {
    const session = await requireAuth();
    if (options.permission) {
      const forbidden = requirePermission(session, options.permission);
      if (forbidden) return forbidden;
    }
    return await handler(session, req);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    // Cualquier otro error se propaga al try/catch del caller
    throw e;
  }
}

/**
 * `parseBody` valida el cuerpo JSON de la request con un schema Zod.
 * Devuelve `{ data }` tipado si pasa la validación, o `{ error }` con
 * la Response 400 lista para retornar si falla.
 *
 * Uso:
 *   const parsed = await parseBody(req, schema);
 *   if ("error" in parsed) return parsed.error;
 *   const data = parsed.data;
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T } | { error: Response }> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return {
        error: badRequest("Datos inválidos", result.error.flatten()),
      };
    }
    return { data: result.data };
  } catch {
    return { error: badRequest("JSON inválido") };
  }
}

export function getQuery(req: Request, key: string): string | undefined {
  const url = new URL(req.url);
  return url.searchParams.get(key) ?? undefined;
}

export function getQueryInt(
  req: Request,
  key: string,
  def?: number,
): number | undefined {
  const v = getQuery(req, key);
  if (v === undefined || v === "") return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
