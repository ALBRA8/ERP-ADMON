// ============================================================
// csrf.ts — Double-Submit Cookie CSRF protection
// H-CRIT-006: Protección CSRF para endpoints que mutan estado.
//
// Estrategia:
//  - getCsrfToken(): emite (si no existe) una cookie no-httpOnly
//    `marsella_csrf` con un token aleatorio. La lee el cliente JS
//    y la envía de vuelta como header `X-CSRF-Token` en cada
//    mutación (POST/PUT/DELETE).
//  - requireCsrf(req): retorna `null` si el request es válido
//    (cookie + header coinciden), o `Response 403` si no.
//    En modo "lenient" (por defecto): si NO hay cookie csrf seteada,
//    se permite el request (backward-compat con clientes que aún
//    no implementan CSRF). Una vez el cliente opta-in (vía GET
//    /api/auth/csrf), todos los futuros requests deben incluir
//    el header.
// ============================================================
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const CSRF_COOKIE = "marsella_csrf";
const CSRF_HEADER = "x-csrf-token";
const CSRF_TTL_SECONDS = 60 * 60 * 12; // 12h

function generateToken(): string {
  // crypto.randomUUID() está disponible en Node 19+ y Edge.
  // Concatenamos dos para mayor entropía.
  return crypto.randomUUID() + crypto.randomUUID();
}

export async function getCsrfToken(): Promise<string> {
  const c = await cookies();
  let token = c.get(CSRF_COOKIE)?.value;
  if (!token || token.length < 32) {
    token = generateToken();
    c.set(CSRF_COOKIE, token, {
      httpOnly: false, // accesible desde JS para enviar en header
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: CSRF_TTL_SECONDS,
    });
  }
  return token;
}

/**
 * requireCsrf — Valida el token CSRF del request.
 * Retorna `null` si el request es válido (cookie y header coinciden
 * o no hay cookie CSRF seteada aún → modo backward-compat).
 * Retorna `Response 403` si la cookie existe pero el header falta
 * o no coincide.
 */
export async function requireCsrf(req: Request): Promise<Response | null> {
  const c = await cookies();
  const cookieToken = c.get(CSRF_COOKIE)?.value;
  // Modo lenient: si no hay cookie CSRF seteada, el cliente aún no
  // ha optado-in. Permitir el request (no hay protección, pero no
  // rompemos flujos existentes).
  if (!cookieToken) return null;

  const headerToken = req.headers.get(CSRF_HEADER);
  if (!headerToken) {
    return NextResponse.json(
      { error: "CSRF token requerido (header X-CSRF-Token faltante)" },
      { status: 403 },
    );
  }

  // Comparación constante-tiempo para evitar timing attacks.
  if (!safeEqual(cookieToken, headerToken)) {
    return NextResponse.json(
      { error: "CSRF token inválido" },
      { status: 403 },
    );
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Limpia la cookie CSRF (usado en logout). */
export async function clearCsrfCookie(): Promise<void> {
  const c = await cookies();
  c.set(CSRF_COOKIE, "", { path: "/", maxAge: 0 });
}
