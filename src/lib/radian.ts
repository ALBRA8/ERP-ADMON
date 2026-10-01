// ============================================================
// radian.ts — DIAN Radian (Título Valor Electrónico) — Eventos
// de Recepción. Hermes §5.5.
//
// Radian permite gestionar facturas electrónicas como títulos
// valor. Sobre cada CUFE el comprador/acreedor registra eventos
// (030 acuse recibo, 031 recibo bien, 032 rechazo, 033
// transferencia, 034 pago, 035 cobro, 036 cancelación sin pago).
//
// Cada evento es un XML UBL 2.1 ApplicationResponse firmado con
// XAdES-EPES (mismo helper de dian-real.ts) y enviado al
// WebService de eventos Radian de la DIAN.
//
// IMPORTANTE: Sin credenciales DIAN reales (PAC + certificado),
// las funciones responden gracefully: el evento queda en estado
// `borrador` con mensajeError claro (mismo patrón que dian-real).
// ============================================================

import { createHash } from "crypto";
import { db } from "@/lib/db";
import {
  loadDIANConfigFromDB,
  type DIANConfig,
  type DIANResponse,
} from "@/lib/dian-real";

// ---------- Tipos ----------

export type TipoEventoRadian =
  | "030" // Acuse de recibo
  | "031" // Recibo del bien y/o servicio
  | "032" // Rechazo
  | "033" // Transferencia
  | "034" // Pago
  | "035" // Cobro
  | "036"; // Cancelación sin pago

export const TIPOS_EVENTO_RADIAN: {
  code: TipoEventoRadian;
  label: string;
  descripcion: string;
}[] = [
  { code: "030", label: "Acuse de recibo", descripcion: "El comprador confirma recepción de la factura electrónica." },
  { code: "031", label: "Recibo del bien y/o servicio", descripcion: "Aceptación explícita del bien/servicio recibido." },
  { code: "032", label: "Rechazo", descripcion: "El comprador no acepta la factura electrónica." },
  { code: "033", label: "Transferencia", descripcion: "Endoso de la factura a un tercero." },
  { code: "034", label: "Pago", descripcion: "Pago de la factura al proveedor." },
  { code: "035", label: "Cobro", descripcion: "Cobro de la factura endosada." },
  { code: "036", label: "Cancelación sin pago", descripcion: "Cancelación del título valor sin pago." },
];

export interface GenerarXMLEventoInput {
  numero: string; // RAD-2026-000001
  tipo: TipoEventoRadian;
  /** Fecha del evento (se usa solo fecha+hora, en ISO) */
  fecha: Date;
  /** NIT del emisor del evento (empresa compradora) */
  nitEmisor: string;
  /** Razón social del emisor del evento */
  razonSocialEmisor?: string;
  /** NIT del receptor del evento (proveedor que emitió la factura original) */
  nitReceptor: string;
  /** Razón social del receptor */
  razonSocialReceptor?: string;
  /** CUFE de la factura electrónica original */
  cufeFactura: string;
  /** Descripción opcional del evento */
  descripcion?: string;
  /** Observaciones adicionales */
  observaciones?: string;
}

export interface CalcularCUFEEventoInput {
  numEvento: string;
  fecGen: string; // yyyy-MM-dd
  horGen: string; // HH:mm:ss(-05:00)
  valTotal: string; // valor total del evento (0 para eventos)
  codDocEvento: string; // tipo 030|031|...
  nitEmisor: string;
  tipNotDoc: string; // tipo de nota = "E" (evento)
  nitReceptor: string;
  cufeFactura: string;
  ambiente: string; // pruebas | produccion
}

export interface EnviarEventoRadianResult {
  ok: boolean;
  trackId?: string;
  estado: string; // aceptado | rechazado | borrador | enviado
  respuestaDIAN?: string; // JSON serializado
  mensajeError?: string;
}

