// ============================================================
// MARSELLA ERP — Medios Magnéticos DIAN Colombia
// Generadores para formatos 1007, 2276, 2277, 1647, 2238
// + Serializadores a TXT (DIAN) y XLSX (para contador).
//
// Convención DIAN:
//   1007 = Certificados de retención en la fuente practicados
//   2276 = Retenciones en la fuente que le practicaron a la empresa
//   2277 = Conceptos de retención de IVA
//   1647 = Conceptos básicos de ingresos brutos
//   2238 = Conceptos básicos de egresos pagados
// ============================================================
import { db } from "@/lib/db";

// ---------- Tipos ----------

export type CodigoFormatoDIAN =
  | "1007"
  | "2276"
  | "2277"
  | "1647"
  | "2238";

export interface RegistroMedio {
  tipoDocExpedida: string; // CC | NIT | CE | TI | PT
  nitTercero: string;
  razonSocial: string;
  concepto: string; // RETEFUENTE | RETEIVA | RETEICA | IVA_GENERADO | IVA_DEDUCTIBLE | INGRESO | EGRESO
  valorPago: number;
  baseRetencion: number;
  porcentaje: number;
  valorRetenido: number;
  ciudad?: string | null;
}

export interface ResultadoGeneracion {
  registros: RegistroMedio[];
  totalRetenido: number;
  totalRegistros: number;
  totalPago: number;
}

export const NOMBRES_FORMATO: Record<CodigoFormatoDIAN, string> = {
  "1007": "Certificados de retención en la fuente practicados",
  "2276": "Retenciones en la fuente que le practicaron a la empresa",
  "2277": "Conceptos de retención de IVA",
  "1647": "Conceptos básicos de ingresos brutos",
  "2238": "Conceptos básicos de egresos pagados",
};

// ---------- Helpers ----------

function rangoAnio(anio: number) {
  const inicio = new Date(anio, 0, 1, 0, 0, 0, 0);
  const fin = new Date(anio + 1, 0, 1, 0, 0, 0, 0);
  return { gte: inicio, lt: fin };
}

