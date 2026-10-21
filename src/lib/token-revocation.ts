// ============================================================
// token-revocation.ts — Revocación server-side de JWTs (H-ALT-004)
//
// Implementación simple con un Map en memoria (jti → expiraAt).
// Esto cubre el caso de uso principal: invalidar el JWT actual al
// hacer logout, para que un atacante que capturó el JWT no pueda
// seguir usándolo.
//
// LIMITACIÓN: en entornos multi-instancia (serverless, PM2 cluster),
// cada instancia tiene su propio Map. La revocación solo aplica a
// la instancia que procesó el logout. Para producción multi-instancia,
// reemplazar por Redis o tabla `RevokedToken` en BD (ver nota en
// worklog FIX-SEGURIDAD).
// ============================================================

interface RevokedToken {
  jti: string;
  expiraAt: number; // epoch ms
}

const revokedTokens = new Map<string, RevokedToken>();

// Limpieza periódica.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [k, v] of revokedTokens) {
    if (v.expiraAt <= now) revokedTokens.delete(k);
  }
}

/**
 * revokeToken — Marca un JWT como revocado por su jti.
 * El TTL del bucket es el mismo del JWT (12h por defecto en auth.ts).
 */
export function revokeToken(jti: string, expiraAt: number): void {
  const now = Date.now();
  cleanup(now);
  if (expiraAt <= now) return; // ya expiró, no hace falta revocar
  revokedTokens.set(jti, { jti, expiraAt });
}

/**
 * isTokenRevoked — Verifica si un JWT con jti dado está revocado.
 */
export function isTokenRevoked(jti: string | undefined | null): boolean {
  if (!jti) return false; // si no hay jti, no se puede revocar (legacy tokens)
  const now = Date.now();
  cleanup(now);
  const entry = revokedTokens.get(jti);
  if (!entry) return false;
  if (entry.expiraAt <= now) {
    revokedTokens.delete(jti);
    return false;
  }
  return true;
}

/** Número de tokens revocados actualmente (para monitoreo). */
export function revokedTokensCount(): number {
  return revokedTokens.size;
}
