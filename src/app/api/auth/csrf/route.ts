// ============================================================
// /api/auth/csrf — Emite un token CSRF (double-submit cookie)
// FIX-SEGURIDAD H-CRIT-006: el cliente debe llamar este endpoint
// (GET) al iniciar la sesión para obtener el token, y luego
// incluirlo como header X-CSRF-Token en cada mutación (POST/PUT/DELETE).
// ============================================================
import { ok } from "@/lib/api";
import { getCsrfToken } from "@/lib/csrf";

export async function GET() {
  const token = await getCsrfToken();
  return ok({ token });
}
