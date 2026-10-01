// ============================================================
// nomina.ts — Módulo de Nómina y Nómina Electrónica DIAN (CUNE)
// Cálculos de devengos, deducciones, aportes patronales,
// provisiones, retención en la fuente, generación de XML UBL
// específico para Nómina Electrónica y cálculo del CUNE.
// Valores 2026: SMMLV = $1.423.500, Aux. transporte = $200.000,
// UVT = $51.379 (redondeado a $51.000 en cálculos prácticos).
// ============================================================
import { createHash } from "crypto";
import { round } from "@/lib/currency";

// ---------- Constantes oficiales Colombia 2026 ----------
export const SMMLV_2026 = 1_423_500;
export const AUX_TRANSPORTE_2026 = 200_000;
export const UVT_2026 = 51_379; // valor oficial DIAN 2026
export const UVT_2026_ROUND = 51_000; // simplificado para cálculos

// ---------- Tipos ----------
export type TipoRiesgoARL = 1 | 2 | 3 | 4 | 5;
export type BaseCalculo = "salario" | "ibc" | "total_devengado";
export type TipoConcepto =
  | "devengo"
  | "deduccion"
  | "aporte_patronal"
  | "provision";

export interface ConceptoLinea {
  codigo: string;
  nombre: string;
  valor: number;
}

export interface EmpleadoNominaInput {
  terceroId: string;
  nombre: string;
  numeroDocumento: string;
  tipoDocumento: string; // CC=13, NIT=31, CE=22, TI=12
  cargo?: string | null;
  salario: number;
  fechaIngreso?: Date | string | null;
  epsId?: string | null; // nombre de la EPS
  afpId?: string | null; // nombre del fondo de pensiones
  arl?: string | null; // nombre de la ARL
  diasLaborados: number;
  // Recargos y horas extras (opcional)
  horasExtrasDiurnas?: number;
  horasExtrasNocturnas?: number;
  recargosNocturnos?: number;
  recargosDominicales?: number;
  // Retención en la fuente
  dependientes?: number;
  // Datos para nómina electrónica
  direccion?: string | null;
  ciudad?: string | null;
  email?: string | null;
  telefono?: string | null;
}

export interface EmpresaNominaInput {
  nit: string;
  razonSocial: string;
  nombreComercial?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  email?: string | null;
  representanteLegal?: string | null;
  actividadEconomica?: string | null;
  ambiente: "pruebas" | "produccion";
}

export interface NominaPayload {
  numero: string; // NOM-2026-0001
  tipo: string; // quincenal | mensual | vacaciones | liquidacion_final
  periodoInicio: Date | string;
  periodoFin: Date | string;
  fechaPago: Date | string;
  // Totales globales
  totalDevengos: number;
  totalDeducciones: number;
  totalAportesPatronales: number;
  totalProvisiones: number;
  netoAPagar: number;
}

export interface ResultadoEmpleadoNomina {
  empleado: EmpleadoNominaInput;
  salarioBasico: number;
  diasLaborados: number;
  ibc: number;
  devengos: ConceptoLinea[];
  deducciones: ConceptoLinea[];
  aportesPatronales: ConceptoLinea[];
  provisiones: ConceptoLinea[];
  totalDevengado: number;
  totalDeducciones: number;
  totalAportesPatronales: number;
  totalProvisiones: number;
  netoAPagar: number;
  cuneEmpleado?: string;
  xmlEmpleado?: string;
}

// ---------- ARL: porcentaje según nivel de riesgo ----------
// Tabla oficial Decreto 1607 de 2013 (5 clases de riesgo)
const ARL_PORCENTAJES: Record<TipoRiesgoARL, number> = {
  1: 0.522,
  2: 1.044,
  3: 2.436,
  4: 4.35,
  5: 6.96,
};

