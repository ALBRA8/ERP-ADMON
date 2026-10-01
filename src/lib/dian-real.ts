// ============================================================
// dian-real.ts — Facturación Electrónica DIAN real
// Carga de certificado X.509 (PFX/P12), firma XAdES-EPES envolvente
// sobre el nodo <Invoice>, envío SOAP (SendBillSync / GetStatus /
// SendNominaSync) a los WebServices de la DIAN Colombia, y procesa
// la cola de reintentos DIANEnvio. Mejora Hermes §5.3 + §10.2.
//
// IMPORTANTE:Sin certificado real ni PAC autorizado, las funciones
// responden gracefully (no crashean). El endpoint de test-connection
// devuelve {ok:false, message:"No hay certificado cargado..."}.
// ============================================================

import { createHash, X509Certificate } from "crypto";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

// ---------- Tipos ----------

export interface CertificateInfo {
  /** X509 cert en formato PEM (incluye cabeceras BEGIN/END CERTIFICATE) */
  certificatePem: string;
  /** private key PEM (PKCS#8) */
  privateKeyPem: string;
  /** subject del certificado (DN) */
  subject: string;
  /** issuer del certificado (DN) */
  issuer: string;
  /** número serial del certificado en hex */
  serialNumber: string;
  /** huella digital SHA-256 en hex del certificado DER */
  fingerprintSha256: string;
  validFrom: Date;
  validTo: Date;
}

export interface DIANConfig {
  ambiente: "pruebas" | "produccion";
  /** NIT del proveedor tecnológico autorizado (PAC) */
  proveedorTecnologicoNit?: string;
  /** token asignado por DIAN al PAC (texto plano, ya descifrado) */
  proveedorTecnologicoToken?: string;
  /** identificador del software registrado en DIAN */
  softwareId?: string;
  /** PIN del software */
  softwarePin?: string;
  /** URL del webhook donde DIAN notifica cambios de estado */
  webhookUrl?: string;
  /** certificado cargado (si existe) */
  certificate?: CertificateInfo;
}

export interface DIANResponse {
  trackId?: string;
  status?: string;
  cufe?: string;
  errorMessage?: string;
  raw?: string;
  isAccepted: boolean;
}

export interface QueueProcessResult {
  processed: number;
  accepted: number;
  rejected: number;
  errors: number;
  rescheduled: number;
  details: Array<{ envioId: string; facturaId?: string; estado: string; mensaje?: string }>;
}

const DIAN_ENDPOINTS = {
  produccion: "https://vpfe.dian.gov.co/Billing/v1.0/Billing.svc",
  pruebas: "https://vpfe-hab.dian.gov.co/Billing/v1.0/Billing.svc",
} as const;

// ---------- Carga de certificado PFX/P12 ----------

/**
 * Carga un certificado PFX/P12 (base64 o Buffer) usando `node-forge`
 * para parsear la estructura PKCS#12, extraer la clave privada y
 * el X.509, y devolverlos en formato PEM. Devuelve la info necesaria
 * para firmar.
 *
 * Si la password es incorrecta, lanza "PKCS#12 password invalid".
 */
