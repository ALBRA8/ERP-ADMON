// ============================================================
// niif.ts — Generadores de Estados Financieros NIIF (IFRS)
// para el ERP Marsella.
//
// Funciones principales (server-side, requieren `db`):
//   - generarESF(empresaId, fechaFin)
//        → Estado de Situación Financiera (Balance General NIIF)
//   - generarEER(empresaId, fechaInicio, fechaFin)
//        → Estado de Resultado Integral
//   - generarECP(empresaId, fechaInicio, fechaFin)
//        → Estado de Cambios en el Patrimonio
//   - generarEFE(empresaId, fechaInicio, fechaFin)
//        → Estado de Flujos de Efectivo (método indirecto)
//   - generarNotasNIIF(empresaId, fechaFin)
//        → Notas a los estados financieros (resumen)
//
// Bajo IFRS (NIC 1), los estados financieros se preparan bajo
// el principio de devengo (no caja) y se presentan con la
// clasificación corriente/no corriente. Esta librería los
// genera a partir de los movimientos contables (PUC) de la
// empresa, usando el mapeo `PUC_TO_NIIF` en `niif-mapping.ts`.
// ============================================================

import { db } from "@/lib/db";
import { round } from "@/lib/currency";
import {
  agruparSaldosPorCategoria,
  mapCuentaPUCtoNIIF,
  sumarSaldos,
  type NIIFCategory,
  type SaldoLine,
  type SaldosPorCategoria,
} from "@/lib/niif-mapping";

const TASA_IMPUESTO_RENTA = 0.33; // 33% en Colombia (sujeto a cambios)

// ============================================================
// Helpers internos
// ============================================================

interface FechaInput {
  fechaInicio?: string | Date;
  fechaFin: string | Date;
}