export function arlNivelFromString(arl?: string | null): TipoRiesgoARL {
  if (!arl) return 1;
  const m = String(arl).match(/([1-5])/);
  if (m) return Number(m[1]) as TipoRiesgoARL;
  // Si es nombre textual de riesgo (bajo, medio, alto...)
  const s = String(arl).toLowerCase();
  if (s.includes("minimo") || s.includes("bajo") || s.includes("nivel i"))
    return 1;
  if (s.includes("ligero") || s.includes("nivel ii")) return 2;
  if (s.includes("medio") || s.includes("nivel iii")) return 3;
  if (s.includes("alto") || s.includes("nivel iv")) return 4;
  if (s.includes("maximo") || s.includes("muy alto") || s.includes("nivel v"))
    return 5;
  return 1;
}

// ============================================================
// 1. Salario por días (regla de 30 días)
// ============================================================
export function calcularSalarioPorDias(
  salarioMensual: number,
  diasLaborados: number,
  diasMes = 30,
): number {
  if (!Number.isFinite(salarioMensual) || salarioMensual < 0) return 0;
  if (!Number.isFinite(diasLaborados) || diasLaborados <= 0) return 0;
  return round((salarioMensual / diasMes) * diasLaborados, 2);
}

// ============================================================
// 2. Auxilio de transporte (sólo si salario <= 2 SMMLV)
// ============================================================
export function calcularAuxilioTransporte(
  salario: number,
  smmlv: number = SMMLV_2026,
  auxTransporte: number = AUX_TRANSPORTE_2026,
  diasLaborados: number,
  diasMes = 30,
): number {
  if (!Number.isFinite(salario) || salario <= 0) return 0;
  if (salario > 2 * smmlv) return 0;
  if (diasLaborados <= 0) return 0;
  return round((auxTransporte / diasMes) * diasLaborados, 2);
}

// ============================================================
// 3. Horas extras y recargos
//    - Extra diurna: +25% sobre valor hora ordinaria
//    - Extra nocturna: +75% sobre valor hora ordinaria
//    - Recargo nocturno: +35% sobre valor hora ordinaria
//    - Recargo dominical: +75% sobre valor hora ordinaria
// ============================================================
export function valorHoraOrdinaria(
  salarioMensual: number,
  diasMes = 30,
  horasDia = 8,
): number {
  const horasMes = diasMes * horasDia;
  if (horasMes <= 0) return 0;
  return round(salarioMensual / horasMes, 2);
}

export function calcularHorasExtras(
  cantidad: number,
  valorHora: number,
  recargo: number, // porcentaje adicional (25, 75, 35)
): number {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 0;
  return round(cantidad * valorHora * (1 + recargo / 100), 2);
}

// ============================================================
// 4. IBC (Ingreso Base de Cotización)
//    IBC = devengado constitutivo de salario (excluye auxilio transporte)
// ============================================================
export function calcularIBC(devengadoConstitutivo: number): number {
  if (!Number.isFinite(devengadoConstitutivo) || devengadoConstitutivo < 0)
    return 0;
  // Tope máximo: 25 SMMLV (Ley 1607 de 2013)
  const tope = 25 * SMMLV_2026;
  return round(Math.min(devengadoConstitutivo, tope), 2);
}

// ============================================================
// 5. Deducción EPS del trabajador: 4% del IBC
// ============================================================
export function calcularDeduccionEPS(
  epsId: string | null | undefined,
  ibc: number,
): number {
  if (!epsId) return 0; // sin EPS registrada, no se deduce
  if (!Number.isFinite(ibc) || ibc <= 0) return 0;
  return round(ibc * 0.04, 2);
}

// ============================================================
// 6. Deducción Pensión del trabajador: 4% del IBC
// ============================================================
export function calcularDeduccionPension(
  afpId: string | null | undefined,
  ibc: number,
): number {
  if (!afpId) return 0;
  if (!Number.isFinite(ibc) || ibc <= 0) return 0;
  return round(ibc * 0.04, 2);
}

