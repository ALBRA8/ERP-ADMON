// ============================================================
// api.ts — Helpers comunes de API (responses, errors, validation)
// ============================================================
import { NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { requireAuth } from "@/lib/auth";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function unauthorized(message = "No autenticado") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "No tiene permisos para esta acción") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Recurso no encontrado") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message: string, error?: unknown) {
  console.error("[serverError]", message, error);
  return NextResponse.json({ error: message }, { status: 500 });
}

// Wrapper que valida sesión y ejecuta el handler
export async function withAuth<T>(
  handler: (session: NonNullable<Awaited<ReturnType<typeof requireAuth>>>) => Promise<T>,
): Promise<T | Response> {
  try {
    const session = await requireAuth();
    return await handler(session);
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return unauthorized();
    throw e;
  }
}

// Validación de cuerpo con Zod
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
  } catch (e) {
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
