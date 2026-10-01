// ============================================================
// credito.ts — Sistemas de amortización (French / Alemana / Americana)
// Hermes §5.10 — Créditos y financiación.
//
// Todos los algoritmos reciben la tasa como % efectivo anual (EA)
// en formato decimal (0.18 = 18% EA) y devuelven un arreglo de
// cuotas con capital, interés, totalCuota y saldo capital restante
// después de cada pago.
//
// - French: cuota fija (PMT). El más usado en Colombia.
// - Alemana: capital fijo + interés variable sobre saldo.
// - Americana: solo interés cada mes, capital al final.
//
// Exporta además el tipo `CuotaAmortizacion` y un stub
// `generarTablaAmortizacionPDF` (lo implementa el agente de PDFs).
// ============================================================

import { round } from "@/lib/currency";

export type SistemaAmortizacion = "french" | "alemana" | "americana";

export interface CuotaAmortizacion {
  numero: number;
  fechaVencimiento: Date;
  capital: number;
  interes: number;
  totalCuota: number;
  saldoCapital: number; // saldo *después* de pagar esta cuota
}

// ---------- Helpers de fechas ----------

/** Suma `n` meses a una fecha sin mutar la original (maneja overflow de día). */
export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha.getTime());
  const diaOriginal = d.getDate();
  d.setMonth(d.getMonth() + meses);
  // Si el día se desbordó (ej. 31 -> mes siguiente con 30 días),
  // regresamos al último día válido del mes objetivo.
  if (d.getDate() < diaOriginal) {
    d.setDate(0); // último día del mes anterior al actual (= mes objetivo correcto)
  }
  return d;
}

/**
 * Convierte una tasa efectiva anual (EA) a efectiva mensual equivalente.
 * Fórmula: `(1 + tasaEA)^(1/12) - 1`.
 */
export function tasaEaToMensual(tasaEA: number): number {
  if (!Number.isFinite(tasaEA) || tasaEA < 0) return 0;
  return Math.pow(1 + tasaEA, 1 / 12) - 1;
}

// ============================================================
// Sistema Francés — cuota fija
// ============================================================
export function calcularAmortizacionFrench(
  monto: number,
  tasaEA: number,
  plazoMeses: number,
  fechaInicio: Date,
): CuotaAmortizacion[] {
  const n = Math.max(1, Math.floor(plazoMeses));
  const principal = Number.isFinite(monto) && monto > 0 ? monto : 0;
  const i = tasaEaToMensual(tasaEA);

  // PMT = P · [ i · (1+i)^n ] / [ (1+i)^n - 1 ]
  let pmt: number;
  if (i === 0) {
    pmt = principal / n;
  } else {
    const pow = Math.pow(1 + i, n);
    pmt = (principal * (i * pow)) / (pow - 1);
  }

  const cuotas: CuotaAmortizacion[] = [];
  let saldo = principal;

  for (let k = 1; k <= n; k++) {
    const interes = round(saldo * i, 2);
    let capital = round(pmt - interes, 2);
    // Última cuota: ajusta el capital para que el saldo final sea 0.
    if (k === n) {
      capital = round(saldo, 2);
    }
    saldo = round(saldo - capital, 2);
    cuotas.push({
      numero: k,
      fechaVencimiento: sumarMeses(fechaInicio, k),
      capital,
      interes,
      totalCuota: round(capital + interes, 2),
      saldoCapital: Math.max(0, saldo),
    });
  }
  return cuotas;
}

// ============================================================
// Sistema Alemán — capital fijo + interés sobre saldo
// ============================================================
export function calcularAmortizacionAlemana(
  monto: number,
  tasaEA: number,
  plazoMeses: number,
  fechaInicio: Date,
): CuotaAmortizacion[] {
  const n = Math.max(1, Math.floor(plazoMeses));
  const principal = Number.isFinite(monto) && monto > 0 ? monto : 0;
  const i = tasaEaToMensual(tasaEA);
  const capitalFijo = round(principal / n, 2);

  const cuotas: CuotaAmortizacion[] = [];
  let saldo = principal;

  for (let k = 1; k <= n; k++) {
    const interes = round(saldo * i, 2);
    let capital = capitalFijo;
    if (k === n) {
      capital = round(saldo, 2); // absorbe residuos de redondeo
    }
    saldo = round(saldo - capital, 2);
    cuotas.push({
      numero: k,
      fechaVencimiento: sumarMeses(fechaInicio, k),
      capital,
      interes,
      totalCuota: round(capital + interes, 2),
      saldoCapital: Math.max(0, saldo),
    });
  }
  return cuotas;
}

// ============================================================
// Sistema Americano — solo interés, capital al final
// ============================================================
export function calcularAmortizacionAmericana(
  monto: number,
  tasaEA: number,
  plazoMeses: number,
  fechaInicio: Date,
): CuotaAmortizacion[] {
  const n = Math.max(1, Math.floor(plazoMeses));
  const principal = Number.isFinite(monto) && monto > 0 ? monto : 0;
  const i = tasaEaToMensual(tasaEA);

  const cuotas: CuotaAmortizacion[] = [];
  let saldo = principal;

  for (let k = 1; k <= n; k++) {
    const interes = round(saldo * i, 2);
    const capital = k === n ? round(saldo, 2) : 0;
    saldo = round(saldo - capital, 2);
    cuotas.push({
      numero: k,
      fechaVencimiento: sumarMeses(fechaInicio, k),
      capital,
      interes,
      totalCuota: round(capital + interes, 2),
      saldoCapital: Math.max(0, saldo),
    });
  }
  return cuotas;
}

// ============================================================
// Dispatcher por sistema
// ============================================================
export function calcularAmortizacion(
  sistema: SistemaAmortizacion,
  monto: number,
  tasaEA: number,
  plazoMeses: number,
  fechaInicio: Date,
): CuotaAmortizacion[] {
  switch (sistema) {
    case "alemana":
      return calcularAmortizacionAlemana(monto, tasaEA, plazoMeses, fechaInicio);
    case "americana":
      return calcularAmortizacionAmericana(monto, tasaEA, plazoMeses, fechaInicio);
    case "french":
    default:
      return calcularAmortizacionFrench(monto, tasaEA, plazoMeses, fechaInicio);
  }
}

// ============================================================
// Stub de PDF — el agente de reportes lo implementa
// ============================================================
export interface GenerarTablaAmortizacionPDFArgs {
  sistema: SistemaAmortizacion;
  monto: number;
  tasaEA: number;
  plazoMeses: number;
  fechaInicio: Date;
  terceroNombre?: string;
  empresaNombre?: string;
}

// Función vacía — será sobreescrita por el agente de PDFs.
// Mantener el tipo exportado para que otros módulos lo importen.
export async function generarTablaAmortizacionPDF(
  _args: GenerarTablaAmortizacionPDFArgs,
): Promise<Buffer> {
  throw new Error(
    "generarTablaAmortizacionPDF aún no está implementado — delegado al agente de PDFs.",
  );
}