// ============================================================
// 7. Aportes patronales
//    - ARL: 0.522% a 6.96% según nivel de riesgo (sobre IBC)
//    - ICBF: 3% sobre IBC hasta 10 SMMLV
//    - Caja de compensación: 4% sobre IBC
//    - SENA: 2% sobre IBC (exonerado si < 10 SMMLV en some regímenes)
//    - Pensión patronal: 12% sobre 10 SMMLV (piso)
//    (Simplificado: aplicamos SENA e ICBF sobre el IBC completo)
// ============================================================
export interface AportesPatronalesResult {
  arl: number;
  icbf: number;
  caja: number;
  sena: number;
  pensionPatronal: number;
  total: number;
}

export function calcularAportesPatronales(
  ibc: number,
  arlRiesgo: TipoRiesgoARL = 1,
): AportesPatronalesResult {
  const base = Number.isFinite(ibc) && ibc > 0 ? ibc : 0;
  const tope10SMMLV = 10 * SMMLV_2026;
  // ARL sobre el IBC
  const arlTasa = ARL_PORCENTAJES[arlRiesgo] ?? ARL_PORCENTAJES[1];
  const arl = round(base * (arlTasa / 100), 2);
  // ICBF 3% sobre IBC hasta 10 SMMLV
  const baseIcbf = Math.min(base, tope10SMMLV);
  const icbf = round(baseIcbf * 0.03, 2);
  // Caja 4% sobre IBC
  const caja = round(base * 0.04, 2);
  // SENA 2% sobre IBC (simplificación: aplicamos siempre)
  const sena = round(base * 0.02, 2);
  // Pensión patronal 12% sobre el IBC hasta 10 SMMLV (piso ARL)
  const pensionPatronal = round(Math.min(base, tope10SMMLV) * 0.12, 2);
  const total = round(arl + icbf + caja + sena + pensionPatronal, 2);
  return { arl, icbf, caja, sena, pensionPatronal, total };
}

// ============================================================
// 8. Provisiones (prestaciones sociales)
//    - Cesantías: 8.33% sobre devengado constitutivo
//    - Intereses de cesantías: 1% anual sobre cesantías (12%)
//    - Prima: 8.33% sobre devengado constitutivo
//    - Vacaciones: 4.17% sobre el salario (no incluye extras)
// ============================================================
export interface ProvisionesResult {
  cesantias: number;
  interesesCesantias: number;
  prima: number;
  vacaciones: number;
  total: number;
}

export function calcularProvisiones(
  devengadoConstitutivo: number,
  diasLaborados: number,
  diasMes = 30,
): ProvisionesResult {
  const base = Number.isFinite(devengadoConstitutivo)
    ? devengadoConstitutivo
    : 0;
  // Base proporcional al período (ej: si eran 30 días, base completa; si 15, mitad)
  const factor = diasMes > 0 ? diasLaborados / diasMes : 0;
  // Cesantías: 8.33% (1 año de salario por año trabajado = 8.33% mensual acumulado)
  const cesantias = round(base * 0.0833 * factor, 2);
  // Intereses cesantías: 1% (12% anual sobre las cesantías provisionadas)
  const interesesCesantias = round(base * 0.01 * factor, 2);
  // Prima: 8.33% (un salario por año = 8.33% mensual)
  const prima = round(base * 0.0833 * factor, 2);
  // Vacaciones: 4.17% (medio salario por año = 4.17% mensual)
  // Las vacaciones se calculan sobre el salario base, sin extras ni auxilios.
  // Aquí simplificamos usando la misma base.
  const vacaciones = round(base * 0.0417 * factor, 2);
  const total = round(cesantias + interesesCesantias + prima + vacaciones, 2);
  return { cesantias, interesesCesantias, prima, vacaciones, total };
}

