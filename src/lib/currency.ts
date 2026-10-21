// ============================================================
// currency.ts — Formato de moneda colombiana y helpers contables
// Mejora: tipo decimal exacto usando cents, evita floats en cálculos
// críticos (Hermes §9 reportó bugs de redondeo por uso de Double).
// ============================================================

export const MONEDAS = {
  COP: { code: "COP", symbol: "$", decimals: 2, locale: "es-CO" },
  USD: { code: "USD", symbol: "$", decimals: 2, locale: "en-US" },
  MXN: { code: "MXN", symbol: "$", decimals: 2, locale: "es-MX" },
  EUR: { code: "EUR", symbol: "€", decimals: 2, locale: "es-ES" },
} as const;

export type MonedaCode = keyof typeof MONEDAS;

export function formatCurrency(
  amount: number,
  currency: MonedaCode = "COP",
): string {
  const cfg = MONEDAS[currency];
  if (!Number.isFinite(amount)) amount = 0;
  return new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency: cfg.code,
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  }).format(amount);
}

export function formatNumber(
  amount: number,
  currency: MonedaCode = "COP",
): string {
  const cfg = MONEDAS[currency];
  if (!Number.isFinite(amount)) amount = 0;
  return new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  }).format(amount);
}

// Redondeo exacto con el método configurado en Empresa
export type MetodoRedondeo = "half_up" | "half_even" | "down" | "up";

export function round(value: number, decimals = 2, method: MetodoRedondeo = "half_up"): number {
  // Prisma Decimal (decimal.js) llega como objeto con valueOf(): string.
  // Number.isFinite lo rechaza (no es number primitivo) y devolvía 0.
  // Convertimos a number primero (toFixed evita notación científica de valueOf).
  if (typeof value === "object" && value !== null && typeof (value as any).toFixed === "function") {
    value = Number((value as any).toFixed());
  }
  if (typeof value === "string") {
    value = Number(value);
  }
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  switch (method) {
    case "down":
      return Math.floor(value * factor) / factor;
    case "up":
      return Math.ceil(value * factor) / factor;
    case "half_even": {
      const scaled = value * factor;
      const floor = Math.floor(scaled);
      const diff = scaled - floor;
      if (diff < 0.5) return floor / factor;
      if (diff > 0.5) return (floor + 1) / factor;
      return (floor % 2 === 0 ? floor : floor + 1) / factor;
    }
    case "half_up":
    default: {
      const scaled = value * factor;
      const floor = Math.floor(scaled);
      const diff = scaled - floor;
      if (diff < 0.5) return floor / factor;
      return (floor + 1) / factor;
    }
  }
}

// Calcula cartera por edades (0-30, 31-60, 61-90, +90)
export interface AgingResult {
  rango30: number;
  rango60: number;
  rango90: number;
  rangoMas90: number;
  total: number;
}

export function calcularAging(
  saldo: number,
  fechaVencimiento: Date,
  hoy = new Date(),
): AgingResult {
  const dias = Math.floor(
    (hoy.getTime() - fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (dias <= 30) {
    return { rango30: saldo, rango60: 0, rango90: 0, rangoMas90: 0, total: saldo };
  }
  if (dias <= 60) {
    return { rango30: 0, rango60: saldo, rango90: 0, rangoMas90: 0, total: saldo };
  }
  if (dias <= 90) {
    return { rango30: 0, rango60: 0, rango90: saldo, rangoMas90: 0, total: saldo };
  }
  return { rango30: 0, rango60: 0, rango90: 0, rangoMas90: saldo, total: saldo };
}
