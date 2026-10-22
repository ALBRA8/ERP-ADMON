// ============================================================
// crypto.ts — Utilidades criptográficas para Marsella ERP
// Soluciona los hallazgos críticos del informe Hermes §9:
//   - Hash de contraseñas con bcryptjs (12 rounds)
//   - Cifrado AES-256-GCM para credenciales y tokens (en reposo)
//   - Generación de tokens seguros (randomBytes)
//
// FIX-SEGURIDAD H-CRIT-002: APP_ENCRYPTION_KEY fail-closed en
// producción. No se permite la clave default de 64 ceros.
// ============================================================
import bcrypt from "bcryptjs";
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "crypto";

// ---------- H-CRIT-002: APP_ENCRYPTION_KEY fail-closed ----------
// Lazy validation: solo valida en runtime (cuando se llama encrypt/decrypt),
// no durante el build de Next.js (que corre en NODE_ENV=production).
const ENCRYPTION_KEY_DEFAULT = "0".repeat(64); // 64 ceros hex = 32 bytes cero

function isAllZeros(hex: string): boolean {
  return /^0+$/.test(hex);
}

function getEncryptionKey(): string {
  const env = process.env.APP_ENCRYPTION_KEY;
  if (
    env &&
    /^[0-9a-fA-F]{64}$/.test(env) &&
    !isAllZeros(env) &&
    env !== ENCRYPTION_KEY_DEFAULT
  ) {
    return env;
  }
  // No configurada o insegura.
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE?.includes("build")) {
    throw new Error(
      "APP_ENCRYPTION_KEY debe estar configurada con 64 hex chars (32 bytes) no nulos en producción.",
    );
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[crypto] APP_ENCRYPTION_KEY no configurada. Usando key insegura de fallback (solo dev).",
    );
  }
  return ENCRYPTION_KEY_DEFAULT;
}

// Cache para no re-validar en cada llamada
let _cachedKey: Buffer | null = null;
function getKeyBuffer(): Buffer {
  if (!_cachedKey) {
    _cachedKey = Buffer.from(getEncryptionKey(), "hex");
  }
  return _cachedKey;
}

// ---------- Password hashing ----------
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// ---------- AES-256-GCM (para credenciales, tokens DIAN, etc.) ----------
export function encrypt(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKeyBuffer(), iv);
  const enc = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Formato: iv(12) + tag(16) + ciphertext
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKeyBuffer(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

// ---------- Tokens aleatorios ----------
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

// ---------- Comparación constante-tiempo para secrets ----------
/**
 * safeEqualStrings — Compara dos strings en tiempo constante para
 * evitar timing attacks (usar en validación de secrets como
 * CRON_SECRET, MCP_API_TOKEN, SUPER_ADMIN_SECRET).
 */
export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a ?? "");
  const bufB = Buffer.from(b ?? "");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------- Hash SHA-384 (CUFE helper) ----------
export function sha256(input: string): string {
  return createHash("sha384").update(input, "utf8").digest("hex");
}