// ============================================================
// 9. Retención en la fuente por salarios (DIAN 2026)
//    Aplica la tabla de retención con descuento por dependientes
//    (10% de descuento de la base imponible por cada dependiente,
//     hasta máximo 10 dependientes — Estatuto Tributario art. 383).
// ============================================================
export interface RetencionFuenteTabla {
  desde: number;
  hasta: number;
  porcentaje: number;
  baseUVT: number;
}

export function calcularRetencionSalarios(
  devengadoMenosDeduccionesSalud: number,
  dependientes: number,
  tabla: RetencionFuenteTabla[],
): number {
  if (!Number.isFinite(devengadoMenosDeduccionesSalud) || devengadoMenosDeduccionesSalud <= 0)
    return 0;
  // Deducción por dependientes: 10% por cada uno, máximo 10 (100%)
  const pctDep = Math.min(dependientes, 10) * 0.1;
  const base = devengadoMenosDeduccionesSalud * (1 - pctDep);
  // Buscar rango en la tabla
  const fila = tabla.find((r) => base >= r.desde && base <= r.hasta);
  if (!fila) return 0;
  // Base de retención = base imponible - desde (UVT del tramo)
  const baseRetencion = Math.max(0, base - fila.desde);
  return round(baseRetencion * (fila.porcentaje / 100), 2);
}