function redondear(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function pctSobreBase(retenido: number, base: number): number {
  if (!base || base <= 0) return 0;
  return redondear((retenido / base) * 100);
}

// Resuelve info de un tercero por id (incluyendo tipoDocumento,
// numeroDocumento, nombre y ciudad). Devuelve valores por defecto si
// el tercero fue eliminado (SetNull en FK).
async function infoTercero(terceroId: string | null | undefined) {
  if (!terceroId) return null;
  const t = await db.tercero.findUnique({
    where: { id: terceroId },
    include: { ciudad: true },
  });
  if (!t) return null;
  return {
    tipoDocExpedida: t.tipoDocumento || "NIT",
    nitTercero: t.numeroDocumento,
    razonSocial: t.nombreComercial || t.nombre,
    ciudad: t.ciudad?.nombre ?? t.ciudadId ?? null,
  };
}

// Resuelve info de tercero desde snapshot (cuando el documento la trae
// embebida, ej. FacturaVenta.nombreCliente/nitCliente).
function snapshotTercero(
  nombre: string | null | undefined,
  nit: string | null | undefined,
) {
  return {
    tipoDocExpedida: "NIT",
    nitTercero: nit || "0",
    razonSocial: nombre || "SIN NOMBRE",
    ciudad: null,
  };
}

// ============================================================
// 1007 — Certificados de retención en la fuente PRACTICADOS
// Fuentes: RecibosCaja + ComprobantesEgreso del año. Las retenciones
// no se guardan como columnas en esos comprobantes; se derivan de
// las facturas que el comprobante aplica (aplicacionFacturas /
// aplicacionCompras, JSON [{facturaId, valor}]).
// ============================================================
export async function generarFormato1007(
  empresaId: string,
  anio: number,
): Promise<ResultadoGeneracion> {
  const rango = rangoAnio(anio);
  const registros: RegistroMedio[] = [];

  // --- Comprobantes de Egreso → Facturas de Compra (retenciones practicadas a proveedores)
  const egresos = await db.comprobanteEgreso.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });

  for (const eg of egresos) {
    const tInfo = await infoTercero(eg.terceroId);
    const base = snapshotTercero(eg.nombreTercero, null);
    const tipoDoc = tInfo?.tipoDocExpedida ?? base.tipoDocExpedida;
    const nit = tInfo?.nitTercero ?? "0";
    const razon = tInfo?.razonSocial ?? eg.nombreTercero ?? base.razonSocial;
    const ciudad = tInfo?.ciudad ?? null;

    // Suma de retenciones de las FacturasCompra aplicadas
    let totalRetenido = 0;
    let totalBase = 0;
    let totalPago = Number(eg.valorTotal);
    if (eg.aplicacionCompras) {
      try {
        const apps = JSON.parse(eg.aplicacionCompras) as Array<{
          facturaId?: string;
          valor?: number;
        }>;
        for (const a of apps) {
          if (!a?.facturaId) continue;
          const fc = await db.facturaCompra.findUnique({
            where: { id: a.facturaId },
          });
          if (!fc) continue;
          totalRetenido += Number(fc.totalRetenciones || 0);
          totalBase += Number(fc.subtotal || 0);
        }
      } catch {
        /* JSON inválido → ignore */
      }
    }

    if (totalRetenido > 0) {
      registros.push({
        tipoDocExpedida: tipoDoc,
        nitTercero: nit,
        razonSocial: razon,
        concepto: "RETEFUENTE",
        valorPago: redondear(totalPago),
        baseRetencion: redondear(totalBase),
        porcentaje: pctSobreBase(totalRetenido, totalBase),
        valorRetenido: redondear(totalRetenido),
        ciudad,
      });
    }
  }

  // --- Recibos de Caja → Facturas de Venta (retenciones practicadas al cliente, si la empresa es agente retenedor)
  const recibos = await db.reciboCaja.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });

  for (const rc of recibos) {
    const tInfo = await infoTercero(rc.terceroId);
    const base = snapshotTercero(rc.nombreTercero, null);
    const tipoDoc = tInfo?.tipoDocExpedida ?? base.tipoDocExpedida;
    const nit = tInfo?.nitTercero ?? "0";
    const razon = tInfo?.razonSocial ?? rc.nombreTercero ?? base.razonSocial;
    const ciudad = tInfo?.ciudad ?? null;

    let totalReteFuente = 0;
    let totalReteIva = 0;
    let totalReteIca = 0;
    let totalBase = 0;
    let totalPago = Number(rc.valorTotal);

    if (rc.aplicacionFacturas) {
      try {
        const apps = JSON.parse(rc.aplicacionFacturas) as Array<{
          facturaId?: string;
          valor?: number;
        }>;
        for (const a of apps) {
          if (!a?.facturaId) continue;
          const fv = await db.facturaVenta.findUnique({
            where: { id: a.facturaId },
          });
          if (!fv) continue;
          totalReteFuente += Number(fv.totalReteFuente || 0);
          totalReteIva += Number(fv.totalReteIva || 0);
          totalReteIca += Number(fv.totalReteICA || 0);
          totalBase += Number(fv.subtotalNeto || 0);
        }
      } catch {
        /* ignore */
      }
    }

    if (totalReteFuente > 0) {
      registros.push({
        tipoDocExpedida: tipoDoc,
        nitTercero: nit,
        razonSocial: razon,
        concepto: "RETEFUENTE",
        valorPago: redondear(totalPago),
        baseRetencion: redondear(totalBase),
        porcentaje: pctSobreBase(totalReteFuente, totalBase),
        valorRetenido: redondear(totalReteFuente),
        ciudad,
      });
    }
    if (totalReteIva > 0) {
      registros.push({
        tipoDocExpedida: tipoDoc,
        nitTercero: nit,
        razonSocial: razon,
        concepto: "RETEIVA",
        valorPago: redondear(totalPago),
        baseRetencion: redondear(totalBase),
        porcentaje: pctSobreBase(totalReteIva, totalBase),
        valorRetenido: redondear(totalReteIva),
        ciudad,
      });
    }
    if (totalReteIca > 0) {
      registros.push({
        tipoDocExpedida: tipoDoc,
        nitTercero: nit,
        razonSocial: razon,
        concepto: "RETEICA",
        valorPago: redondear(totalPago),
        baseRetencion: redondear(totalBase),
        porcentaje: pctSobreBase(totalReteIca, totalBase),
        valorRetenido: redondear(totalReteIca),
        ciudad,
      });
    }
  }

  const totalRetenido = redondear(
    registros.reduce((s, r) => s + r.valorRetenido, 0),
  );
  const totalPago = redondear(registros.reduce((s, r) => s + r.valorPago, 0));

  return {
    registros,
    totalRetenido,
    totalRegistros: registros.length,
    totalPago,
  };
}