function toDate(value: string | Date): Date {
  if (typeof value === "string") {
    // Si es fecha sin hora (YYYY-MM-DD), tomar el final del día para fechaFin
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
    return new Date(value);
  }
  return value;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Carga movimientos contables contabilizados hasta fechaFin
async function cargarMovimientos(
  empresaId: string,
  fechaInicio: Date | null,
  fechaFin: Date,
) {
  const where: any = {
    empresaId,
    comprobante: { estado: "contabilizado" },
    fecha: { lte: endOfDay(fechaFin) },
  };
  if (fechaInicio) {
    where.fecha.gte = startOfDay(fechaInicio);
  }
  return db.movimientoContable.findMany({
    where,
    include: {
      cuenta: {
        select: {
          codigo: true,
          nombre: true,
          naturaleza: true,
          nivel: true,
          esMovimiento: true,
        },
      },
    },
    orderBy: { fecha: "asc" },
  });
}

// ============================================================
// TIPOS DE SALIDA
// ============================================================

export type ESFLine = SaldoLine;
export interface ESFSection {
  total: number;
  lineas: SaldoLine[];
}
export interface ESFResult {
  fechaFin: string;
  empresaId: string;
  activo: {
    corriente: ESFSection;
    no_corriente: ESFSection;
    inventarios: ESFSection;
    clientes: ESFSection;
    efectivo: ESFSection;
    total: number;
  };
  pasivo: {
    corriente: ESFSection;
    no_corriente: ESFSection;
    total: number;
  };
  patrimonio: ESFSection & { utilidadPeriodo: number };
  totalActivo: number;
  totalPasivoPatrimonio: number;
  diferencia: number;
}

export type EERLine = SaldoLine;
export interface EERResult {
  fechaInicio: string;
  fechaFin: string;
  empresaId: string;
  ingresos: SaldoLine[];
  costosVenta: SaldoLine[];
  gastosAdmin: SaldoLine[];
  costosProduccion: SaldoLine[];
  otrosIngresos: SaldoLine[];
  otrosGastos: SaldoLine[];
  totalIngresos: number;
  totalCostosVenta: number;
  totalGastosAdmin: number;
  totalCostosProduccion: number;
  totalOtrosIngresos: number;
  totalOtrosGastos: number;
  utilidadBruta: number;
  utilidadOperativa: number;
  utilidadAntesImpuestos: number;
  impuestoRenta: number;
  utilidadNeta: number;
}

export interface ECPMovimiento {
  concepto: string;
  categoria: string;
  monto: number;
}
export interface ECPResult {
  fechaInicio: string;
  fechaFin: string;
  empresaId: string;
  saldoInicialPatrimonio: number;
  aumentos: ECPMovimiento[];
  reducciones: ECPMovimiento[];
  utilidadNetaPeriodo: number;
  dividendos: number;
  saldoFinalPatrimonio: number;
}

export interface EFELinea {
  concepto: string;
  monto: number;
}
export interface EFEResult {
  fechaInicio: string;
  fechaFin: string;
  empresaId: string;
  utilidadNeta: number;
  ajustesNoCaja: EFELinea[];
  flujosOperacion: EFELinea[];
  flujosInversion: EFELinea[];
  flujosFinanciacion: EFELinea[];
  totalOperacion: number;
  totalInversion: number;
  totalFinanciacion: number;
  aumentoNetoEfectivo: number;
  saldoInicial: number;
  saldoFinal: number;
}

export interface NotasNIIFResult {
  fechaFin: string;
  empresaId: string;
  basePreparacion: string;
  monedaFuncional: string;
  politicasContables: { titulo: string; descripcion: string }[];
  riesgos: { tipo: string; descripcion: string }[];
  eventosPosteriores: string;
  firmaContador: string;
}

// ============================================================
// 1. ESTADO DE SITUACIÓN FINANCIERA (ESF) — Balance General NIIF
// ============================================================

export async function generarESF(
  empresaId: string,
  fechaFin: string | Date,
): Promise<ESFResult> {
  const fechaFinDate = endOfDay(toDate(fechaFin));
  const movs = await cargarMovimientos(empresaId, null, fechaFinDate);
  const saldos = agruparSaldosPorCategoria(movs);

  // Construir secciones
  const seccion = (cat: NIIFCategory): ESFSection => ({
    lineas: saldos[cat] ?? [],
    total: sumarSaldos(saldos[cat]),
  });

  const activo_corriente = seccion("activo_corriente");
  const activo_no_corriente = seccion("activo_no_corriente");
  const inventarios = seccion("inventarios");
  const clientes = seccion("clientes");
  const efectivo = seccion("efectivo");

  const totalActivo = round(
    activo_corriente.total +
      activo_no_corriente.total +
      inventarios.total +
      clientes.total +
      efectivo.total,
    2,
  );

  const pasivo_corriente = seccion("pasivo_corriente");
  const pasivo_no_corriente = seccion("pasivo_no_corriente");
  const totalPasivo = round(
    pasivo_corriente.total + pasivo_no_corriente.total,
    2,
  );

  // Patrimonio = saldo cuentas clase 3 + utilidad neta del período
  // (la utilidad neta se incorpora al patrimonio del ESF)
  const patrimonioSeccion = seccion("patrimonio");

  // Calcular utilidad del período (desde inicio de año hasta fechaFin)
  const inicioAnio = new Date(fechaFinDate.getFullYear(), 0, 1);
  const movsAnio = await cargarMovimientos(empresaId, inicioAnio, fechaFinDate);
  const saldosAnio = agruparSaldosPorCategoria(movsAnio);
  const ingresos = sumarSaldos(saldosAnio["ingresos"]) + sumarSaldos(saldosAnio["otros_ingresos"]);
  const costosVenta = sumarSaldos(saldosAnio["costos_venta"]);
  const costosProduccion = sumarSaldos(saldosAnio["costos_produccion"]);
  const gastosAdmin = sumarSaldos(saldosAnio["gastos_admin"]);
  const otrosGastos = sumarSaldos(saldosAnio["otros_gastos"]);
  const utilidadAntesImpuestos = round(
    ingresos - costosVenta - costosProduccion - gastosAdmin - otrosGastos,
    2,
  );
  const impuestoRenta = round(Math.max(0, utilidadAntesImpuestos) * TASA_IMPUESTO_RENTA, 2);
  const utilidadPeriodo = round(utilidadAntesImpuestos - impuestoRenta, 2);

  // Patrimonio total = saldo cuentas clase 3 (incluye capital + utilidades acumuladas
  // registradas como cuentas patrimonio, exluyendo resultado del período si ya está
  // contabilizado como cuenta 3605/36xx). Aquí incluimos utilidadPeriodo aparte para
  // que cuadre con la ecuación Activo = Pasivo + Patrimonio.
  const patrimonioTotal = round(patrimonioSeccion.total + utilidadPeriodo, 2);

  const totalPasivoPatrimonio = round(totalPasivo + patrimonioTotal, 2);
  const diferencia = round(totalActivo - totalPasivoPatrimonio, 2);

  return {
    fechaFin: fechaFinDate.toISOString(),
    empresaId,
    activo: {
      corriente: activo_corriente,
      no_corriente: activo_no_corriente,
      inventarios,
      clientes,
      efectivo,
      total: totalActivo,
    },
    pasivo: {
      corriente: pasivo_corriente,
      no_corriente: pasivo_no_corriente,
      total: totalPasivo,
    },
    patrimonio: {
      ...patrimonioSeccion,
      utilidadPeriodo,
    },
    totalActivo,
    totalPasivoPatrimonio,
    diferencia,
  };
}

// ============================================================
// 2. ESTADO DE RESULTADO INTEGRAL (EER)
// ============================================================

export async function generarEER(
  empresaId: string,
  fechaInicio: string | Date,
  fechaFin: string | Date,
): Promise<EERResult> {
  const inicio = startOfDay(toDate(fechaInicio));
  const fin = endOfDay(toDate(fechaFin));
  const movs = await cargarMovimientos(empresaId, inicio, fin);
  const saldos = agruparSaldosPorCategoria(movs);

  const ingresos = saldos["ingresos"] ?? [];
  const costosVenta = saldos["costos_venta"] ?? [];
  const gastosAdmin = saldos["gastos_admin"] ?? [];
  const costosProduccion = saldos["costos_produccion"] ?? [];
  const otrosIngresos = saldos["otros_ingresos"] ?? [];
  const otrosGastos = saldos["otros_gastos"] ?? [];

  const totalIngresos = sumarSaldos(ingresos);
  const totalCostosVenta = sumarSaldos(costosVenta);
  const totalGastosAdmin = sumarSaldos(gastosAdmin);
  const totalCostosProduccion = sumarSaldos(costosProduccion);
  const totalOtrosIngresos = sumarSaldos(otrosIngresos);
  const totalOtrosGastos = sumarSaldos(otrosGastos);

  const utilidadBruta = round(totalIngresos - totalCostosVenta, 2);
  const utilidadOperativa = round(
    utilidadBruta - totalGastosAdmin - totalCostosProduccion,
    2,
  );
  const utilidadAntesImpuestos = round(
    utilidadOperativa + totalOtrosIngresos - totalOtrosGastos,
    2,
  );
  const impuestoRenta = round(
    Math.max(0, utilidadAntesImpuestos) * TASA_IMPUESTO_RENTA,
    2,
  );
  const utilidadNeta = round(utilidadAntesImpuestos - impuestoRenta, 2);

  return {
    fechaInicio: inicio.toISOString(),
    fechaFin: fin.toISOString(),
    empresaId,
    ingresos,
    costosVenta,
    gastosAdmin,
    costosProduccion,
    otrosIngresos,
    otrosGastos,
    totalIngresos,
    totalCostosVenta,
    totalGastosAdmin,
    totalCostosProduccion,
    totalOtrosIngresos,
    totalOtrosGastos,
    utilidadBruta,
    utilidadOperativa,
    utilidadAntesImpuestos,
    impuestoRenta,
    utilidadNeta,
  };
}

// ============================================================
// 3. ESTADO DE CAMBIOS EN EL PATRIMONIO (ECP)
// ============================================================

export async function generarECP(
  empresaId: string,
  fechaInicio: string | Date,
  fechaFin: string | Date,
): Promise<ECPResult> {
  const inicio = startOfDay(toDate(fechaInicio));
  const fin = endOfDay(toDate(fechaFin));

  // Saldo inicial de patrimonio: saldos hasta un día antes de fechaInicio
  const diaAntes = new Date(inicio.getTime() - 86400000);
  const movsIniciales = await cargarMovimientos(empresaId, null, endOfDay(diaAntes));
  const saldosIniciales = agruparSaldosPorCategoria(movsIniciales);
  const saldoInicialPatrimonio = sumarSaldos(saldosIniciales["patrimonio"]);

  // Movimientos del período en cuentas de patrimonio (clase 3)
  const movsPeriodo = await cargarMovimientos(empresaId, inicio, fin);
  const movsPatrimonio = movsPeriodo.filter(
    (m) => mapCuentaPUCtoNIIF(m.cuenta?.codigo ?? "") === "patrimonio",
  );

  const aumentos: ECPMovimiento[] = [];
  const reducciones: ECPMovimiento[] = [];

  // Agrupar por cuenta de patrimonio
  const porCuentaPat: Record<string, { codigo: string; nombre: string; neto: number }> = {};
  for (const m of movsPatrimonio) {
    const codigo = m.cuenta?.codigo ?? "?";
    const nombre = m.cuenta?.nombre ?? "—";
    if (!porCuentaPat[codigo]) porCuentaPat[codigo] = { codigo, nombre, neto: 0 };
    // Patrimonio naturaleza crédito: aumentos = crédito
    const naturaleza = m.cuenta?.naturaleza ?? "credito";
    if (naturaleza === "credito") {
      porCuentaPat[codigo].neto += Number(m.credito ?? 0) - Number(m.debito ?? 0);
    } else {
      porCuentaPat[codigo].neto += Number(m.debito ?? 0) - Number(m.credito ?? 0);
    }
  }
  for (const c of Object.values(porCuentaPat)) {
    const monto = round(c.neto, 2);
    if (monto > 0) {
      aumentos.push({ concepto: `${c.codigo} - ${c.nombre}`, categoria: "Capital/Aportes", monto });
    } else if (monto < 0) {
      reducciones.push({ concepto: `${c.codigo} - ${c.nombre}`, categoria: "Retiros/Reducciones", monto: Math.abs(monto) });
    }
  }

  // Utilidad neta del período (incrementa patrimonio)
  const eer = await generarEER(empresaId, inicio, fin);
  const utilidadNetaPeriodo = eer.utilidadNeta;

  // Dividendos: buscar movimientos en cuentas de patrimonio tipo 3605 (dividendos)
  // o cualquier movimiento débito en cuentas 36xx que represente distribución
  let dividendos = 0;
  for (const m of movsPatrimonio) {
    const codigo = m.cuenta?.codigo ?? "";
    // 3605 = Dividendos decretados (PUC)
    if (codigo.startsWith("3605") || codigo.startsWith("3606") || codigo.startsWith("3615")) {
      dividendos += Number(m.debito ?? 0) - Number(m.credito ?? 0);
    }
  }
  dividendos = round(Math.abs(dividendos), 2);

  const saldoFinalPatrimonio = round(
    saldoInicialPatrimonio + utilidadNetaPeriodo - dividendos,
    2,
  );

  return {
    fechaInicio: inicio.toISOString(),
    fechaFin: fin.toISOString(),
    empresaId,
    saldoInicialPatrimonio,
    aumentos,
    reducciones,
    utilidadNetaPeriodo,
    dividendos,
    saldoFinalPatrimonio,
  };
}

// ============================================================
// 4. ESTADO DE FLUJOS DE EFECTIVO (EFE) — método indirecto
// ============================================================

export async function generarEFE(
  empresaId: string,
  fechaInicio: string | Date,
  fechaFin: string | Date,
): Promise<EFEResult> {
  const inicio = startOfDay(toDate(fechaInicio));
  const fin = endOfDay(toDate(fechaFin));

  // Utilidad neta del período
  const eer = await generarEER(empresaId, inicio, fin);
  const utilidadNeta = eer.utilidadNeta;

  // Saldos finales vs iniciales para deltas
  const movsPeriodo = await cargarMovimientos(empresaId, inicio, fin);
  const saldosPeriodo = agruparSaldosPorCategoria(movsPeriodo);

  // Saldo inicial de efectivo (cuentas 1105/1110/1115)
  const diaAntes = new Date(inicio.getTime() - 86400000);
  const movsIniciales = await cargarMovimientos(empresaId, null, endOfDay(diaAntes));
  const saldosIniciales = agruparSaldosPorCategoria(movsIniciales);
  const saldoInicial = sumarSaldos(saldosIniciales["efectivo"]);

  // Saldo final de efectivo
  const movsFinales = await cargarMovimientos(empresaId, null, fin);
  const saldosFinales = agruparSaldosPorCategoria(movsFinales);
  const saldoFinal = sumarSaldos(saldosFinales["efectivo"]);

  // Ajustes no-caja (partidas del EER que no son efectivo):
  // Aquí usamos aproximación: cualquier gasto/costo que NO haya afectado efectivo
  // se considera "no-caja". Para simplificar, mostramos:
  // - Depreciación/amortización: cuentas 1610/1615/1620 (P, P y E - depreciaciones)
  //   y 1690 (Flotantes), 1810/1820 (Diferidos amortizables), 5150/5160
  //   (cuotas de amortización)
  // En la práctica, depuramos por categoría NIIF.
  const ajustesNoCaja: EFELinea[] = [];

  // Depreciaciones del período (cuentas clase 16 acumulada — crédito)
  // En PUC: 1619XX Depreciación acumulada es cuenta de crédito
  // Si hay movimientos de "activo_no_corriente" en el período con saldo neto negativo,
  // es probable que sea por depreciación.
  const deltaActivoNoCorriente =
    sumarSaldos(saldosPeriodo["activo_no_corriente"]);
  if (Math.abs(deltaActivoNoCorriente) > 0.01) {
    ajustesNoCaja.push({
      concepto: "Variación neta propiedades, planta y equipos / activos intangibles",
      monto: deltaActivoNoCorriente,
    });
  }

  // Variación de capital de trabajo operativo:
  const deltaClientes =
    sumarSaldos(saldosPeriodo["clientes"]);
  const deltaInventarios =
    sumarSaldos(saldosPeriodo["inventarios"]);
  const deltaPasivoCorriente =
    sumarSaldos(saldosPeriodo["pasivo_corriente"]);

  const flujosOperacion: EFELinea[] = [];
  flujosOperacion.push({ concepto: "Utilidad neta del período", monto: utilidadNeta });
  for (const a of ajustesNoCaja) {
    flujosOperacion.push({ concepto: a.concepto, monto: a.monto });
  }
  // Variaciones de capital de trabajo (signo invertido según método indirecto)
  if (Math.abs(deltaClientes) > 0.01) {
    flujosOperacion.push({
      concepto: "(Disminución) aumento de clientes / cuentas por cobrar",
      monto: -deltaClientes,
    });
  }
  if (Math.abs(deltaInventarios) > 0.01) {
    flujosOperacion.push({
      concepto: "(Aumento) disminución de inventarios",
      monto: -deltaInventarios,
    });
  }
  if (Math.abs(deltaPasivoCorriente) > 0.01) {
    flujosOperacion.push({
      concepto: "Aumento (disminución) de pasivos corrientes",
      monto: deltaPasivoCorriente,
    });
  }

  const totalOperacion = round(
    flujosOperacion.reduce((a, b) => a + b.monto, 0),
    2,
  );

  // Flujos de inversión: movimientos en cuentas de activo no corriente que
  // sí afectan efectivo (compras/ventas de P y E, intangibles, inversiones LP)
  // Para simplificar: invertimos el signo del delta de activo_no_corriente (excluyendo
  // la depreciación que ya está en ajustes no-caja).
  const flujosInversion: EFELinea[] = [];
  // Compras de propiedades planta y equipo (débitos en cuentas 16xx con PUC 16xx en propiedad planta)
  const movsInv = movsPeriodo.filter(
    (m) =>
      (m.cuenta?.codigo ?? "").startsWith("16") ||
      (m.cuenta?.codigo ?? "").startsWith("17") ||
      (m.cuenta?.codigo ?? "").startsWith("18"),
  );
  let inversiones = 0;
  for (const m of movsInv) {
    const naturaleza = m.cuenta?.naturaleza ?? "debito";
    if (naturaleza === "debito") {
      inversiones += Number(m.debito ?? 0) - Number(m.credito ?? 0);
    } else {
      inversiones += Number(m.credito ?? 0) - Number(m.debito ?? 0);
    }
  }
  if (Math.abs(inversiones) > 0.01) {
    flujosInversion.push({
      concepto: "Compra de propiedades, planta, equipos e intangibles",
      monto: -Math.abs(inversiones),
    });
  }
  const totalInversion = round(
    flujosInversion.reduce((a, b) => a + b.monto, 0),
    2,
  );

  // Flujos de financiación: préstamos recibidos (cuentas 21xx, 25xx) y capital recibido
  const flujosFinanciacion: EFELinea[] = [];
  // Movimientos de obligaciones financieras (21) y obligaciones laborales (25/26)
  const movsFin = movsPeriodo.filter(
    (m) =>
      (m.cuenta?.codigo ?? "").startsWith("21") ||
      (m.cuenta?.codigo ?? "").startsWith("25") ||
      (m.cuenta?.codigo ?? "").startsWith("26") ||
      (m.cuenta?.codigo ?? "").startsWith("3"),
  );
  // Simplificación: solo movimientos en cuentas 21xx (obligaciones financieras)
  let prestamos = 0;
  for (const m of movsFin) {
    const codigo = m.cuenta?.codigo ?? "";
    if (codigo.startsWith("21")) {
      const naturaleza = m.cuenta?.naturaleza ?? "credito";
      if (naturaleza === "credito") {
        prestamos += Number(m.credito ?? 0) - Number(m.debito ?? 0);
      } else {
        prestamos += Number(m.debito ?? 0) - Number(m.credito ?? 0);
      }
    }
  }
  if (Math.abs(prestamos) > 0.01) {
    flujosFinanciacion.push({
      concepto: "Préstamos obtenidos (neto)",
      monto: prestamos,
    });
  }
  // Aportes de capital (cuenta 3105 - capital social)
  let aportes = 0;
  for (const m of movsFin) {
    const codigo = m.cuenta?.codigo ?? "";
    if (codigo.startsWith("31") || codigo.startsWith("32")) {
      const naturaleza = m.cuenta?.naturaleza ?? "credito";
      if (naturaleza === "credito") {
        aportes += Number(m.credito ?? 0) - Number(m.debito ?? 0);
      }
    }
  }
  if (Math.abs(aportes) > 0.01) {
    flujosFinanciacion.push({ concepto: "Aportes de capital", monto: aportes });
  }
  // Dividendos pagados
  let dividendos = 0;
  for (const m of movsFin) {
    const codigo = m.cuenta?.codigo ?? "";
    if (codigo.startsWith("36")) {
      dividendos += Number(m.debito ?? 0) - Number(m.credito ?? 0);
    }
  }
  if (Math.abs(dividendos) > 0.01) {
    flujosFinanciacion.push({
      concepto: "Dividendos pagados",
      monto: -Math.abs(dividendos),
    });
  }
  const totalFinanciacion = round(
    flujosFinanciacion.reduce((a, b) => a + b.monto, 0),
    2,
  );

  const aumentoNetoEfectivo = round(
    totalOperacion + totalInversion + totalFinanciacion,
    2,
  );

  return {
    fechaInicio: inicio.toISOString(),
    fechaFin: fin.toISOString(),
    empresaId,
    utilidadNeta,
    ajustesNoCaja,
    flujosOperacion,
    flujosInversion,
    flujosFinanciacion,
    totalOperacion,
    totalInversion,
    totalFinanciacion,
    aumentoNetoEfectivo,
    saldoInicial,
    saldoFinal,
  };
}

// ============================================================
// 5. NOTAS A LOS ESTADOS FINANCIEROS
// ============================================================

export async function generarNotasNIIF(
  empresaId: string,
  fechaFin: string | Date,
): Promise<NotasNIIFResult> {
  const fin = endOfDay(toDate(fechaFin));
  const empresa = await db.empresa.findUnique({
    where: { id: empresaId },
    select: {
      razonSocial: true,
      nit: true,
      moneda: true,
      regimenTributario: true,
    },
  });

  return {
    fechaFin: fin.toISOString(),
    empresaId,
    basePreparacion:
      "Los estados financieros consolidados se preparan de acuerdo con las Normas Internacionales de Información Financiera (NIIF/IFRS) emitidas por el IASB. Se presentan en pesos colombianos (COP), redondeados al peso más cercano. La base de medición utilizada es el costo histórico, salvo para aquellos activos/pass que se miden a valor razonable conforme a las NIIF correspondientes.",
    monedaFuncional: empresa?.moneda ?? "COP",
    politicasContables: [
      {
        titulo: "1. Reconocimiento de ingresos",
        descripcion:
          "Los ingresos por venta de bienes se reconocen cuando se transfieren los riesgos y beneficios al cliente, conforme a la NIC 18 / NIIF 15. Los ingresos por servicios se reconocen según el grado de avance de la transacción.",
      },
      {
        titulo: "2. Propiedades, planta y equipo",
        descripcion:
          "Los activos fijos se registran al costo de adquisición menos depreciación acumulada. La depreciación se calcula por el método de línea recta sobre la vida útil estimada de cada activo, conforme a la NIC 16.",
      },
      {
        titulo: "3. Inventarios",
        descripcion:
          "Los inventarios se valoran al costo (PEPS) o al valor neto de realización, el menor, conforme a la NIC 2. Los costos incluyen compra, transformación y otros costos necesarios para poner los inventarios en su ubicación y condición actuales.",
      },
      {
        titulo: "4. Cuentas por cobrar",
        descripcion:
          "Las cuentas por cobrar se registran al valor nominal. Se reconoce una provisión para cartera de difícil cobro basada en análisis de antigüedad y experiencia histórica.",
      },
      {
        titulo: "5. Pasivos laborales",
        descripcion:
          "Los pasivos por prestaciones sociales (cesantías, intereses, primas, vacaciones) se causan conforme a la legislación colombiana y la NIC 19, considerando la probabilidad de pago y el valor presente cuando aplique.",
      },
      {
        titulo: "6. Impuesto de renta",
        descripcion:
          "El impuesto de renta se calcula a la tarifa vigente del 33% sobre la utilidad antes de impuestos, ajustada por diferencias temporales y permanentes conforme a la NIC 12.",
      },
    ],
    riesgos: [
      {
        tipo: "Riesgo de mercado",
        descripcion:
          "La empresa está expuesta a fluctuaciones en el valor de la inversión en inventarios y a variaciones en las tasas de interés sobre obligaciones financieras.",
      },
      {
        tipo: "Riesgo de crédito",
        descripcion:
          "Las cuentas por cobrar están concentradas en un portafolio de clientes. Se mantiene provisión para cartera de difícil cobro.",
      },
      {
        tipo: "Riesgo de liquidez",
        descripcion:
          "La empresa mantiene líneas de crédito disponibles y un nivel adecuado de efectivo para cubrir obligaciones de corto plazo.",
      },
      {
        tipo: "Riesgo operativo",
        descripcion:
          "Asociado a la dependencia de personal clave, procesos internos y sistemas de información.",
      },
    ],
    eventosPosteriores:
      "No se han identificado eventos posteriores significativos que requieran ajuste o revelación en los estados financieros entre la fecha de corte y la fecha de emisión del informe.",
    firmaContador:
      "Revisado y firmado por el contador público adscrito, conforme al Decreto 0266 de 2013 (Colombia) y normas internacionales de información financiera aplicables.",
  };
}