// ============================================================
// 10. Cálculo completo de un empleado
//     Genera la liquidación de devengos, deducciones,
//     aportes patronales y provisiones en una sola pasada.
// ============================================================
export function liquidarEmpleado(
  empleado: EmpleadoNominaInput,
  tablaRetencion: RetencionFuenteTabla[] = [],
): ResultadoEmpleadoNomina {
  const salarioPorDias = calcularSalarioPorDias(
    empleado.salario,
    empleado.diasLaborados,
  );
  const auxTransporte = calcularAuxilioTransporte(
    empleado.salario,
    SMMLV_2026,
    AUX_TRANSPORTE_2026,
    empleado.diasLaborados,
  );

  // Horas extras y recargos
  const vHora = valorHoraOrdinaria(empleado.salario);
  const heDiurnas = empleado.horasExtrasDiurnas
    ? calcularHorasExtras(empleado.horasExtrasDiurnas, vHora, 25)
    : 0;
  const heNocturnas = empleado.horasExtrasNocturnas
    ? calcularHorasExtras(empleado.horasExtrasNocturnas, vHora, 75)
    : 0;
  const recNocturno = empleado.recargosNocturnos
    ? calcularHorasExtras(empleado.recargosNocturnos, vHora, 35)
    : 0;
  const recDominical = empleado.recargosDominicales
    ? calcularHorasExtras(empleado.recargosDominicales, vHora, 75)
    : 0;

  // Devengos
  const devengos: ConceptoLinea[] = [
    { codigo: "SALARIO_BASICO", nombre: "Salario básico", valor: salarioPorDias },
  ];
  if (auxTransporte > 0)
    devengos.push({
      codigo: "AUX_TRANSPORTE",
      nombre: "Auxilio de transporte",
      valor: auxTransporte,
    });
  if (heDiurnas > 0)
    devengos.push({
      codigo: "HORA_EXTRA_DIURNA",
      nombre: "Horas extras diurnas (25%)",
      valor: heDiurnas,
    });
  if (heNocturnas > 0)
    devengos.push({
      codigo: "HORA_EXTRA_NOCTURNA",
      nombre: "Horas extras nocturnas (75%)",
      valor: heNocturnas,
    });
  if (recNocturno > 0)
    devengos.push({
      codigo: "RECARGO_NOCTURNO",
      nombre: "Recargo nocturno (35%)",
      valor: recNocturno,
    });
  if (recDominical > 0)
    devengos.push({
      codigo: "RECARGO_DOMINICAL",
      nombre: "Recargo dominical (75%)",
      valor: recDominical,
    });

  // IBC = devengado constitutivo de salario (sin auxilio de transporte)
  const devengadoConstitutivo = round(
    salarioPorDias + heDiurnas + heNocturnas + recNocturno + recDominical,
    2,
  );
  const ibc = calcularIBC(devengadoConstitutivo);

  // Deducciones
  const deduccionEPS = calcularDeduccionEPS(empleado.epsId, ibc);
  const deduccionPension = calcularDeduccionPension(empleado.afpId, ibc);

  // Devengado total (incluye auxilio transporte)
  const totalDevengado = round(
    devengos.reduce((a, d) => a + d.valor, 0),
    2,
  );

  // Retención en la fuente: base = total devengado - EPS - Pensión
  const baseRetencion = round(totalDevengado - deduccionEPS - deduccionPension, 2);
  const retencion = calcularRetencionSalarios(
    baseRetencion,
    empleado.dependientes ?? 0,
    tablaRetencion,
  );

  const deducciones: ConceptoLinea[] = [];
  if (deduccionEPS > 0)
    deducciones.push({
      codigo: "EPS_TRABAJADOR",
      nombre: `EPS (${empleado.epsId ?? "EPS"}) 4%`,
      valor: deduccionEPS,
    });
  if (deduccionPension > 0)
    deducciones.push({
      codigo: "PENSION_TRABAJADOR",
      nombre: `Pensión (${empleado.afpId ?? "AFP"}) 4%`,
      valor: deduccionPension,
    });
  if (retencion > 0)
    deducciones.push({
      codigo: "RETENCION_FUENTE",
      nombre: "Retención en la fuente salarios",
      valor: retencion,
    });

  const totalDeducciones = round(
    deducciones.reduce((a, d) => a + d.valor, 0),
    2,
  );

  // Aportes patronales
  const arlRiesgo = arlNivelFromString(empleado.arl);
  const aportes = calcularAportesPatronales(ibc, arlRiesgo);
  const aportesPatronales: ConceptoLinea[] = [
    { codigo: "ARL_PATRONAL", nombre: `ARL riesgo ${arlRiesgo}`, valor: aportes.arl },
    { codigo: "ICBF_PATRONAL", nombre: "ICBF patronal 3%", valor: aportes.icbf },
    { codigo: "CAJA_COMPENSACION", nombre: "Caja de compensación 4%", valor: aportes.caja },
    { codigo: "SENA_PATRONAL", nombre: "SENA patronal 2%", valor: aportes.sena },
    { codigo: "PENSION_PATRONAL", nombre: "Pensión patronal 12%", valor: aportes.pensionPatronal },
  ];
  const totalAportesPatronales = round(aportes.total, 2);

  // Provisiones
  const prov = calcularProvisiones(devengadoConstitutivo, empleado.diasLaborados);
  const provisiones: ConceptoLinea[] = [
    { codigo: "CESANTIAS", nombre: "Cesantías 8.33%", valor: prov.cesantias },
    { codigo: "INTERESES_CESANTIAS", nombre: "Intereses cesantías 1%", valor: prov.interesesCesantias },
    { codigo: "PRIMA", nombre: "Prima de servicios 8.33%", valor: prov.prima },
    { codigo: "VACACIONES", nombre: "Vacaciones 4.17%", valor: prov.vacaciones },
  ];
  const totalProvisiones = round(prov.total, 2);

  const netoAPagar = round(totalDevengado - totalDeducciones, 2);

  return {
    empleado,
    salarioBasico: salarioPorDias,
    diasLaborados: empleado.diasLaborados,
    ibc,
    devengos,
    deducciones,
    aportesPatronales,
    provisiones,
    totalDevengado,
    totalDeducciones,
    totalAportesPatronales,
    totalProvisiones,
    netoAPagar,
  };
}