// ============================================================
// 2276 — Retenciones en la fuente SUFRIDAS (que le practicaron a la empresa)
// Fuentes: FacturasCompra del año con totalRetenciones > 0.
// (En DIAN: cuando un proveedor le factura a la empresa y le aplica
//  retención por ser gran contribuyente o autorretenedor.)
// ============================================================
export async function generarFormato2276(
  empresaId: string,
  anio: number,
): Promise<ResultadoGeneracion> {
  const rango = rangoAnio(anio);
  const compras = await db.facturaCompra.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });

  const registros: RegistroMedio[] = [];
  for (const fc of compras) {
    const retenido = Number(fc.totalRetenciones || 0);
    if (retenido <= 0) continue;
    const tInfo = await infoTercero(fc.terceroId);
    const tipoDoc = tInfo?.tipoDocExpedida ?? "NIT";
    const nit = tInfo?.nitTercero ?? fc.nitProveedor ?? "0";
    const razon = tInfo?.razonSocial ?? fc.nombreProveedor ?? "SIN NOMBRE";
    const ciudad = tInfo?.ciudad ?? null;
    const base = Number(fc.subtotal || fc.total || 0);
    registros.push({
      tipoDocExpedida: tipoDoc,
      nitTercero: nit,
      razonSocial: razon,
      concepto: "RETEFUENTE",
      valorPago: redondear(Number(fc.total)),
      baseRetencion: redondear(base),
      porcentaje: pctSobreBase(retenido, base),
      valorRetenido: redondear(retenido),
      ciudad,
    });
  }

  const totalRetenido = redondear(
    registros.reduce((s, r) => s + r.valorRetenido, 0),
  );
  const totalPago = redondear(registros.reduce((s, r) => s + r.valorPago, 0));

  return {
    registros,
    totalRetenido,
    totalRegistros: registros.length,
    totalPago,
  };
}

// ============================================================
// 2277 — Conceptos de retención de IVA (resumen IVA)
// Generado: FacturasVenta.totalIva > 0 (IVA generado al cliente)
// Descontable: FacturasCompra.totalIva > 0 (IVA descontable en compras)
// ============================================================
export async function generarFormato2277(
  empresaId: string,
  anio: number,
): Promise<ResultadoGeneracion> {
  const rango = rangoAnio(anio);
  const registros: RegistroMedio[] = [];

  // IVA generado (ventas)
  const ventas = await db.facturaVenta.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });
  for (const fv of ventas) {
    if (Number(fv.totalIva || 0) <= 0) continue;
    const tInfo = await infoTercero(fv.terceroId);
    const tipoDoc = tInfo?.tipoDocExpedida ?? "NIT";
    const nit = tInfo?.nitTercero ?? fv.nitCliente ?? "0";
    const razon = tInfo?.razonSocial ?? fv.nombreCliente ?? "SIN NOMBRE";
    const ciudad = tInfo?.ciudad ?? null;
    const base = Number(fv.subtotalNeto || fv.total || 0);
    registros.push({
      tipoDocExpedida: tipoDoc,
      nitTercero: nit,
      razonSocial: razon,
      concepto: "IVA_GENERADO",
      valorPago: redondear(Number(fv.total)),
      baseRetencion: redondear(base),
      porcentaje: pctSobreBase(Number(fv.totalIva), base),
      valorRetenido: redondear(Number(fv.totalIva)),
      ciudad,
    });
  }

  // IVA descontable (compras)
  const compras = await db.facturaCompra.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });
  for (const fc of compras) {
    if (Number(fc.totalIva || 0) <= 0) continue;
    const tInfo = await infoTercero(fc.terceroId);
    const tipoDoc = tInfo?.tipoDocExpedida ?? "NIT";
    const nit = tInfo?.nitTercero ?? fc.nitProveedor ?? "0";
    const razon = tInfo?.razonSocial ?? fc.nombreProveedor ?? "SIN NOMBRE";
    const ciudad = tInfo?.ciudad ?? null;
    const base = Number(fc.subtotal || fc.total || 0);
    registros.push({
      tipoDocExpedida: tipoDoc,
      nitTercero: nit,
      razonSocial: razon,
      concepto: "IVA_DEDUCTIBLE",
      valorPago: redondear(Number(fc.total)),
      baseRetencion: redondear(base),
      porcentaje: pctSobreBase(Number(fc.totalIva), base),
      valorRetenido: redondear(Number(fc.totalIva)),
      ciudad,
    });
  }

  const totalRetenido = redondear(
    registros.reduce((s, r) => s + r.valorRetenido, 0),
  );
  const totalPago = redondear(registros.reduce((s, r) => s + r.valorPago, 0));

  return {
    registros,
    totalRetenido,
    totalRegistros: registros.length,
    totalPago,
  };
}