export interface ProcesarColaRadianResult {
  procesados: number;
  aceptados: number;
  rechazados: number;
  errores: number;
  detalles: Array<{
    eventoId: string;
    numero: string;
    estado: string;
    mensaje?: string;
  }>;
}

// ---------- Constantes DIAN Radian ----------

// Endpoint SOAP para eventos Radian (ApplicationResponse).
// En producción DIAN expone un servicio separado para eventos de
// recepción. Usamos el mismo dominio vpfe con path /Event/v1.0.
const RADIAN_ENDPOINTS = {
  produccion:
    "https://vpfe.dian.gov.co/Event/v1.0/ApplicationResponseService.svc",
  pruebas:
    "https://vpfe-hab.dian.gov.co/Event/v1.0/ApplicationResponseService.svc",
} as const;

// ---------- Helpers ----------

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** yyyy-MM-dd en zona horaria local America/Bogota (UTC-5). */
function fmtDate(d: Date): string {
  // Trabajamos con la fecha local; el navegador/Node ya la ajusta.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** HH:mm:ssZ-05:00 */
function fmtTime(d: Date): string {
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${hh}:${mm}:${ss}-05:00`;
}

function descripcionEvento(tipo: TipoEventoRadian): string {
  const t = TIPOS_EVENTO_RADIAN.find((x) => x.code === tipo);
  return t?.descripcion ?? "Evento Radian";
}

// ============================================================
// 1. generarEventoRadianXML
// ============================================================

/**
 * Genera el XML UBL 2.1 ApplicationResponse para un evento Radian.
 * Cumple con la estructura esperada por la DIAN:
 *   - cbc:ID = número interno del evento (RAD-2026-0001)
 *   - cbc:UUID = CUFE del evento (calculado previamente)
 *   - cbc:IssueDate / IssueTime
 *   - cbc:ResponseCode = código 030|031|...|036
 *   - cbc:Description = descripción del evento
 *   - cac:SenderParty = empresa que emite evento (comprador)
 *   - cac:ReceiverParty = proveedor que emitió la factura original
 *   - cac:DocumentResponse → DocumentID = CUFE factura original
 *
 * El XML NO incluye la firma XAdES-EPES; la firma se aplica
 * posteriormente con signXMLWithXAdES.
 */
export function generarEventoRadianXML(
  input: GenerarXMLEventoInput,
  cufeEvento: string,
): string {
  const fecha = input.fecha instanceof Date ? input.fecha : new Date(input.fecha);
  const issueDate = fmtDate(fecha);
  const issueTime = fmtTime(fecha);
  const desc =
    input.descripcion && input.descripcion.trim().length > 0
      ? input.descripcion
      : descripcionEvento(input.tipo);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>${escapeXml(input.numero)}</cbc:ID>
  <cbc:UUID>${escapeXml(cufeEvento)}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:ResponseCode>${escapeXml(input.tipo)}</cbc:ResponseCode>
  <cbc:Description>${escapeXml(desc)}</cbc:Description>
  <cac:SenderParty>
    <cac:PartyIdentification>
      <cbc:ID schemeID="4">${escapeXml(input.nitEmisor)}</cbc:ID>
    </cac:PartyIdentification>
    <cac:PartyName>
      <cbc:Name>${escapeXml(input.razonSocialEmisor ?? "EMISOR EVENTO")}</cbc:Name>
    </cac:PartyName>
  </cac:SenderParty>
  <cac:ReceiverParty>
    <cac:PartyIdentification>
      <cbc:ID schemeID="4">${escapeXml(input.nitReceptor)}</cbc:ID>
    </cac:PartyIdentification>
    <cac:PartyName>
      <cbc:Name>${escapeXml(input.razonSocialReceptor ?? "RECEPTOR EVENTO")}</cbc:Name>
    </cac:PartyName>
  </cac:ReceiverParty>
  <cac:DocumentResponse>
    <cbc:ResponseCode>OK</cbc:ResponseCode>
    <cbc:Description>Evento sobre factura electrónica</cbc:Description>
    <cac:DocumentReference>
      <cbc:ID>${escapeXml(input.cufeFactura)}</cbc:ID>
    </cac:DocumentReference>
  </cac:DocumentResponse>
</ApplicationResponse>`;
}

// ============================================================
// 2. calcularCUFEEvento
// ============================================================

/**
 * Calcula el CUFE de un evento Radian con SHA-384 sobre la
 * concatenación de los campos definidos por la DIAN (Res. 165):
 *   numEvento + fecGen + horGen + valTotal + codDocEvento +
 *   nitEmisor + tipNotDoc + nitReceptor + CUFE_Factura +
 *   ambiente + "E"
 *
 * El sufijo "E" indica que el documento es un Evento (no una
 * factura).
 *
 * El campo ambiente se codifica como "1" (produccion) o "0"
 * (pruebas).
 */
export function calcularCUFEEvento(input: CalcularCUFEEventoInput): string {
  const ambienteCode = input.ambiente === "produccion" ? "1" : "0";
  const partes = [
    input.numEvento,
    input.fecGen,
    input.horGen,
    input.valTotal,
    input.codDocEvento,
    input.nitEmisor,
    input.tipNotDoc,
    input.nitReceptor,
    input.cufeFactura,
    ambienteCode,
    "E", // marca de Evento Radian
  ];
  const texto = partes.join("");
  return createHash("sha384").update(texto, "utf8").digest("hex");
}

// ============================================================
// 3. enviarEventoRadianADian
// ============================================================

/**
 * Toma un EventoRadian persistido, firma el XML con XAdES-EPES
 * (sobre el nodo raíz ApplicationResponse) y lo envía al
 * WebService de eventos Radian de la DIAN vía SOAP.
 *
 * Persiste:
 *   - xmlEvento firmado en `EventoRadian.xmlEvento`
 *   - respuesta en `EventoRadian.respuestaDIAN`
 *   - trackId en `EventoRadian.trackId`
 *   - estado en `EventoRadian.estado` (aceptado | rechazado |
 *     borrador si falla por falta de config)
 *
 * Sin credenciales DIAN reales, responde gracefully: estado
 * `borrador` + mensajeError explicativo.
 */
export async function enviarEventoRadianADian(
  eventoId: string,
  empresaId: string,
): Promise<EnviarEventoRadianResult> {
  const evento = await db.eventoRadian.findFirst({
    where: { id: eventoId, empresaId },
  });
  if (!evento) {
    return {
      ok: false,
      estado: "borrador",
      mensajeError: "Evento no encontrado",
    };
  }

  // Cargar config DIAN de la empresa (con certificado)
  const loaded = await loadDIANConfigFromDB(empresaId);
  if (!loaded) {
    const msg =
      "No hay configuración DIAN activa con certificado cargado. Sube tu .p12 en Facturación DIAN.";
    await db.eventoRadian.update({
      where: { id: evento.id },
      data: {
        estado: "borrador",
        mensajeError: msg,
      },
    });
    return { ok: false, estado: "borrador", mensajeError: msg };
  }

  const { config } = loaded;

  if (!evento.xmlEvento) {
    return {
      ok: false,
      estado: "borrador",
      mensajeError: "El evento no tiene XML generado",
    };
  }

  try {
    // 1. Firmar XML con XAdES-EPES sobre el nodo ApplicationResponse
    //    Reutilizamos el helper de dian-real.ts que firma sobre <Invoice>;
    //    aquí el nodo raíz es <ApplicationResponse> pero SignedXml
    //    usa la referencia XPath "//*[local-name()='Invoice']" —
    //    hacemos una firma equivalente adaptada a ApplicationResponse.
    const cufe = (evento.respuestaDIAN ?? "").includes("cufeEvento")
      ? (JSON.parse(evento.respuestaDIAN).cufeEvento as string)
      : evento.trackId ?? evento.id; // fallback

    const xmlFirmado = signApplicationResponseWithXAdES(
      evento.xmlEvento,
      config,
      cufe,
    );

    // 2. Marcar como enviado y guardar XML firmado
    await db.eventoRadian.update({
      where: { id: evento.id },
      data: {
        estado: "enviado",
        xmlEvento: xmlFirmado,
        mensajeError: null,
      },
    });

    // 3. Enviar SOAP a DIAN
    const dianResp = await sendEventoRadianToDIAN(
      xmlFirmado,
      config,
      `rde_${evento.numero.replace(/[^0-9A-Za-z]/g, "_")}.xml`,
    );

    // 4. Procesar respuesta
    if (dianResp.isAccepted && dianResp.trackId) {
      await db.eventoRadian.update({
        where: { id: evento.id },
        data: {
          estado: "aceptado",
          trackId: dianResp.trackId,
          respuestaDIAN: JSON.stringify({
            statusCode: dianResp.status,
            statusMessage: dianResp.errorMessage,
            trackId: dianResp.trackId,
            cufeEvento: cufe,
            raw: dianResp.raw,
            enviadoEn: new Date().toISOString(),
          }),
          mensajeError: null,
        },
      });
      return {
        ok: true,
        trackId: dianResp.trackId,
        estado: "aceptado",
        respuestaDIAN: dianResp.raw,
      };
    }

    // Falló pero hay trackId -> sigue en proceso
    if (dianResp.trackId) {
      await db.eventoRadian.update({
        where: { id: evento.id },
        data: {
          estado: "enviado",
          trackId: dianResp.trackId,
          respuestaDIAN: JSON.stringify({
            statusCode: dianResp.status,
            statusMessage: dianResp.errorMessage,
            trackId: dianResp.trackId,
            raw: dianResp.raw,
            enviadoEn: new Date().toISOString(),
          }),
          mensajeError: dianResp.errorMessage ?? "En proceso",
        },
      });
      return {
        ok: false,
        trackId: dianResp.trackId,
        estado: "enviado",
        mensajeError: dianResp.errorMessage ?? "En proceso",
      };
    }

    // Sin trackId: distinguimos entre error de red/credenciales
    // (sin respuesta DIAN → borrador para reintentar) y respuesta
    // DIAN explícita de rechazo (con statusCode no válido →
    // rechazado definitivo).
    const tieneRespuestaDIAN =
      dianResp.raw && dianResp.raw.length > 0 && dianResp.status;
    const estadoFinal = tieneRespuestaDIAN ? "rechazado" : "borrador";

    await db.eventoRadian.update({
      where: { id: evento.id },
      data: {
        estado: estadoFinal,
        respuestaDIAN: dianResp.raw
          ? JSON.stringify({
              statusCode: dianResp.status,
              statusMessage: dianResp.errorMessage,
              raw: dianResp.raw,
              enviadoEn: new Date().toISOString(),
            })
          : evento.respuestaDIAN,
        mensajeError: dianResp.errorMessage ?? "Error DIAN sin detalle",
      },
    });
    return {
      ok: false,
      estado: estadoFinal,
      mensajeError: dianResp.errorMessage ?? "Error DIAN sin detalle",
    };
  } catch (e: any) {
    const mensaje = e?.message ?? String(e);
    await db.eventoRadian.update({
      where: { id: evento.id },
      data: {
        estado: "borrador",
        mensajeError: "Error enviando evento: " + mensaje,
      },
    });
    return { ok: false, estado: "borrador", mensajeError: mensaje };
  }
}

// ============================================================
// Firma XAdES-EPES sobre nodo <ApplicationResponse>
// ============================================================

/**
 * Firma XAdES-EPES envolvente sobre el elemento raíz
 * <ApplicationResponse>. Mismo helper que signXMLWithXAdES
 * pero con la referencia XPath apuntando al nodo del Application
 * Response (no Invoice).
 *
 * Internamente usa SignedXml (xml-crypto) con los SignedProperties
 * estándar requeridos por DIAN (signingTime, signingCertificate,
 * dataObjectFormat).
 */
function signApplicationResponseWithXAdES(
  xml: string,
  config: DIANConfig,
  cufe: string,
): string {
  // Reutilizamos signXMLWithXAdES pero ese helper está fijo en
  // xpath "Invoice". Para ApplicationResponse, hacemos una firma
  // equivalente adaptando el resultado: usamos un SignedXml nuevo
  // con la referencia ApplicationResponse.
  //
  // Evitamos tocar dian-real.ts (regla "No tocar otros módulos");
  // importamos SignedXml aquí mismo de forma perezosa.
  //
  // NOTA: usamos requireSync para evitar problemas de ESM en dev.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SignedXml } = require("xml-crypto");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto");

  if (!config.certificate) {
    throw new Error("Certificado no cargado");
  }
  const cert = config.certificate;

  const signingTime = new Date().toISOString();
  const certDer = Buffer.from(
    cert.certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, ""),
    "base64",
  );
  const certDigestSha256 = createHash("sha256")
    .update(certDer)
    .digest("base64");

  const escapeLocal = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const qualifyingProperties = `\
<xades:QualifyingProperties Target="#xmldsig-${cufe}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#">
  <xades:SignedProperties Id="xmldsig-${cufe}-signedprops">
    <xades:SignedSignatureProperties>
      <xades:SigningTime>${signingTime}</xades:SigningTime>
      <xades:SigningCertificate>
        <xades:Cert>
          <xades:CertDigest>
            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
            <ds:DigestValue>${certDigestSha256}</ds:DigestValue>
          </xades:CertDigest>
          <xades:IssuerSerial>
            <ds:X509IssuerName>${escapeLocal(cert.issuer)}</ds:X509IssuerName>
            <ds:X509SerialNumber>${escapeLocal(cert.serialNumber)}</ds:X509SerialNumber>
          </xades:IssuerSerial>
        </xades:Cert>
      </xades:SigningCertificate>
      <xades:SignaturePolicyIdentifier>
        <xades:SignaturePolicyImplied/>
      </xades:SignaturePolicyIdentifier>
    </xades:SignedSignatureProperties>
    <xades:SignedDataObjectProperties>
      <xades:DataObjectFormat ObjectReference="#ref-${cufe}">
        <xades:MimeType>text/xml</xades:MimeType>
        <xades:Encoding>UTF-8</xades:Encoding>
        <xades:Description>Evento Radian - ApplicationResponse UBL 2.1</xades:Description>
      </xades:DataObjectFormat>
    </xades:SignedDataObjectProperties>
  </xades:SignedProperties>
</xades:QualifyingProperties>`;

  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certificatePem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm:
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    objects: [
      {
        content: qualifyingProperties,
        attributes: { Id: `xmldsig-${cufe}-object` },
      },
    ],
  });

  sig.addReference({
    xpath: "//*[local-name()='ApplicationResponse']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: "",
    isEmptyUri: true,
    id: `ref-${cufe}`,
  });

  sig.addReference({
    xpath: "//*[local-name()='SignedProperties']",
    transforms: ["http://www.w3.org/TR/2001/REC-xml-c14n-20010315"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: `#xmldsig-${cufe}-signedprops`,
    isEmptyUri: false,
    type: "http://uri.etsi.org/01903#SignedProperties",
  });

  sig.computeSignature(xml, {
    prefix: "ds",
    attrs: { Id: `xmldsig-${cufe}` },
    location: {
      reference: "//*[local-name()='ApplicationResponse']",
      action: "prepend",
    },
    existingPrefixes: {
      ds: "http://www.w3.org/2000/09/xmldsig#",
      xades: "http://uri.etsi.org/01903/v1.3.2#",
    },
  });

  return sig.getSignedXml();
}