// ============================================================
// 11. Cálculo del CUNE (Código Único de Nómina Electrónica)
//     Algoritmo oficial DIAN (Resolución 56 de 2018, anexo técnico):
//     CUNE = SHA-384(numNom + fecGen + horGen + valTotal + codDoc +
//                    nitEmpleador + tipNotDev + nitReceptor + ambiente + 'N')
// ============================================================
export interface CUNEInput {
  numNom: string; // número de nómina (NOM-2026-0001)
  fecGen: string; // YYYY-MM-DD
  horGen: string; // HH:MM:SS
  valTotal: number; // neto a pagar
  codDoc: string; // código de documento (Nómina = "102" | "103" ajuste)
  nitEmpleador: string; // NIT del empleador
  tipNotDev: string; // tipo de nota devolutiva ("1" | "0")
  nitReceptor: string; // NIT/CC del empleado
  ambiente: "pruebas" | "produccion";
}

export function calcularCUNE(input: CUNEInput): string {
  const partes = [
    input.numNom,
    input.fecGen,
    input.horGen,
    String(round(input.valTotal, 2)),
    input.codDoc,
    input.nitEmpleador,
    input.tipNotDev,
    input.nitReceptor,
    input.ambiente === "produccion" ? "1" : "0",
    "N", // sufijo fijo de Nómina electrónica
  ];
  return createHash("sha384")
    .update(partes.join(""), "utf8")
    .digest("hex");
}