// ============================================================
// 1647 — Conceptos básicos de INGRESOS BRUTOS
// FacturasVenta del año agrupadas por tercero (totales pagados/no pagados).
// ============================================================
export async function generarFormato1647(
  empresaId: string,
  anio: number,
): Promise<ResultadoGeneracion> {
  const rango = rangoAnio(anio);
  const ventas = await db.facturaVenta.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });

  // Agrupar por NIT
  const porTercero = new Map<
    string,
    { tipoDoc: string; nit: string; razon: string; ciudad?: string | null; total: number; base: number }
  >();
  for (const fv of ventas) {
    const tInfo = await infoTercero(fv.terceroId);
    const tipoDoc = tInfo?.tipoDocExpedida ?? "NIT";
    const nit = tInfo?.nitTercero ?? fv.nitCliente ?? "0";
    const razon = tInfo?.razonSocial ?? fv.nombreCliente ?? "SIN NOMBRE";
    const ciudad = tInfo?.ciudad ?? null;
    const key = `${nit}`;
    const existing = porTercero.get(key);
    if (existing) {
      existing.total += Number(fv.total || 0);
      existing.base += Number(fv.subtotalNeto || fv.total || 0);
    } else {
      porTercero.set(key, {
        tipoDoc,
        nit,
        razon,
        ciudad,
        total: Number(fv.total || 0),
        base: Number(fv.subtotalNeto || fv.total || 0),
      });
    }
  }

  const registros: RegistroMedio[] = [];
  for (const v of porTercero.values()) {
    registros.push({
      tipoDocExpedida: v.tipoDoc,
      nitTercero: v.nit,
      razonSocial: v.razon,
      concepto: "INGRESO",
      valorPago: redondear(v.total),
      baseRetencion: redondear(v.base),
      porcentaje: 0,
      valorRetenido: 0,
      ciudad: v.ciudad,
    });
  }

  const totalRetenido = 0;
  const totalPago = redondear(registros.reduce((s, r) => s + r.valorPago, 0));

  return {
    registros,
    totalRetenido,
    totalRegistros: registros.length,
    totalPago,
  };
}

// ============================================================
// 2238 — Conceptos básicos de EGRESOS PAGADOS
// ComprobantesEgreso + FacturasCompra del año, agrupados por tercero.
// ============================================================
export async function generarFormato2238(
  empresaId: string,
  anio: number,
): Promise<ResultadoGeneracion> {
  const rango = rangoAnio(anio);
  const porTercero = new Map<
    string,
    { tipoDoc: string; nit: string; razon: string; ciudad?: string | null; total: number; base: number }
  >();

  // 1. Comprobantes de Egreso
  const egresos = await db.comprobanteEgreso.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });
  for (const eg of egresos) {
    const tInfo = await infoTercero(eg.terceroId);
    const tipoDoc = tInfo?.tipoDocExpedida ?? "NIT";
    const nit = tInfo?.nitTercero ?? "0";
    const razon = tInfo?.razonSocial ?? eg.nombreTercero ?? "SIN NOMBRE";
    const ciudad = tInfo?.ciudad ?? null;
    const key = `${nit}`;
    const existing = porTercero.get(key);
    if (existing) {
      existing.total += Number(eg.valorTotal || 0);
      existing.base += Number(eg.valorTotal || 0);
    } else {
      porTercero.set(key, {
        tipoDoc,
        nit,
        razon,
        ciudad,
        total: Number(eg.valorTotal || 0),
        base: Number(eg.valorTotal || 0),
      });
    }
  }

  // 2. Facturas de Compra (independientes de egreso)
  const compras = await db.facturaCompra.findMany({
    where: {
      empresaId,
      fecha: { gte: rango.gte, lt: rango.lt },
      estado: "vigente",
    },
  });
  for (const fc of compras) {
    const tInfo = await infoTercero(fc.terceroId);
    const tipoDoc = tInfo?.tipoDocExpedida ?? "NIT";
    const nit = tInfo?.nitTercero ?? fc.nitProveedor ?? "0";
    const razon = tInfo?.razonSocial ?? fc.nombreProveedor ?? "SIN NOMBRE";
    const ciudad = tInfo?.ciudad ?? null;
    const key = `${nit}`;
    const existing = porTercero.get(key);
    if (existing) {
      existing.total += Number(fc.total || 0);
      existing.base += Number(fc.subtotal || fc.total || 0);
    } else {
      porTercero.set(key, {
        tipoDoc,
        nit,
        razon,
        ciudad,
        total: Number(fc.total || 0),
        base: Number(fc.subtotal || fc.total || 0),
      });
    }
  }

  const registros: RegistroMedio[] = [];
  for (const v of porTercero.values()) {
    registros.push({
      tipoDocExpedida: v.tipoDoc,
      nitTercero: v.nit,
      razonSocial: v.razon,
      concepto: "EGRESO",
      valorPago: redondear(v.total),
      baseRetencion: redondear(v.base),
      porcentaje: 0,
      valorRetenido: 0,
      ciudad: v.ciudad,
    });
  }

  const totalRetenido = 0;
  const totalPago = redondear(registros.reduce((s, r) => s + r.valorPago, 0));

  return {
    registros,
    totalRetenido,
    totalRegistros: registros.length,
    totalPago,
  };
}

