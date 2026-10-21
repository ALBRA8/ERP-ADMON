import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";
import { z } from "zod";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { auditAction } from "@/lib/tenant";
import { logInfo, logWarn } from "@/lib/logger";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// FIX-SEGURIDAD H-ALT-003: rate limiting en /api/auth/login.
// Máximo 10 intentos por IP por minuto (window 60s).
const RATE_LIMIT_LOGIN = { limit: 10, windowMs: 60 * 1000 };

export async function POST(req: NextRequest) {
  try {
    // ---------- Rate limiting ----------
    const ip = getClientIp(req);
    const rlKey = `login:${ip}`;
    const rl = checkRateLimit(rlKey, RATE_LIMIT_LOGIN);
    if (!rl.ok) {
      const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: `Demasiados intentos de login. Intente de nuevo en ${retryAfterSec}s.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          },
        },
      );
    }

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const result = await loginUser(parsed.data.email, parsed.data.password);
    if ("error" in result) {
      // H-ALT-008: auditar login fallido SOLO si tenemos un usuario válido
      // (auditAction fallaría con FK violation si pasamos IDs "unknown").
      // Para usuarios no encontrados, solo logueamos (no auditamos en BD).
      logWarn("login fallido", {
        email: parsed.data.email,
        ip,
      });
      return badRequest(result.error);
    }

    // H-ALT-008: auditar login exitoso.
    await auditAction(
      {
        userId: result.usuario.id,
        empresaId: result.usuario.empresaId,
        email: result.usuario.email,
        nombre: result.usuario.nombre,
        rol: result.usuario.rol as any,
      },
      "login_ok",
      "usuario",
      result.usuario.id,
      { ip },
      ip,
      req.headers.get("user-agent")?.slice(0, 200) ?? null,
    );
    logInfo("login ok", { userId: result.usuario.id, ip });

    return ok({
      usuario: {
        id: result.usuario.id,
        email: result.usuario.email,
        nombre: result.usuario.nombre,
        rol: result.usuario.rol,
      },
      empresa: {
        id: result.empresa.id,
        nit: result.empresa.nit,
        razonSocial: result.empresa.razonSocial,
        nombreComercial: result.empresa.nombreComercial,
      },
    });
  } catch (e) {
    return serverError("Error al iniciar sesión", e);
  }
}
