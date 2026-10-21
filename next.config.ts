import type { NextConfig } from "next";

// ============================================================
// FIX-SEGURIDAD H-ALT-001 + H-ALT-002: Headers de seguridad HTTP
// - CSP: restringe orígenes de scripts/styles/connections.
// - X-Frame-Options: DENY (anti-clickjacking).
// - X-Content-Type-Options: nosniff (anti-MIME sniff).
// - Referrer-Policy: strict-origin-when-cross-origin.
// - Strict-Transport-Security: HSTS 1 año + subdomains.
// - Permissions-Policy: deshabilita cámara/micrófono/geo.
// ============================================================

// CSP: 'unsafe-inline' para styles (necesario por Tailwind + shadcn/ui
// inyectados en runtime por Next.js). 'unsafe-eval' para dev mode.
// connect-src incluye 'self' y ws: para HMR de dev.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), camera=(), microphone=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  // A-CRIT-008: NO ignorar errores de TypeScript en el build.
  // Si hay errores, el build debe fallar (red de seguridad).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