// ============================================================
// Dispatcher
// ============================================================
export async function generarMedioMagnetico(
  empresaId: string,
  anio: number,
  formato: CodigoFormatoDIAN,
): Promise<ResultadoGeneracion> {
  switch (formato) {
    case "1007":
      return generarFormato1007(empresaId, anio);
    case "2276":
      return generarFormato2276(empresaId, anio);
    case "2277":
      return generarFormato2277(empresaId, anio);
    case "1647":
      return generarFormato1647(empresaId, anio);
    case "2238":
      return generarFormato2238(empresaId, anio);
    default:
      throw new Error(`Formato DIAN no soportado: ${formato}`);
  }
}

// ============================================================
// generarArchivoTXT — Formato DIAN (separador `|`)
// Estructura:
//   Línea 1 (header)  : nit|anio|formato|razonSocial|fechaGeneracion
//   Líneas 2..N+1     : tipoDocExpedida|nit|razonSocial|concepto|valorPago|base|porcentaje|valorRetenido|ciudad
//   Última línea      : T|totalRegistros|totalPago|totalRetenido
// ============================================================
export function generarArchivoTXT(
  medio: {
    formato: string;
    anio: number;
    empresaId: string;
    fechaGeneracion?: Date | null;
  },
  registros: RegistroMedio[],
  empresaInfo?: { nit: string; razonSocial: string } | null,
): string {
  const nit = empresaInfo?.nit ?? "0";
  const razon = empresaInfo?.razonSocial ?? "EMPRESA";
  const fechaGen = (medio.fechaGeneracion ?? new Date())
    .toISOString()
    .slice(0, 10);

  const lineas: string[] = [];
  // Header
  lineas.push(
    [
      "H",
      nit,
      medio.anio,
      medio.formato,
      razon,
      fechaGen,
    ].join("|"),
  );
  // Detalles
  for (const r of registros) {
    lineas.push(
      [
        "D",
        r.tipoDocExpedida || "NIT",
        r.nitTercero,
        r.razonSocial,
        r.concepto,
        r.valorPago.toFixed(2),
        r.baseRetencion.toFixed(2),
        r.porcentaje.toFixed(2),
        r.valorRetenido.toFixed(2),
        r.ciudad ?? "",
      ].join("|"),
    );
  }
  // Totales
  const totalRegistros = registros.length;
  const totalPago = registros.reduce((s, r) => s + r.valorPago, 0);
  const totalRetenido = registros.reduce((s, r) => s + r.valorRetenido, 0);
  lineas.push(
    [
      "T",
      totalRegistros.toString(),
      totalPago.toFixed(2),
      totalRetenido.toFixed(2),
    ].join("|"),
  );
  return lineas.join("\r\n") + "\r\n";
}