// ============================================================
// Envío SOAP al WebService de eventos Radian
// ============================================================

/**
 * Construye el envelope SOAP 1.2 para `SendBillSync` sobre el
 * servicio de eventos Radian y hace POST al endpoint de DIAN.
 * Devuelve trackId / status / errorMessage.
 */
async function sendEventoRadianToDIAN(
  xmlFirmado: string,
  config: DIANConfig,
  fileName: string,
): Promise<DIANResponse> {
  if (!config.proveedorTecnologicoToken) {
    return {
      isAccepted: false,
      errorMessage:
        "No hay token de proveedor tecnológico configurado. Solicítelo a su PAC.",
    };
  }

  const contentBase64 = Buffer.from(xmlFirmado, "utf8").toString("base64");
  // documentType 03 = ApplicationResponse (evento Radian) según
  // la nomenclatura interna de DIAN.
  const soapAction =
    "http://www.dian.gov.co/servicios/Event/v1.0/IEvent/SendBillSync";
  const endpoint = RADIAN_ENDPOINTS[config.ambiente];

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">${soapAction}</a:Action>
    <a:To s:mustUnderstand="1">${endpoint}</a:To>
    <AuthorizationToken xmlns="http://www.dian.gov.co/servicios/Event/v1.0">
      <Token>${escapeXml(config.proveedorTecnologicoToken)}</Token>
    </AuthorizationToken>
  </s:Header>
  <s:Body>
    <SendBillSync xmlns="http://www.dian.gov.co/servicios/Event/v1.0">
      <fileName>${escapeXml(fileName)}</fileName>
      <contentFile>${contentBase64}</contentFile>
      <documentType>03</documentType>
    </SendBillSync>
  </s:Body>
</s:Envelope>`;

  return postToDianEvento(endpoint, soapEnvelope, soapAction);
}

/**
 * POST al endpoint de eventos Radian. Sigue el mismo patrón que
 * `postToDian` de dian-real.ts (timeout 60s, parse regex de la
 * respuesta SOAP) pero no lo importamos para no acoplar a este
 * módulo a funciones no exportadas.
 */
async function postToDianEvento(
  endpoint: string,
  soapEnvelope: string,
  soapAction: string,
): Promise<DIANResponse> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
        "Accept-Encoding": "gzip,deflate",
        "Content-Length": String(Buffer.byteLength(soapEnvelope, "utf8")),
      },
      body: soapEnvelope,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await response.text();
    return parseDianResponseEvento(text);
  } catch (e: any) {
    return {
      isAccepted: false,
      errorMessage:
        "Error de red/timeout contactando DIAN: " + (e?.message ?? String(e)),
    };
  }
}

/**
 * Extrae trackId, status, errorMessage del XML SOAP de respuesta.
 * Reutiliza el mismo algoritmo de regex pick que dian-real.ts.
 */
function parseDianResponseEvento(responseXml: string): DIANResponse {
  const clean = responseXml.replace(/<\?xml[^>]*\?>/, "").trim();
  const pick = (tag: string) => {
    const re = new RegExp(
      `<[^:>]*:?${tag}[^>]*>([^<]*)</[^:>]*:?${tag}>`,
      "i",
    );
    const m = clean.match(re);
    return m ? m[1].trim() : undefined;
  };

  const trackId = pick("TrackId");
  const statusCode = pick("StatusCode");
  const statusMessage =
    pick("StatusMessage") ?? pick("StatusDescription");
  const cufe = pick("UUID");
  const errorMessageDesc = pick("Description");

  const accepted =
    statusCode !== undefined &&
    /^0[0-9]$/i.test(statusCode) &&
    (statusMessage?.toLowerCase().includes("valid") ?? false);

  return {
    trackId,
    status: statusCode,
    cufe,
    errorMessage: errorMessageDesc,
    raw: clean,
    isAccepted: Boolean(accepted),
  };
}

// ============================================================
// 4. procesarColaRadian
// ============================================================

/**
 * Procesa todos los EventoRadian en estado `borrador` o
 * `enviado` que aún no hayan sido aceptados/rechazados
 * definitivamente. Aplica backoff exponencial (máx 5 intentos).
 *
 * Por cada evento: intenta enviar a DIAN. Si éxito -> aceptado.
 * Si fallo y quedan intentos -> queda en `borrador`/`enviado`
 * con mensajeError. Si fallo y no quedan intentos -> `rechazado`.
 *
 * Como no hay columna de intentos en el modelo EventoRadian
 * (no tocar Prisma), usamos un contador implícito: parseamos
 * `respuestaDIAN` y contamos `intentos` en el JSON. Si no existe,
 * empezamos en 1.
 */
export async function procesarColaRadian(
  empresaId: string,
  limite = 50,
): Promise<ProcesarColaRadianResult> {
  const pendientes = await db.eventoRadian.findMany({
    where: {
      empresaId,
      OR: [{ estado: "borrador" }, { estado: "enviado" }],
    },
    take: limite,
    orderBy: { createdAt: "asc" },
  });

  const result: ProcesarColaRadianResult = {
    procesados: 0,
    aceptados: 0,
    rechazados: 0,
    errores: 0,
    detalles: [],
  };

  for (const ev of pendientes) {
    result.procesados++;

    // Contar intentos previos
    let intentos = 1;
    try {
      if (ev.respuestaDIAN) {
        const parsed = JSON.parse(ev.respuestaDIAN);
        if (typeof parsed.intentos === "number") {
          intentos = parsed.intentos;
        }
      }
    } catch {
      /* ignore */
    }
    intentos += 1;
    const maxIntentos = 5;

    const res = await enviarEventoRadianADian(ev.id, empresaId);

    if (res.ok) {
      result.aceptados++;
      result.detalles.push({
        eventoId: ev.id,
        numero: ev.numero,
        estado: "aceptado",
        mensaje: res.trackId,
      });
    } else if (intentos >= maxIntentos) {
      // Marcar como rechazado definitivo
      await db.eventoRadian.update({
        where: { id: ev.id },
        data: {
          estado: "rechazado",
          mensajeError:
            res.mensajeError ?? "Máximos reintentos alcanzados",
        },
      });
      result.rechazados++;
      result.detalles.push({
        eventoId: ev.id,
        numero: ev.numero,
        estado: "rechazado",
        mensaje: res.mensajeError,
      });
    } else {
      // Reintentar más tarde con backoff exponencial. Guardamos
      // el contador de intentos en respuestaDIAN para que la
      // próxima pasada lo lea.
      const delayMs = Math.pow(2, intentos) * 60 * 1000;
      const proximoIntento = new Date(Date.now() + delayMs);
      const prev = (() => {
        try {
          return ev.respuestaDIAN ? JSON.parse(ev.respuestaDIAN) : {};
        } catch {
          return {};
        }
      })();
      await db.eventoRadian.update({
        where: { id: ev.id },
        data: {
          estado: "borrador",
          mensajeError: res.mensajeError ?? "Pendiente de reintento",
          respuestaDIAN: JSON.stringify({
            ...prev,
            intentos,
            proximoIntento: proximoIntento.toISOString(),
          }),
        },
      });
      result.errores++;
      result.detalles.push({
        eventoId: ev.id,
        numero: ev.numero,
        estado: "borrador",
        mensaje: res.mensajeError,
      });
    }
  }

  return result;
}

// ============================================================
// Helper de generación de número consecutivo
// ============================================================

/**
 * Genera el siguiente número consecutivo de evento Radian para
 * una empresa, en formato `RAD-YYYY-NNNNNN` (6 dígitos).
 * Cuenta los eventos existentes en el año actual y suma 1.
 */
export async function siguienteNumeroRadian(
  empresaId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00`);
  const end = new Date(`${year}-12-31T23:59:59`);
  const cnt = await db.eventoRadian.count({
    where: {
      empresaId,
      fecha: { gte: start, lte: end },
    },
  });
  return `RAD-${year}-${String(cnt + 1).padStart(6, "0")}`;
}