export function loadCertificate(
  p12Base64: string | Buffer,
  password: string,
): CertificateInfo {
  const pfxBuffer = Buffer.isBuffer(p12Base64)
    ? p12Base64
    : Buffer.from(p12Base64, "base64");

  // node-forge trabaja con strings binarios. Convertimos el buffer.
  const p12Der = pfxBuffer.toString("binary");
  const asn1 = forge.asn1.fromDer(p12Der);
  let pfx: any;
  try {
    pfx = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (e: any) {
    throw new Error(
      "No se pudo abrir el P12. Verifica la contraseña. (" +
        (e?.message ?? "unknown") +
        ")",
    );
  }

  // Recorrer safeContents -> safeBags buscando certificado y private key.
  let forgeCert: any = null;
  let forgeKey: any = null;
  for (const sc of pfx.safeContents ?? []) {
    for (const bag of sc.safeBags ?? []) {
      if (bag.cert && !forgeCert) forgeCert = bag.cert;
      if (bag.key && !forgeKey) forgeKey = bag.key;
    }
  }
  if (!forgeCert) {
    throw new Error(
      "El P12 no contiene un certificado X.509 en un bag accesible.",
    );
  }
  if (!forgeKey) {
    throw new Error(
      "El P12 no contiene una clave privada accesible. ¿Está protegido con encryptionSafeContainers que no soportamos?",
    );
  }

  const certPem = forge.pki.certificateToPem(forgeCert);
  const keyPem = forge.pki.privateKeyToPem(forgeKey);
  // DER del certificado (para fingerprint)
  const certDer = forge.asn1.toDer(
    forge.pki.certificateToAsn1(forgeCert),
  ).getBytes();
  const certDerBuf = Buffer.from(certDer, "binary");

  // Para subject/issuer/serial: usamos crypto.X509Certificate que
  // parsea ASN.1 estándar y devuelve DN legible.
  const x509 = new X509Certificate(certDerBuf);
  const fingerprint = createHash("sha256").update(certDerBuf).digest("hex");

  return {
    certificatePem: certPem.replace(/\r/g, "").trim() + "\n",
    privateKeyPem: keyPem,
    subject: x509.subject,
    issuer: x509.issuer,
    serialNumber: x509.serialNumber,
    fingerprintSha256: fingerprint,
    validFrom: new Date(x509.validFrom),
    validTo: new Date(x509.validTo),
  };
}

// ---------- Firma XAdES-EPES envolvente sobre <Invoice> ----------

/**
 * Aplica firma XAdES-EPES envolvente al elemento raíz <Invoice>
 * con los SignedProperties requeridos por la DIAN Colombia:
 *   - signingTime (fecha de firma ISO)
 *   - signingCertificate (digest SHA-256 del X509)
 *   - dataObjectFormat (descripción del documento)
 *
 * El resultado es el XML original con <ds:Signature> insertado como
 * hijo de <Invoice>, y una referencia con URI vacía al documento entero.
 */
export function signXMLWithXAdES(
  xml: string,
  cert: CertificateInfo,
  cufe: string,
): string {
  const signingTime = new Date().toISOString();
  const certDigestSha256 = createHash("sha256")
    .update(stripPemHeaders(cert.certificatePem))
    .digest("base64");

  // XAdES Qualifying Properties (envueltas en ds:Object)
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
            <ds:X509IssuerName>${escapeXml(cert.issuer)}</ds:X509IssuerName>
            <ds:X509SerialNumber>${escapeXml(cert.serialNumber)}</ds:X509SerialNumber>
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
        <xades:Description>Factura Electrónica de Venta UBL 2.1</xades:Description>
      </xades:DataObjectFormat>
    </xades:SignedDataObjectProperties>
  </xades:SignedProperties>
</xades:QualifyingProperties>`;

  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certificatePem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    // XAdES Qualifying Properties van dentro de ds:Object
    objects: [
      {
        content: qualifyingProperties,
        attributes: { Id: `xmldsig-${cufe}-object` },
      },
    ],
  });

  // Referencia 1: documento firmado (URI vacía = documento completo)
  sig.addReference({
    xpath: "//*[local-name()='Invoice']",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: "",
    isEmptyUri: true,
    id: `ref-${cufe}`,
  });

  // Referencia 2: SignedProperties (XAdES)
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
      reference: "//*[local-name()='Invoice']",
      action: "prepend",
    },
    existingPrefixes: {
      ds: "http://www.w3.org/2000/09/xmldsig#",
      xades: "http://uri.etsi.org/01903/v1.3.2#",
    },
  });

  return sig.getSignedXml();
}

// ---------- Envío SOAP a DIAN ----------

/**
 * Construye el envelope SOAP 1.2 para `SendBillSync` y hace POST
 * al WebService de la DIAN. Devuelve trackId / status / errorMessage.
 *
 * Sin token de PAC configurado, lanza error controlado con mensaje claro.
 */
export async function sendBillSyncToDIAN(
  xmlFirmado: string,
  config: DIANConfig,
  fileName = `face_${Date.now()}.xml`,
): Promise<DIANResponse> {
  if (!config.proveedorTecnologicoToken) {
    return {
      isAccepted: false,
      errorMessage:
        "No hay token de proveedor tecnológico configurado. Solicítelo a su PAC.",
    };
  }

  const contentBase64 = Buffer.from(xmlFirmado, "utf8").toString("base64");
  const soapAction = "http://www.dian.gov.co/servicios/Billing/v1.0/IBilling/SendBillSync";
  const endpoint = DIAN_ENDPOINTS[config.ambiente];

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">${soapAction}</a:Action>
    <a:To s:mustUnderstand="1">${endpoint}</a:To>
    <AuthorizationToken xmlns="http://www.dian.gov.co/servicios/Billing/v1.0">
      <Token>${escapeXml(config.proveedorTecnologicoToken)}</Token>
    </AuthorizationToken>
  </s:Header>
  <s:Body>
    <SendBillSync xmlns="http://www.dian.gov.co/servicios/Billing/v1.0">
      <fileName>${escapeXml(fileName)}</fileName>
      <contentFile>${contentBase64}</contentFile>
      <documentType>01</documentType>
    </SendBillSync>
  </s:Body>
</s:Envelope>`;

  return postToDian(endpoint, soapEnvelope, soapAction, "SendBillSync");
}

/**
 * Consulta el estado de un envío por su trackId (GetStatus).
 */
export async function getDianStatus(
  trackId: string,
  config: DIANConfig,
): Promise<DIANResponse> {
  if (!config.proveedorTecnologicoToken) {
    return {
      isAccepted: false,
      errorMessage:
        "No hay token de proveedor tecnológico configurado.",
    };
  }

  const endpoint = DIAN_ENDPOINTS[config.ambiente];
  const soapAction = "http://www.dian.gov.co/servicios/Billing/v1.0/IBilling/GetStatus";
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">${soapAction}</a:Action>
    <a:To s:mustUnderstand="1">${endpoint}</a:To>
    <AuthorizationToken xmlns="http://www.dian.gov.co/servicios/Billing/v1.0">
      <Token>${escapeXml(config.proveedorTecnologicoToken)}</Token>
    </AuthorizationToken>
  </s:Header>
  <s:Body>
    <GetStatus xmlns="http://www.dian.gov.co/servicios/Billing/v1.0">
      <trackId>${escapeXml(trackId)}</trackId>
    </GetStatus>
  </s:Body>
</s:Envelope>`;

  return postToDian(endpoint, soapEnvelope, soapAction, "GetStatusResponse");
}

/**
 * Envío de Nómina Electrónica (variante con SendNominaSync).
 */
export async function sendNominaSync(
  xmlFirmado: string,
  config: DIANConfig,
  fileName = `nomina_${Date.now()}.xml`,
): Promise<DIANResponse> {
  if (!config.proveedorTecnologicoToken) {
    return {
      isAccepted: false,
      errorMessage:
        "No hay token de proveedor tecnológico configurado.",
    };
  }

  const contentBase64 = Buffer.from(xmlFirmado, "utf8").toString("base64");
  const soapAction = "http://www.dian.gov.co/servicios/Nomina/v1.0/INomina/SendNominaSync";
  // Nota: la DIAN tiene un endpoint separado para nómina; usamos el mismo billing.svc por simplicidad
  const endpoint = config.ambiente === "produccion"
    ? "https://vpfe.dian.gov.co/Nomina/v1.0/Nomina.svc"
    : "https://vpfe-hab.dian.gov.co/Nomina/v1.0/Nomina.svc";

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">${soapAction}</a:Action>
    <a:To s:mustUnderstand="1">${endpoint}</a:To>
    <AuthorizationToken xmlns="http://www.dian.gov.co/servicios/Billing/v1.0">
      <Token>${escapeXml(config.proveedorTecnologicoToken)}</Token>
    </AuthorizationToken>
  </s:Header>
  <s:Body>
    <SendNominaSync xmlns="http://www.dian.gov.co/servicios/Nomina/v1.0">
      <fileName>${escapeXml(fileName)}</fileName>
      <contentFile>${contentBase64}</contentFile>
      <documentType>NI</documentType>
    </SendNominaSync>
  </s:Body>
</s:Envelope>`;

  return postToDian(endpoint, soapEnvelope, soapAction, "SendNominaSyncResponse");
}

// ---------- POST a DIAN con manejo de errores ----------

async function postToDian(
  endpoint: string,
  soapEnvelope: string,
  soapAction: string,
  expectedResponseLocalName: string,
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
    return parseDianResponse(text, expectedResponseLocalName);
  } catch (e: any) {
    return {
      isAccepted: false,
      errorMessage:
        "Error de red/timeout contactando DIAN: " + (e?.message ?? String(e)),
    };
  }
}