// ============================================================
// generarArchivoXLSX — Excel amigable para el contador.
// Devuelve un Buffer listo para enviar como response.
// Import dinámico de exceljs para no tocar el bundle client.
// ============================================================
export async function generarArchivoXLSX(
  medio: {
    formato: string;
    anio: number;
    nombre: string;
    fechaGeneracion?: Date | null;
    totalRegistros: number;
  },
  registros: RegistroMedio[],
  empresaInfo?: { nit: string; razonSocial: string } | null,
): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Marsella ERP";
  wb.created = medio.fechaGeneracion ?? new Date();

  const ws = wb.addWorksheet("Medio Magnético", {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  // ----- Encabezado informativo -----
  ws.columns = [
    { header: "Tipo Doc", key: "tipoDoc", width: 10 },
    { header: "NIT / Cédula", key: "nit", width: 18 },
    { header: "Razón Social", key: "razon", width: 38 },
    { header: "Concepto", key: "concepto", width: 18 },
    { header: "Valor Pago", key: "valorPago", width: 18 },
    { header: "Base Retención", key: "base", width: 18 },
    { header: "%", key: "pct", width: 8 },
    { header: "Valor Retenido", key: "valorRetenido", width: 18 },
    { header: "Ciudad", key: "ciudad", width: 16 },
  ];

  // Título y metadata
  ws.mergeCells("A1:I1");
  const t1 = ws.getCell("A1");
  t1.value = `Marsella ERP — Medios Magnéticos DIAN`;
  t1.font = { bold: true, size: 14, color: { argb: "FF0F766E" } };
  t1.alignment = { horizontal: "center" };

  ws.mergeCells("A2:I2");
  const t2 = ws.getCell("A2");
  t2.value = `Formato ${medio.formato} — ${NOMBRES_FORMATO[medio.formato as CodigoFormatoDIAN] ?? medio.formato}`;
  t2.font = { bold: true, size: 12 };
  t2.alignment = { horizontal: "center" };

  ws.getCell("A3").value = "Empresa:";
  ws.getCell("B3").value = empresaInfo?.razonSocial ?? "—";
  ws.getCell("E3").value = "NIT:";
  ws.getCell("F3").value = empresaInfo?.nit ?? "—";

  ws.getCell("A4").value = "Año gravable:";
  ws.getCell("B4").value = medio.anio;
  ws.getCell("E4").value = "Fecha generación:";
  ws.getCell("F4").value = (medio.fechaGeneracion ?? new Date())
    .toISOString()
    .slice(0, 10);

  ws.getCell("A5").value = "Total registros:";
  ws.getCell("B5").value = medio.totalRegistros;

  // Aplicar negrita a la metadata
  for (const row of [3, 4, 5]) {
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`E${row}`).font = { bold: true };
  }

  // Header de columnas (fila 7, después de un espacio)
  const headerRow = ws.getRow(7);
  headerRow.values = [
    "Tipo Doc",
    "NIT / Cédula",
    "Razón Social",
    "Concepto",
    "Valor Pago",
    "Base Retención",
    "%",
    "Valor Retenido",
    "Ciudad",
  ];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" },
  };
  headerRow.alignment = { horizontal: "center" };
  headerRow.height = 22;

  // Filas de datos
  let rowIdx = 8;
  for (const r of registros) {
    const row = ws.getRow(rowIdx);
    row.values = [
      r.tipoDocExpedida || "NIT",
      r.nitTercero,
      r.razonSocial,
      r.concepto,
      r.valorPago,
      r.baseRetencion,
      r.porcentaje,
      r.valorRetenido,
      r.ciudad ?? "",
    ];
    row.getCell(5).numFmt = "#,##0.00";
    row.getCell(6).numFmt = "#,##0.00";
    row.getCell(7).numFmt = "0.00";
    row.getCell(8).numFmt = "#,##0.00";
    rowIdx++;
  }

  // Totales
  const totalRow = ws.getRow(rowIdx);
  totalRow.values = [
    "",
    "",
    "TOTALES",
    "",
    registros.reduce((s, r) => s + r.valorPago, 0),
    registros.reduce((s, r) => s + r.baseRetencion, 0),
    "",
    registros.reduce((s, r) => s + r.valorRetenido, 0),
    "",
  ];
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFCCFBF1" },
  };
  totalRow.getCell(5).numFmt = "#,##0.00";
  totalRow.getCell(6).numFmt = "#,##0.00";
  totalRow.getCell(8).numFmt = "#,##0.00";

  // Bordes en todo el rango
  const totalRows = rowIdx;
  for (let i = 7; i <= totalRows; i++) {
    const row = ws.getRow(i);
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
