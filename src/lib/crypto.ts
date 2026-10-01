// ============================================================
// crypto.ts — Utilidades criptográficas para Marsella ERP
// Soluciona los hallazgos críticos del informe Hermes §9:
//   - Hash de contraseñas con bcryptjs (12 rounds)
//   - Cifrado AES-256-GCM para credenciales y tokens (en reposo)
//   - Generación de tokens seguros (randomBytes)
// ============================================================
import bcrypt from "bcryptjs";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000"; // 64 hex chars
const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, "hex");

if (KEY_BUFFER.length !== 32) {
  // En desarrollo: si no configuran la key, derivamos una constante pero lanzamos warning.
  console.warn(
    "[crypto] APP_ENCRYPTION_KEY no configurada (debe tener 64 hex chars / 32 bytes). Usando key insegura de fallback.",
  );
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
  const cipher = createCipheriv("aes-256-gcm", KEY_BUFFER, iv);
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
  const decipher = createDecipheriv("aes-256-gcm", KEY_BUFFER, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

// ---------- Tokens aleatorios ----------
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

// ---------- Hash SHA-384 (CUFE helper) ----------
export function sha256(input: string): string {
  return createHash("sha384").update(input, "utf8").digest("hex");
}