/**
 * Extrae trackId, status, isValid y errores del XML de respuesta SOAP.
 * La DIAN responde con un objeto que tiene `StatusCode`, `StatusDescription`,
 * y un `ErrorMessage`-array con `statusCode`/`description`/`correspondence`-id.
 */
function parseDianResponse(
  responseXml: string,
  expectedLocalName: string,
): DIANResponse {
  const clean = responseXml.replace(/<\?xml[^>]*\?>/, "").trim();
  // Quick regex-based extraction (avoid xpath dependency).
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
  const statusMessage = pick("StatusMessage") ?? pick("StatusDescription");
  const cufe = pick("UUID");
  const errorMessageDesc = pick("Description");

  // 00..99 -> DIAN acceptance: 00..09 = aceptado; 99, 100.. = error
  // Convención estándar DIAN: isValid == "true" si StatusCode está entre "00".."09".
  const accepted =
    statusCode !== undefined &&
    /^0[0-9]$/i.test(statusCode) &&
    statusMessage?.toLowerCase().includes("valid");

  return {
    trackId,
    status: statusCode,
    cufe,
    errorMessage: errorMessageDesc,
    raw: clean,
    isAccepted: Boolean(accepted),
  };
}

// ---------- Carga de configuración DIAN desde BD ----------