// ============================================================
// 12. Generación XML UBL 2.1 para Nómina Electrónica DIAN
//     Estructura Documento de Pago / Nómina Electrónica.
//     Namespaces:
//       xmlns        = urn:oasis:names:specification:ubl:schema:xsd:NominaDocument-2
//       xmlns:cac    = CommonAggregateComponents-2
//       xmlns:cbc    = CommonBasicComponents-2
//       xmlns:nomina = urn:oasis:names:specification:ubl:schema:xsd:Nomina-2
// ============================================================
function escXML(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const fmtN = (n: number) =>
  round(Number.isFinite(n) ? n : 0, 2)
    .toFixed(2)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");

export interface NominaXMLInput {
  empresa: EmpresaNominaInput;
  empleado: EmpleadoNominaInput;
  resultado: ResultadoEmpleadoNomina;
  nomina: NominaPayload;
  cune: string;
  fechaGen: string; // YYYY-MM-DD
  horaGen: string; // HH:MM:SS
}

export function generarXMLNomina(input: NominaXMLInput): string {
  const {
    empresa,
    empleado,
    resultado,
    nomina,
    cune,
    fechaGen,
    horaGen,
  } = input;

  // Mapear tipo de documento del empleado a código DIAN
  const mapTipoDoc: Record<string, string> = {
    CC: "13",
    NIT: "31",
    CE: "22",
    TI: "12",
    PT: "41",
  };
  const codTipoEmp = mapTipoDoc[empleado.tipoDocumento] ?? "13";

  // Devengos como líneas XML
  const devengosXML = resultado.devengos
    .map(
      (d) => `      <nomina:Devengado>
        <nomina:CodigoConcepto>${escXML(d.codigo)}</nomina:CodigoConcepto>
        <nomina:NombreConcepto>${escXML(d.nombre)}</nomina:NombreConcepto>
        <cbc:Amount currencyID="COP">${fmtN(d.valor)}</cbc:Amount>
      </nomina:Devengado>`,
    )
    .join("\n");

  const deduccionesXML = resultado.deducciones
    .map(
      (d) => `      <nomina:Deduccion>
        <nomina:CodigoConcepto>${escXML(d.codigo)}</nomina:CodigoConcepto>
        <nomina:NombreConcepto>${escXML(d.nombre)}</nomina:NombreConcepto>
        <cbc:Amount currencyID="COP">${fmtN(d.valor)}</cbc:Amount>
      </nomina:Deduccion>`,
    )
    .join("\n");

  // Tipo de nómina: código DIAN (1=prestacional, 2=liquidación definitivo)
  const tipoNom = nomina.tipo === "liquidacion_final" ? "2" : "1";

  return `<?xml version="1.0" encoding="UTF-8"?>
<NominaDocument
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:NominaDocument-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:nomina="urn:oasis:names:specification:ubl:schema:xsd:Nomina-2">
  <cbc:CustomizationID>17</cbc:CustomizationID>
  <cbc:ProfileID>2</cbc:ProfileID>
  <cbc:ID>${escXML(nomina.numero)}</cbc:ID>
  <cbc:UUID schemeID="CUNE">${escXML(cune)}</cbc:UUID>
  <cbc:IssueDate>${escXML(fechaGen)}</cbc:IssueDate>
  <cbc:IssueTime>${escXML(horaGen)}</cbc:IssueTime>
  <nomina:TipoNomina>${tipoNom}</nomina:TipoNomina>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:Period>
    <cbc:StartDate>${escXML(new Date(nomina.periodoInicio).toISOString().slice(0, 10))}</cbc:StartDate>
    <cbc:EndDate>${escXML(new Date(nomina.periodoFin).toISOString().slice(0, 10))}</cbc:EndDate>
  </cac:Period>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="4">${escXML(empresa.nit)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escXML(empresa.nombreComercial ?? empresa.razonSocial)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:ID>${escXML(empresa.direccion ?? "N/A")}</cbc:ID>
        <cbc:CityName>${escXML(empresa.ciudad ?? "Bogotá")}</cbc:CityName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escXML(empresa.razonSocial)}</cbc:RegistrationName>
        <cbc:CompanyID>${escXML(empresa.nit)}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escXML(codTipoEmp)}">${escXML(empleado.numeroDocumento)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escXML(empleado.nombre)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:ID>${escXML(empleado.direccion ?? "N/A")}</cbc:ID>
        <cbc:CityName>${escXML(empleado.ciudad ?? "Bogotá")}</cbc:CityName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escXML(empleado.nombre)}</cbc:RegistrationName>
        <cbc:CompanyID>${escXML(empleado.numeroDocumento)}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMilestone>
    <cbc:PaymentID>${escXML(nomina.numero)}</cbc:PaymentID>
    <cbc:PaymentDate>${escXML(new Date(nomina.fechaPago).toISOString().slice(0, 10))}</cbc:PaymentDate>
    <cac:PaymentAmount>
      <cbc:Amount currencyID="COP">${fmtN(resultado.netoAPagar)}</cbc:Amount>
    </cac:PaymentAmount>
    <nomina:DevengadosTotal currencyID="COP">${fmtN(resultado.totalDevengado)}</nomina:DevengadosTotal>
    <nomina:DeduccionesTotal currencyID="COP">${fmtN(resultado.totalDeducciones)}</nomina:DeduccionesTotal>
    <nomina:ComprobanteTotal currencyID="COP">${fmtN(resultado.netoAPagar)}</nomina:ComprobanteTotal>
${devengosXML}
${deduccionesXML}
  </cac:PaymentMilestone>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${fmtN(resultado.totalDevengado)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${fmtN(resultado.totalDevengado - resultado.totalDeducciones)}</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${fmtN(resultado.netoAPagar)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</NominaDocument>`;
}

// ============================================================
// 13. Helper: generar número consecutivo de nómina
// ============================================================
export function generarNumeroNomina(consecutivo: number, year = new Date().getFullYear()): string {
  return `NOM-${year}-${String(consecutivo).padStart(6, "0")}`;
}

// ============================================================
// 14. Helper: mapear tipoDocumento Tercero -> código DIAN
// ============================================================
export function mapTipoDocumentoDIAN(tipoDoc: string): string {
  const map: Record<string, string> = {
    CC: "13",
    NIT: "31",
    CE: "22",
    TI: "12",
    PT: "41",
  };
  return map[tipoDoc] ?? "13";
}
