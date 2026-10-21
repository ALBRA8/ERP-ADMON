// ============================================================
// rate-limit.ts — Rate limiting simple en memoria (H-ALT-003)
//
// Implementación simple basada en un Map<key, {count, resetAt}>.
// NO usar en entornos serverless/multi-instancia sin reemplazar
// por una solución distribuida (Redis, etc.). Para el ERP
// single-instance es suficiente.
//
// Límites sugeridos:
//   - /api/auth/login: 10 intentos / minuto / IP
//   - /api/auth/register: 3 / hora / IP
// ============================================================

interface Bucket {
  count: number;
  resetAt: number; // epoch ms
}

const buckets = new Map<string, Bucket>();

// Limpieza periódica de buckets expirados (cada 5 min).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export interface RateLimitOptions {
  /** Número máximo de requests permitidas en la ventana. */
  limit: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * checkRateLimit — Verifica el rate limit para una clave dada
 * (normalmente IP + ruta). Retorna ok=true si el request es
 * permitido, ok=false si se excedió el límite.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  cleanup(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, limit: opts.limit, remaining: opts.limit - 1, resetAt };
  }
  bucket.count++;
  if (bucket.count > opts.limit) {
    return {
      ok: false,
      limit: opts.limit,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }
  return {
    ok: true,
    limit: opts.limit,
    remaining: opts.limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}

/**
 * getClientIp — Extrae la IP del cliente de los headers comunes.
 * Considera X-Forwarded-For (proxy) y x-real-ip.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // Tomar la primera IP (cliente original)
    return xff.split(",")[0]?.trim() ?? "unknown";
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

/** Resetea el bucket para una clave (para testing o unlock manual). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