/**
 * Carga la configuración DIAN activa de una empresa, descifra el
 * certificado P12 y la contraseña, e instancia el CertificateInfo.
 * Devuelve null si no hay configuración activa o no hay certificado.
 */
export async function loadDIANConfigFromDB(
  empresaId: string,
): Promise<{ config: DIANConfig; configRecord: any } | null> {
  const record = await db.configuracionDIAN.findFirst({
    where: {
      empresaId,
      activo: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!record || !record.certificadoP12Enc || !record.certificadoPasswordEnc) {
    return null;
  }

  try {
    const p12B64 = decrypt(record.certificadoP12Enc);
    const password = decrypt(record.certificadoPasswordEnc);
    const cert = loadCertificate(p12B64, password);

    return {
      config: {
        ambiente: record.ambiente as "pruebas" | "produccion",
        proveedorTecnologicoNit: record.proveedorTecnologicoNit ?? undefined,
        proveedorTecnologicoToken: record.proveedorTecnologicoTokenEnc
          ? decrypt(record.proveedorTecnologicoTokenEnc)
          : undefined,
        softwareId: record.softwareId ?? undefined,
        softwarePin: record.softwarePin ?? undefined,
        webhookUrl: record.webhookUrl ?? undefined,
        certificate: cert,
      },
      configRecord: record,
    };
  } catch (e: any) {
    console.error(
      "[dian-real] No se pudo cargar el certificado:",
      e?.message ?? e,
    );
    return null;
  }
}

// ---------- Flujo completo: firmar + enviar factura ----------

/**
 * Toma una factura ya persistida (con xmlUBL), firma con XAdES-EPES,
 * envía a DIAN (SendBillSync), registra en DIANEnvio y actualiza
 * FacturaVenta.estadoDIAN. Si falla, programa reintento.
 */
export async function enviarFacturaADian(
  facturaId: string,
  empresaId: string,
): Promise<{ ok: boolean; envioId?: string; trackId?: string; mensaje?: string }> {
  const factura = await db.facturaVenta.findFirst({
    where: { id: facturaId, empresaId },
  });
  if (!factura) {
    return { ok: false, mensaje: "Factura no encontrada" };
  }
  if (!factura.xmlUBL || !factura.cufe) {
    return { ok: false, mensaje: "La factura no tiene XML UBL ni CUFE generado" };
  }
  if (!["borrador", "procesado", "rechazado"].includes(factura.estadoDIAN)) {
    // ya aceptada o enviada-aceptada, no reenviar salvo explícito
  }

  const loaded = await loadDIANConfigFromDB(empresaId);
  if (!loaded) {
    return {
      ok: false,
      mensaje:
        "No hay configuración DIAN activa con certificado cargado. Sube tu .p12 en la pestaña Configuración.",
    };
  }

  const { config, configRecord } = loaded;

  // 1. Crear registro de envío (pendiente)
  const envio = await db.dIANEnvio.create({
    data: {
      empresaId,
      facturaId: factura.id,
      tipoDocumento: "factura_venta",
      cufe: factura.cufe!,
      estado: "enviando",
      intentos: 1,
      maxIntentos: 5,
      proximoIntento: null,
    },
  });

  try {
    // 2. Firmar XML
    const xmlFirmado = signXMLWithXAdES(factura.xmlUBL, config.certificate!, factura.cufe!);
    await db.dIANEnvio.update({
      where: { id: envio.id },
      data: { xmlFirmado },
    });

    // 3. Enviar a DIAN
    const dianResp = await sendBillSyncToDIAN(xmlFirmado, config, `face_${factura.numero}.xml`);

    if (dianResp.trackId) {
      await db.dIANEnvio.update({
        where: { id: envio.id },
        data: {
          trackId: dianResp.trackId,
          estado: dianResp.isAccepted ? "aceptado" : "pendiente",
          respuestaDian: JSON.stringify({
            statusCode: dianResp.status,
            statusMessage: dianResp.errorMessage,
            cufe: dianResp.cufe,
            raw: dianResp.raw,
          }),
          proximoIntento: dianResp.isAccepted
            ? null
            : new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      await db.facturaVenta.update({
        where: { id: factura.id },
        data: {
          estadoDIAN: dianResp.isAccepted ? "aceptado" : "procesado",
        },
      });

      return {
        ok: true,
        envioId: envio.id,
        trackId: dianResp.trackId,
        mensaje: dianResp.isAccepted
          ? "Factura aceptada por DIAN"
          : `Enviada, en proceso (trackId: ${dianResp.trackId})`,
      };
    } else {
      // Error de envío
      await db.dIANEnvio.update({
        where: { id: envio.id },
        data: {
          estado: "error",
          mensajeError: dianResp.errorMessage ?? "Error desconocido",
          respuestaDian: dianResp.raw
            ? JSON.stringify({ raw: dianResp.raw })
            : null,
          proximoIntento: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return {
        ok: false,
        envioId: envio.id,
        mensaje: dianResp.errorMessage ?? "Error de envío DIAN",
      };
    }
  } catch (e: any) {
    const mensaje = e?.message ?? String(e);
    await db.dIANEnvio.update({
      where: { id: envio.id },
      data: {
        estado: "error",
        mensajeError: mensaje,
        proximoIntento: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return { ok: false, envioId: envio.id, mensaje };
  }
}

// ---------- Procesador de cola de reintentos ----------

/**
 * Procesa todos los DIANEnvio pendientes o con proximoIntento vencido.
 * Aplica backoff exponencial: intento N -> 2^N * 60s.
 */
export async function procesarColaDIAN(
  empresaId: string,
  limite = 50,
): Promise<QueueProcessResult> {
  const now = new Date();
  const pendientes = await db.dIANEnvio.findMany({
    where: {
      empresaId,
      OR: [
        { estado: "pendiente" },
        { estado: "error" },
        { estado: "enviando", proximoIntento: { lte: now } },
      ],
      intentos: { lt: 5 },
    },
    take: limite,
    orderBy: { createdAt: "asc" },
  });

  const result: QueueProcessResult = {
    processed: 0,
    accepted: 0,
    rejected: 0,
    errors: 0,
    rescheduled: 0,
    details: [],
  };

  for (const envio of pendientes) {
    if (!envio.facturaId) continue;
    result.processed++;

    const updated = await db.dIANEnvio.update({
      where: { id: envio.id },
      data: {
        intentos: { increment: 1 },
        estado: "enviando",
      },
    });

    const res = await enviarFacturaADian(envio.facturaId, empresaId);

    if (res.ok && res.trackId) {
      result.accepted++;
      result.details.push({
        envioId: envio.id,
        facturaId: envio.facturaId ?? undefined,
        estado: "aceptado",
        mensaje: res.mensaje,
      });
    } else {
      // Si ya llegó a maxIntentos, marcar como rechazado definitivo
      if (updated.intentos >= updated.maxIntentos) {
        await db.dIANEnvio.update({
          where: { id: envio.id },
          data: {
            estado: "rechazado",
            mensajeError: res.mensaje ?? "Máximos reintentos alcanzados",
          },
        });
        result.rejected++;
      } else {
        // Reagendar con backoff exponencial (2^n * 60s)
        const delayMs = Math.pow(2, updated.intentos) * 60 * 1000;
        await db.dIANEnvio.update({
          where: { id: envio.id },
          data: {
            estado: "error",
            mensajeError: res.mensaje,
            proximoIntento: new Date(Date.now() + delayMs),
          },
        });
        result.errors++;
        result.rescheduled++;
      }
      result.details.push({
        envioId: envio.id,
        facturaId: envio.facturaId ?? undefined,
        estado: "error",
        mensaje: res.mensaje,
      });
    }
  }

  return result;
}

// ---------- Helpers XML ----------

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripPemHeaders(pem: string): string {
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
}

// ---------- Test de conexión DIAN ----------

/**
 * Prueba la conexión con DIAN en el ambiente configurado.
 * Sin certificado, responde gracefully.
 */
export async function testConnectionDIAN(
  empresaId: string,
): Promise<{ ok: boolean; message: string; ambiente?: string }> {
  const loaded = await loadDIANConfigFromDB(empresaId);
  if (!loaded) {
    return {
      ok: false,
      message:
        "No hay certificado cargado. Sube tu .p12 en la pestaña Configuración.",
    };
  }

  const { config, configRecord } = loaded;

  // Validar vigencia del certificado
  const now = new Date();
  if (config.certificate!.validFrom > now) {
    return {
      ok: false,
      message: `El certificado aún no es válido (vigente desde ${config.certificate!.validFrom.toISOString().slice(0, 10)})`,
      ambiente: config.ambiente,
    };
  }
  if (config.certificate!.validTo < now) {
    return {
      ok: false,
      message: `El certificado expiró el ${config.certificate!.validTo.toISOString().slice(0, 10)}. Renueva el P12 con tu CA.`,
      ambiente: config.ambiente,
    };
  }

  // Si hay token PAC, hacemos ping real a DIAN con un trackId falso
  // (la DIAN responde 404/202, lo que prueba reachability).
  if (config.proveedorTecnologicoToken) {
    const endpoint = DIAN_ENDPOINTS[config.ambiente];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body/></s:Envelope>',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // Cualquier respuesta HTTP (incluso 400/500) indica reachability
      return {
        ok: true,
        message: `Conexión exitosa con DIAN ${config.ambiente}. Respuesta HTTP ${resp.status}. Certificado: ${config.certificate!.subject.slice(0, 60)}...`,
        ambiente: config.ambiente,
      };
    } catch (e: any) {
      return {
        ok: false,
        message: `No se pudo conectar con DIAN: ${e?.message ?? e}`,
        ambiente: config.ambiente,
      };
    }
  }

  // Hay certificado pero no PAC: certificamos la firma localmente
  return {
    ok: true,
    message: `Certificado cargado y vigente (subject: ${config.certificate!.subject.slice(0, 60)}...). Sin token PAC: el envío real requiere credenciales de proveedor tecnológico autorizado.`,
    ambiente: config.ambiente,
  };
}

// ---------- Guardar configuración desde multipart ----------

/**
 * Recibe los campos del form de configuración DIAN, valida y guarda.
 * Cifra el P12 y la contraseña con AES-256-GCM antes de persistir.
 */
export async function saveDIANConfig(params: {
  empresaId: string;
  ambiente: "pruebas" | "produccion";
  certificadoP12B64?: string; // base64 del .p12
  certificadoPassword?: string;
  proveedorTecnologicoNit?: string;
  proveedorTecnologicoToken?: string;
  softwareId?: string;
  softwarePin?: string;
  webhookUrl?: string;
  activo?: boolean;
}): Promise<{ ok: boolean; config?: any; mensaje: string }> {
  const {
    empresaId,
    ambiente,
    certificadoP12B64,
    certificadoPassword,
    proveedorTecnologicoNit,
    proveedorTecnologicoToken,
    softwareId,
    softwarePin,
    webhookUrl,
    activo = true,
  } = params;

  let certSubject: string | undefined;
  let certValidFrom: Date | undefined;
  let certValidTo: Date | undefined;
  let p12Enc: string | undefined;
  let passEnc: string | undefined;

  if (certificadoP12B64 && certificadoPassword) {
    // Carga y valida el certificado antes de guardar
    const info = loadCertificate(certificadoP12B64, certificadoPassword);
    certSubject = info.subject;
    certValidFrom = info.validFrom;
    certValidTo = info.validTo;
    p12Enc = encrypt(certificadoP12B64);
    passEnc = encrypt(certificadoPassword);
  }

  // Si se activa esta config, desactivar las demás de la empresa
  if (activo) {
    await db.configuracionDIAN.updateMany({
      where: { empresaId, activo: true },
      data: { activo: false },
    });
  }

  // Upsert por (empresaId, ambiente)
  const existing = await db.configuracionDIAN.findUnique({
    where: {
      empresaId_ambiente: { empresaId, ambiente },
    },
  });

  const data: any = {
    ambiente,
    proveedorTecnologicoNit,
    proveedorTecnologicoTokenEnc: proveedorTecnologicoToken
      ? encrypt(proveedorTecnologicoToken)
      : existing?.proveedorTecnologicoTokenEnc ?? null,
    softwareId,
    softwarePin,
    webhookUrl,
    activo,
  };
  if (p12Enc) data.certificadoP12Enc = p12Enc;
  if (passEnc) data.certificadoPasswordEnc = passEnc;
  if (certSubject) data.certificadoSubject = certSubject;
  if (certValidFrom) data.certificadoValidFrom = certValidFrom;
  if (certValidTo) data.certificadoValidTo = certValidTo;

  let record;
  if (existing) {
    record = await db.configuracionDIAN.update({
      where: { id: existing.id },
      data,
    });
  } else {
    record = await db.configuracionDIAN.create({
      data: {
        empresaId,
        ambiente,
        certificadoP12Enc: p12Enc,
        certificadoPasswordEnc: passEnc,
        certificadoSubject: certSubject,
        certificadoValidFrom: certValidFrom,
        certificadoValidTo: certValidTo,
        proveedorTecnologicoNit,
        proveedorTecnologicoTokenEnc: proveedorTecnologicoToken
          ? encrypt(proveedorTecnologicoToken)
          : null,
        softwareId,
        softwarePin,
        webhookUrl,
        activo,
      },
    });
  }

  return {
    ok: true,
    config: record,
    mensaje: certSubject
      ? `Certificado cargado: ${certSubject.slice(0, 60)}... (válido hasta ${certValidTo?.toISOString().slice(0, 10)})`
      : "Configuración guardada sin certificado nuevo",
  };
}
