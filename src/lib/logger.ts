// ============================================================
// logger.ts — Logging estructurado para Marsella ERP
// H-ALT-007: en producción no loguea datos sensibles
// (passwords, tokens, CUFEs, JWTs, secrets).
// ============================================================

const isProd = process.env.NODE_ENV === "production";

// Patrones de claves sensibles que se enmascaran en producción.
const SENSITIVE_KEY_PATTERNS = [
  /^password$/i,
  /^passwordHash$/i,
  /^currentPassword$/i,
  /^newPassword$/i,
  /^oldPassword$/i,
  /^secret$/i,
  /^appSecret$/i,
  /^appEncryptionKey$/i,
  /^cronSecret$/i,
  /^superAdminSecret$/i,
  /^mcpApiToken$/i,
  /^token$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^authToken$/i,
  /^apiKey$/i,
  /^authorization$/i,
  /^cufe$/i,
  /^cufeFactura$/i,
  /^trackId$/i,
  /^resetToken$/i,
  /^sessionId$/i,
  /^certificadoP12$/i,
  /^certificadoP12Enc$/i,
  /^softwarePin$/i,
];

// Patrones de valores que parecen tokens/secrets (long + base64/hex).
const SENSITIVE_VALUE_PATTERNS = [
  // JWT (header.payload.signature)
  /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
  // hex de 32+ chars (posible encryption key, secret)
  /^[0-9a-fA-F]{32,}$/,
  // P12 base64 largo
  /^[A-Za-z0-9+/]{200,}={0,2}$/,
];

function maskValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length < 4) return "***";
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return "***";
}

function sanitize(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  if (typeof data !== "object") {
    // Primitivo: si parece token/JWT, enmascara
    if (typeof data === "string" && isProd) {
      for (const re of SENSITIVE_VALUE_PATTERNS) {
        if (re.test(data)) return maskValue(data);
      }
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sanitize);
  }
  const obj = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
    if (isSensitiveKey) {
      out[key] = maskValue(value);
    } else if (value && typeof value === "object") {
      out[key] = sanitize(value);
    } else if (
      typeof value === "string" &&
      isProd &&
      SENSITIVE_VALUE_PATTERNS.some((re) => re.test(value))
    ) {
      out[key] = maskValue(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function format(level: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  if (meta === undefined) return `[${ts}] [${level}] ${msg}`;
  const sanitized = isProd ? sanitize(meta) : meta;
  try {
    return `[${ts}] [${level}] ${msg} ${JSON.stringify(sanitized)}`;
  } catch {
    return `[${ts}] [${level}] ${msg} [unserializable meta]`;
  }
}

export function logInfo(msg: string, meta?: unknown): void {
  console.log(format("INFO", msg, meta));
}

export function logWarn(msg: string, meta?: unknown): void {
  console.warn(format("WARN", msg, meta));
}

export function logError(msg: string, meta?: unknown): void {
  console.error(format("ERROR", msg, meta));
}

export const logger = { logInfo, logWarn, logError };
