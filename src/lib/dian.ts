// ============================================================
// dian.ts — Facturación Electrónica DIAN Colombia
// Estructura UBL 2.1 lista, cálculo CUFE (mock inicial — el real
// requiere certificado digital y proveedor tecnológico autorizado).
// Mejora del informe Hermes §5.3 + §10.2.
// ============================================================
import { sha256 } from "@/lib/crypto";

// ---------- Cálculo de CUFE (mock, algoritmo oficial) ----------
// CUFE = SHA384(NumFac + FecFac + HorFac + ValTotal + CodDoc + NitFac +
//                TipAdq + NitPAC + ClTec + Soporte + 'M' o 'D' (ambiente))
// Implementación completa en producción requiere certificado real.
export interface CUFEInput {
  numFac: string; // número completo FEL-12345
  fecFac: string; // YYYY-MM-DD
  horFac: string; // HH:MM:SS
  valTotal: number;
  codDoc: string; // 01=Factura venta electrónica, 03=Nota crédito, 02=Nota débito
  nitFac: string; // NIT del facturador
  tipAdq: string; // 1=Contribuyente, 2=No responsable
  nitPac?: string; // NIT del proveedor tecnológico (vacío en mock)
  clTec?: string; // clave técnica de control (asignada por DIAN)
  soporte?: string; // URL PDF/DIAN
  ambiente: "pruebas" | "produccion";
}

export function calcularCUFE(input: CUFEInput): string {
  const partes = [
    input.numFac,
    input.fecFac,
    input.horFac,
    String(input.valTotal),
    input.codDoc,
    input.nitFac,
    input.tipAdq,
    input.nitPac ?? "",
    input.clTec ?? "",
    input.soporte ?? "",
    input.ambiente === "produccion" ? "1" : "0",
  ];
  return sha256(partes.join(""));
}

// ---------- QR DIAN ----------
// URL de representación del documento electrónico en la DIAN.
export function generarUrlRepresentacionQR(params: {
  cufe: string;
  nit: string;
  ambiente: "pruebas" | "produccion";
}): string {
  // En producción real, sería algo como:
  // https://catalogo-vpfefvph.dian.localgovworld.com:443/document/view?cufe=XXX&type=RAD&nita=NIT
  const base =
    params.ambiente === "produccion"
      ? "https://catalogo-vpfefvph.dian.localgovworld.com/document/view"
      : "https://catalogo-vpfefvph.dian.localgovworld.com/document/view";
  return `${base}?cufe=${encodeURIComponent(
    params.cufe,
  )}&type=RAD&nita=${encodeURIComponent(params.nit)}&ambiente=${params.ambiente}`;
}

// ---------- Generar XML UBL 2.1 (esqueleto) ----------
// Nota: en producción, este XML debe ser firmado con XAdES-EPES
// usando un certificado digital X.509 emitido por una CA acreditada
// por ONAC. Aquí generamos el XML sin firma para que la estructura
// quede lista cuando se integre con un proveedor tecnológico real.
export interface UBLFactura {
  // Encabezado
  numero: string;
  cufe: string;
  fecha: string;
  hora: string;
  moneda: string;
  // Emisor (la empresa)
  emisor: {
    nit: string;
    razonSocial: string;
    nombreComercial?: string;
    direccion?: string;
    ciudad?: string;
    telefono?: string;
    regimen?: string;
    actividadEconomica?: string;
    responsableIVA?: boolean;
  };
  // Receptor (cliente)
  receptor: {
    tipoDocumento: string; // CC=13, NIT=31, CE=22, TI=12
    numeroDocumento: string;
    nombre: string;
    direccion?: string;
    ciudad?: string;
    telefono?: string;
    email?: string;
    regimen?: string;
  };
  // Items
  items: UBLItem[];
  // Totales
  subtotalBruto: number;
  descuentoTotal: number;
  subtotalNeto: number;
  totalIva: number;
  totalImpoconsumo: number;
  totalReteFuente: number;
  totalReteICA: number;
  totalReteIva: number;
  total: number;
  // Pago
  formaPago: "1" | "2"; // 1=contado, 2=credito
  medioPago?: string;
  fechaVencimiento?: string;
}

