// ============================================================
// url-safety.ts — Validación de URLs para prevenir SSRF
// FIX-SEGURIDAD H-ALT-005 (parte SSRF): bloquea endpoints que
// apunten a IPs privadas / loopback / link-local / metadata cloud.
// ============================================================

export interface UrlSafetyResult {
  ok: boolean;
  reason?: string;
}

// Hosts/IPs bloqueadas (privadas, loopback, link-local, cloud metadata).
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

const BLOCKED_HOSTNAME_PREFIXES = [
  "169.254.", // link-local + AWS/GCP/Azure IMDS
  "127.",
  "0.0.0.0",
  "::1",
  "fc",
  "fd",
  "fe80",
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
];

const BLOCKED_PROTOCOLS = ["file:", "ftp:", "gopher:", "data:", "javascript:"];

/**
 * isPrivateOrBlockedHost — Valida que una URL no apunte a un host
 * privado/loopback/link-local/metadata. Esta es una verificación
 * de string-only (sin DNS lookup) para no bloquear requests con
 * latencia alta. Es defensa en profundidad — no sustituye a un
 * proxy saliente con filtrado egress.
 */
export function isPrivateOrBlockedHost(urlStr: string): UrlSafetyResult {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }

  // Bloquear protocolos no HTTP(S).
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Protocolo no permitido: ${url.protocol}` };
  }
  if (BLOCKED_PROTOCOLS.includes(url.protocol)) {
    return { ok: false, reason: `Protocolo bloqueado: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Hostnames literales bloqueados.
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `Host bloqueado: ${host}` };
  }

  // Si el host es una IP literal, validar rangos privados.
  if (isIPv4(host)) {
    for (const prefix of BLOCKED_HOSTNAME_PREFIXES) {
      if (host.startsWith(prefix)) {
        return { ok: false, reason: `IP privada/blocked: ${host}` };
      }
    }
  } else if (isIPv6(host)) {
    const lower = host.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
      return { ok: false, reason: `IPv6 privada/blocked: ${host}` };
    }
  }

  // Subdominios sospechosos de metadata cloud.
  if (host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false, reason: `Host sospechoso (internal/local): ${host}` };
  }

  return { ok: true };
}

function isIPv4(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

function isIPv6(s: string): boolean {
  return s.includes(":");
}