export interface UBLItem {
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad: string; // UND, KG, LT
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  tarifaIva: number;
  iva: number;
  total: number;
}

export function generarXMLUBL(factura: UBLFactura): string {
  const fmt = (n: number) =>
    n.toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

  const itemsXML = factura.items
    .map(
      (it, i) => `
    <cbc:Description>${escXML(it.descripcion)}</cbc:Description>
    <cbc:ID>${escXML(it.codigo)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escXML(it.unidad)}">${fmt(it.cantidad)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${escXML(factura.moneda)}">${fmt(it.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxAmount currencyID="${escXML(factura.moneda)}">${fmt(it.iva)}</cbc:TaxAmount>
    <cbc:Percent>${fmt(it.tarifaIva)}</cbc:Percent>
    <cbc:BaseUnitMeasure>${fmt(it.cantidad)}</cbc:BaseUnitMeasure>
    <cbc:PriceAmount currencyID="${escXML(factura.moneda)}">${fmt(it.precioUnitario)}</cbc:PriceAmount>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>2</cbc:ProfileID>
  <cbc:ID>${escXML(factura.numero)}</cbc:ID>
  <cbc:UUID>${escXML(factura.cufe)}</cbc:UUID>
  <cbc:IssueDate>${escXML(factura.fecha)}</cbc:IssueDate>
  <cbc:IssueTime>${escXML(factura.hora)}</cbc:IssueTime>
  <cbc:DocumentCurrencyCode>${escXML(factura.moneda)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:IndustryID>${escXML(factura.emisor.actividadEconomica ?? "")}</cbc:IndustryID>
      <cac:PartyIdentification>
        <cbc:ID schemeID="4">${escXML(factura.emisor.nit)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escXML(factura.emisor.nombreComercial ?? factura.emisor.razonSocial)}</cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escXML(factura.receptor.tipoDocumento)}">${escXML(factura.receptor.numeroDocumento)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escXML(factura.receptor.nombre)}</cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:InvoiceLine>${itemsXML}</cac:InvoiceLine>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escXML(factura.moneda)}">${fmt(factura.subtotalNeto)}</cbc:LineExtensionAmount>
    <cbc:AllowanceTotalAmount currencyID="${escXML(factura.moneda)}">${fmt(factura.descuentoTotal)}</cbc:AllowanceTotalAmount>
    <cbc:TaxExclusiveAmount currencyID="${escXML(factura.moneda)}">${fmt(factura.subtotalNeto)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${escXML(factura.moneda)}">${fmt(factura.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${escXML(factura.moneda)}">${fmt(factura.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}

function escXML(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------- Helper: validar dígito verificación NIT Colombia ----------
export function calcularDigitoVerificacion(nit: string): string {
  // Algoritmo oficial DIAN: factores 71, 67, 59, 59, 53, 47, 43, 41, 37, 29
  const factores = [71, 67, 59, 59, 53, 47, 43, 41, 37, 29];
  let nitLimpio = nit.replace(/\D/g, "");
  if (nitLimpio.length === 0) return "";
  // rellenar a 10 dígitos
  while (nitLimpio.length < 10) nitLimpio = "0" + nitLimpio;
  const arr = nitLimpio.split("").slice(-10);
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(arr[i], 10) * factores[i];
  }
  const residuo = suma % 11;
  const dv = 11 - residuo;
  if (dv === 11) return "0";
  if (dv === 10) return "K";
  return String(dv);
}

// ---------- Helper: validar fecha de vigencia de resolución DIAN ----------
export function resolucionVigente(res: {
  fechaInicioVigencia: Date;
  fechaFinVigencia: Date;
  activa: boolean;
}): boolean {
  if (!res.activa) return false;
  const now = new Date();
  return now >= res.fechaInicioVigencia && now <= res.fechaFinVigencia;
}
