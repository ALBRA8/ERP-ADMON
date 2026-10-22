// ============================================================
// pdf.ts — Librería de generación de reportes PDF para el ERP Marsella
// Reemplaza a Crystal Reports (Hermes §10.4).
//
// Usa @react-pdf/renderer (solo en servidor). Cada generador
// devuelve un Buffer listo para enviar como Response con
// Content-Type: application/pdf.
// ============================================================
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { round } from "@/lib/currency";

// ---------- Helpers de formato ----------

const fmtCOP = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
};

const fmtNumber = (n: number, decimals = 2): string => {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
};

const fmtFecha = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const fmtFechaHora = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

// ---------- Tipos de datos ----------

interface EmpresaInfo {
  razonSocial: string;
  nit: string;
  nombreComercial?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  ciudad?: string | null;
  email?: string | null;
  representanteLegal?: string | null;
  regimenTributario?: string | null;
  responsabilidad?: string | null;
  moneda?: string | null;
}

async function cargarEmpresa(empresaId: string): Promise<EmpresaInfo | null> {
  const e = await db.empresa.findUnique({ where: { id: empresaId } });
  if (!e) return null;
  return e;
}

// ---------- Estilos ----------

const COLORS = {
  primary: "#047857", // emerald-700
  primaryDark: "#065f46",
  primaryLight: "#d1fae5",
  accent: "#0d9488", // teal-600
  bg: "#f8fafc",
  border: "#cbd5e1",
  textMuted: "#475569",
  textDark: "#0f172a",
  warning: "#d97706",
  danger: "#b91c1c",
};

const styles = StyleSheet.create({
  page: {
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.textDark,
    backgroundColor: "#ffffff",
    paddingTop: 20,
    paddingBottom: 60, // espacio para footer fijo
    paddingHorizontal: 32,
  },
  // ----- Header -----
  headerWrap: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 8,
    marginBottom: 12,
  },
  logoBox: {
    width: 70,
    height: 70,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 1.1,
  },
  empresaBlock: { flex: 1, flexDirection: "column" },
  razonSocial: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  empresaMeta: {
    fontSize: 8,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  emissionBlock: { flexDirection: "column", alignItems: "flex-end" },
  emissionLabel: {
    fontSize: 7,
    color: COLORS.textMuted,
    textTransform: "uppercase",
  },
  emissionValue: { fontSize: 9, fontWeight: "bold" },
  // ----- Título -----
  titulo: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
    textAlign: "center",
    marginVertical: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subtitulo: {
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 10,
  },
  // ----- Tablas -----
  table: { flexDirection: "column", width: "auto", marginTop: 4 },
  tableRow: { flexDirection: "row" },
  tableColHeader: {
    backgroundColor: COLORS.primary,
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 8,
    padding: 4,
    borderRightWidth: 0.5,
    borderRightColor: "#ffffff",
  },
  tableCol: {
    padding: 4,
    fontSize: 8,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.border,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tableRowAlt: { backgroundColor: "#f1f5f9" },
  // ----- Footer -----
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 4,
    fontSize: 7,
    color: COLORS.textMuted,
  },
  // ----- Secciones -----
  section: { marginTop: 8, marginBottom: 6 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingBottom: 2,
  },
  boxRow: { flexDirection: "row", marginBottom: 6 },
  boxCol: {
    flex: 1,
    padding: 6,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 3,
    marginHorizontal: 2,
  },
  boxLabel: { fontSize: 7, color: COLORS.textMuted, textTransform: "uppercase" },
  boxValue: { fontSize: 9, fontWeight: "bold" },
  kpiBox: {
    flex: 1,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 4,
    padding: 8,
    marginHorizontal: 2,
    marginBottom: 4,
  },
  kpiLabel: { fontSize: 7, color: COLORS.primaryDark, textTransform: "uppercase" },
  kpiValue: { fontSize: 13, fontWeight: "bold", color: COLORS.primary },
  totalsTable: { marginTop: 6, marginLeft: "auto", width: "50%" },
  totalsRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 0.25,
    borderBottomColor: COLORS.border,
  },
  totalsRowBold: {
    flexDirection: "row",
    paddingVertical: 4,
    backgroundColor: COLORS.primaryLight,
    borderTopWidth: 1,
    borderTopColor: COLORS.primary,
  },
  totalsLabel: { flex: 1, fontSize: 9, paddingHorizontal: 6 },
  totalsValue: {
    flex: 1,
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
    paddingHorizontal: 6,
  },
  qrPlaceholder: {
    width: 90,
    height: 90,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    padding: 4,
  },
  qrText: { fontSize: 6, color: COLORS.textMuted, textAlign: "center" },
  cufeBox: {
    marginTop: 8,
    padding: 6,
    backgroundColor: "#ecfdf5",
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    borderRadius: 2,
  },
  cufeLabel: { fontSize: 7, color: COLORS.primaryDark, textTransform: "uppercase" },
  cufeValue: {
    fontSize: 8,
    fontFamily: "Courier-Bold",
    color: COLORS.textDark,
    marginTop: 2,
  },
  stampBox: {
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 4,
    alignItems: "center",
  },
  stampText: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.danger,
    textTransform: "uppercase",
  },
  notaText: { fontSize: 7, color: COLORS.textMuted, marginTop: 4, fontStyle: "italic" },
  badgeBox: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    fontSize: 7,
    fontWeight: "bold",
    color: "#ffffff",
  },
});

// ---------- Componentes comunes ----------

function Header({
  empresa,
  titulo,
  subtitulo,
  numero,
}: {
  empresa: EmpresaInfo;
  titulo: string;
  subtitulo?: string;
  numero?: string;
}) {
  const now = new Date();
  return (
    <View>
      <View style={styles.headerWrap}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>MARSELLA{"\n"}ERP</Text>
        </View>
        <View style={styles.empresaBlock}>
          <Text style={styles.razonSocial}>{empresa.razonSocial}</Text>
          <Text style={styles.empresaMeta}>NIT: {empresa.nit}</Text>
          {empresa.direccion && (
            <Text style={styles.empresaMeta}>{empresa.direccion}</Text>
          )}
          {(empresa.ciudad || empresa.telefono) && (
            <Text style={styles.empresaMeta}>
              {[empresa.ciudad, empresa.telefono].filter(Boolean).join(" · ")}
            </Text>
          )}
          {empresa.email && (
            <Text style={styles.empresaMeta}>{empresa.email}</Text>
          )}
          {empresa.representanteLegal && (
            <Text style={styles.empresaMeta}>
              Representante legal: {empresa.representanteLegal}
            </Text>
          )}
        </View>
        <View style={styles.emissionBlock}>
          <Text style={styles.emissionLabel}>Fecha emisión</Text>
          <Text style={styles.emissionValue}>{fmtFecha(now)}</Text>
          {numero && (
            <>
              <Text style={[styles.emissionLabel, { marginTop: 4 }]}>No.</Text>
              <Text style={styles.emissionValue}>{numero}</Text>
            </>
          )}
          <Text style={[styles.emissionLabel, { marginTop: 4 }]}>Página</Text>
          <Text
            style={styles.emissionValue}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </View>
      <Text style={styles.titulo}>{titulo}</Text>
      {subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>
        Generado por Marsella ERP · {fmtFechaHora(new Date())}
      </Text>
      <Text>
        Página{" "}
        <Text
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </Text>
    </View>
  );
}

interface Col {
  label: string;
  width: string;
  align?: "left" | "right" | "center";
  render: (row: any, i: number) => string;
}

function TablePDF({ columns, rows }: { columns: Col[]; rows: any[] }) {
  if (rows.length === 0) {
    return (
      <View style={[styles.table, { padding: 8 }]}>
        <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
          Sin movimientos para mostrar.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        {columns.map((c, i) => (
          <Text
            key={i}
            style={[
              styles.tableColHeader,
              { width: c.width, textAlign: c.align ?? "left" },
            ]}
          >
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={ri}
          style={[styles.tableRow, ri % 2 === 1 ? styles.tableRowAlt : {}]}
        >
          {columns.map((c, ci) => (
            <Text
              key={ci}
              style={[
                styles.tableCol,
                { width: c.width, textAlign: c.align ?? "left" },
              ]}
            >
              {c.render(row, ri)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function TotalRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={bold ? styles.totalsRowBold : styles.totalsRow}>
      <Text style={styles.totalsLabel}>{label}</Text>
      <Text style={styles.totalsValue}>{value}</Text>
    </View>
  );
}

// ============================================================
// 1. FACTURA DE VENTA ELECTRÓNICA
// ============================================================

interface FacturaPDF {
  id: string;
  numero: string;
  nombreCliente: string;
  nitCliente: string;
  fecha: Date | string;
  fechaVencimiento?: Date | string | null;
  subtotalBruto: number;
  descuentoTotal: number;
  subtotalNeto: number;
  totalIva: number;
  totalImpoconsumo: number;
  total: number;
  cufe?: string | null;
  qrCode?: string | null;
  estadoDIAN?: string | null;
  formaPago?: string | null;
  saldoPendiente?: number;
  estado?: string | null;
  observaciones?: string | null;
  detalles?: any[];
  tercero?: any | null;
}

export async function generarPDFFactura(
  factura: FacturaPDF,
  empresa: EmpresaInfo,
): Promise<Buffer> {
  const detalles =
    factura.detalles ??
    (await db.detalleFacturaVenta.findMany({
      where: { facturaId: factura.id },
      orderBy: { id: "asc" },
    }));

  const doc = (
    <Document
      title={`Factura ${factura.numero}`}
      author={empresa.razonSocial}
    >
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Factura de Venta Electrónica"}
          subtitulo={`Documento equivalente electrónico · NIT ${empresa.nit}`}
          numero={factura.numero}
        />

        {/* Cliente + datos factura */}
        <View style={styles.boxRow}>
          <View style={[styles.boxCol, { flex: 2 }]}>
            <Text style={styles.boxLabel}>Cliente</Text>
            <Text style={styles.boxValue}>{factura.nombreCliente}</Text>
            <Text style={[styles.boxValue, { fontWeight: "normal" }]}>
              NIT/CC: {factura.nitCliente}
            </Text>
            {factura.tercero?.direccion && (
              <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
                {factura.tercero.direccion}
              </Text>
            )}
            {factura.tercero?.telefono && (
              <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
                Tel: {factura.tercero.telefono}
              </Text>
            )}
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Fecha emisión</Text>
            <Text style={styles.boxValue}>{fmtFecha(factura.fecha)}</Text>
            <Text style={[styles.boxLabel, { marginTop: 4 }]}>Vence</Text>
            <Text style={styles.boxValue}>
              {fmtFecha(factura.fechaVencimiento)}
            </Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Forma de pago</Text>
            <Text style={styles.boxValue}>{factura.formaPago ?? "—"}</Text>
            <Text style={[styles.boxLabel, { marginTop: 4 }]}>Estado DIAN</Text>
            <Text style={[styles.badgeBox, { alignSelf: "flex-start", marginTop: 2, backgroundColor: factura.estadoDIAN === "aceptado" ? COLORS.primary : COLORS.warning }]}>
              {(factura.estadoDIAN ?? "—").toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle de items</Text>
          <TablePDF
            columns={[
              {
                label: "#",
                width: "5%",
                align: "center",
                render: (_r, i) => String(i + 1),
              },
              {
                label: "Descripción",
                width: "45%",
                render: (r) => r.descripcion,
              },
              {
                label: "Cant.",
                width: "8%",
                align: "right",
                render: (r) => fmtNumber(r.cantidad, 2),
              },
              {
                label: "Vr. Unit.",
                width: "14%",
                align: "right",
                render: (r) => fmtCOP(r.precioUnitario),
              },
              {
                label: "% Dto",
                width: "6%",
                align: "right",
                render: (r) =>
                  r.descuentoPorcentaje > 0
                    ? `${r.descuentoPorcentaje}%`
                    : "—",
              },
              {
                label: "% IVA",
                width: "6%",
                align: "right",
                render: (r) => `${r.tarifaIva}%`,
              },
              {
                label: "Total",
                width: "16%",
                align: "right",
                render: (r) => fmtCOP(r.total),
              },
            ]}
            rows={detalles}
          />
        </View>

        {/* Totales */}
        <View style={styles.totalsTable}>
          <TotalRow label="Subtotal bruto" value={fmtCOP(factura.subtotalBruto)} />
          {factura.descuentoTotal > 0 && (
            <TotalRow
              label="Descuento"
              value={`- ${fmtCOP(factura.descuentoTotal)}`}
            />
          )}
          <TotalRow label="Subtotal neto" value={fmtCOP(factura.subtotalNeto)} />
          <TotalRow label="IVA" value={fmtCOP(factura.totalIva)} />
          {factura.totalImpoconsumo > 0 && (
            <TotalRow
              label="Impoconsumo"
              value={fmtCOP(factura.totalImpoconsumo)}
            />
          )}
          <TotalRow label="TOTAL A PAGAR" value={fmtCOP(factura.total)} bold />
          {(factura.saldoPendiente ?? 0) > 0 && (
            <TotalRow
              label="Saldo pendiente"
              value={fmtCOP(factura.saldoPendiente ?? 0)}
            />
          )}
        </View>

        {/* CUFE + QR */}
        <View style={styles.boxRow}>
          <View style={[styles.boxCol, { flex: 3 }]}>
            <Text style={styles.boxLabel}>CUFE — Código Único de Factura Electrónica</Text>
            <Text style={styles.cufeValue}>
              {factura.cufe ?? "Sin generar"}
            </Text>
            {factura.qrCode && (
              <Text style={[styles.notaText, { marginTop: 4 }]}>
                QR DIAN: {factura.qrCode}
              </Text>
            )}
          </View>
          <View style={styles.qrPlaceholder}>
            <Text style={styles.qrText}>
              [QR DIAN]{"\n"}
              {factura.cufe ? factura.cufe.slice(0, 16) + "..." : "—"}
            </Text>
          </View>
        </View>

        {/* Observaciones */}
        {factura.observaciones && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sectionTitle}>Observaciones</Text>
            <Text style={{ fontSize: 8 }}>{factura.observaciones}</Text>
          </View>
        )}

        <View style={styles.stampBox}>
          <Text style={styles.stampText}>
            {factura.estado === "anulada" ? "FACTURA ANULADA" : "DOCUMENTO EQUIVALENTE ELECTRÓNICO"}
          </Text>
          <Text style={styles.notaText}>
            Este documento es una representación gráfica de la factura electrónica.
            Validez fiscal según Resolución DIAN vigente.
          </Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}

// ============================================================
// 2. RECIBO DE CAJA (Comprobante de Ingreso)
// ============================================================

export async function generarPDFReciboCaja(
  recibo: any,
  empresa: EmpresaInfo,
): Promise<Buffer> {
  const doc = (
    <Document title={`Recibo ${recibo.numero}`} author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Recibo de Caja"}
          subtitulo={"Comprobante de Ingreso · CXC"}
          numero={recibo.numero}
        />
        <View style={styles.boxRow}>
          <View style={[styles.boxCol, { flex: 2 }]}>
            <Text style={styles.boxLabel}>Recibido de</Text>
            <Text style={styles.boxValue}>{recibo.nombreTercero}</Text>
            {recibo.tercero?.numeroDocumento && (
              <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
                Doc: {recibo.tercero.numeroDocumento}
              </Text>
            )}
            {recibo.tercero?.direccion && (
              <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
                {recibo.tercero.direccion}
              </Text>
            )}
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Fecha</Text>
            <Text style={styles.boxValue}>{fmtFecha(recibo.fecha)}</Text>
            <Text style={[styles.boxLabel, { marginTop: 4 }]}>Forma de pago</Text>
            <Text style={styles.boxValue}>{recibo.formaPago}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle del ingreso</Text>
          <View style={[styles.boxCol, { marginHorizontal: 0 }]}>
            <Text style={styles.boxLabel}>Concepto</Text>
            <Text style={{ fontSize: 9, marginTop: 2 }}>
              {recibo.concepto || "—"}
            </Text>
            {recibo.observaciones && (
              <>
                <Text style={[styles.boxLabel, { marginTop: 4 }]}>
                  Observaciones
                </Text>
                <Text style={{ fontSize: 8, marginTop: 2 }}>
                  {recibo.observaciones}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={[styles.totalsTable, { width: "60%", marginTop: 16 }]}>
          <TotalRow
            label="Valor recibido"
            value={fmtCOP(recibo.valorTotal)}
            bold
          />
        </View>

        <View style={[styles.boxRow, { marginTop: 32 }]}>
          <View style={[styles.boxCol, { flex: 1 }]}>
            <Text style={styles.boxLabel}>Firma recibido</Text>
            <View
              style={{
                marginTop: 32,
                borderTopWidth: 0.5,
                borderTopColor: COLORS.border,
                paddingTop: 2,
              }}
            >
              <Text style={{ fontSize: 7 }}>{empresa.razonSocial}</Text>
            </View>
          </View>
          <View style={[styles.boxCol, { flex: 1 }]}>
            <Text style={styles.boxLabel}>Firma pagador</Text>
            <View
              style={{
                marginTop: 32,
                borderTopWidth: 0.5,
                borderTopColor: COLORS.border,
                paddingTop: 2,
              }}
            >
              <Text style={{ fontSize: 7 }}>{recibo.nombreTercero}</Text>
            </View>
          </View>
        </View>

        <View style={styles.stampBox}>
          <Text style={styles.stampText}>RECIBO DE CAJA · {recibo.numero}</Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 3. COMPROBANTE DE EGRESO
// ============================================================

export async function generarPDFComprobanteEgreso(
  egreso: any,
  empresa: EmpresaInfo,
): Promise<Buffer> {
  const doc = (
    <Document title={`Egreso ${egreso.numero}`} author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Comprobante de Egreso"}
          subtitulo={"Pago · CXP"}
          numero={egreso.numero}
        />
        <View style={styles.boxRow}>
          <View style={[styles.boxCol, { flex: 2 }]}>
            <Text style={styles.boxLabel}>Pagado a</Text>
            <Text style={styles.boxValue}>{egreso.nombreTercero}</Text>
            {egreso.tercero?.numeroDocumento && (
              <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
                Doc: {egreso.tercero.numeroDocumento}
              </Text>
            )}
            {egreso.tercero?.direccion && (
              <Text style={{ fontSize: 8, color: COLORS.textMuted }}>
                {egreso.tercero.direccion}
              </Text>
            )}
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Fecha</Text>
            <Text style={styles.boxValue}>{fmtFecha(egreso.fecha)}</Text>
            <Text style={[styles.boxLabel, { marginTop: 4 }]}>Forma de pago</Text>
            <Text style={styles.boxValue}>{egreso.formaPago}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle del egreso</Text>
          <View style={[styles.boxCol, { marginHorizontal: 0 }]}>
            <Text style={styles.boxLabel}>Concepto</Text>
            <Text style={{ fontSize: 9, marginTop: 2 }}>
              {egreso.concepto || "—"}
            </Text>
            {egreso.observaciones && (
              <>
                <Text style={[styles.boxLabel, { marginTop: 4 }]}>
                  Observaciones
                </Text>
                <Text style={{ fontSize: 8, marginTop: 2 }}>
                  {egreso.observaciones}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={[styles.totalsTable, { width: "60%", marginTop: 16 }]}>
          <TotalRow label="Valor pagado" value={fmtCOP(egreso.valorTotal)} bold />
        </View>

        <View style={[styles.boxRow, { marginTop: 32 }]}>
          <View style={[styles.boxCol, { flex: 1 }]}>
            <Text style={styles.boxLabel}>Elaborado por</Text>
            <View
              style={{
                marginTop: 32,
                borderTopWidth: 0.5,
                borderTopColor: COLORS.border,
                paddingTop: 2,
              }}
            >
              <Text style={{ fontSize: 7 }}>{empresa.razonSocial}</Text>
            </View>
          </View>
          <View style={[styles.boxCol, { flex: 1 }]}>
            <Text style={styles.boxLabel}>Firma beneficiario</Text>
            <View
              style={{
                marginTop: 32,
                borderTopWidth: 0.5,
                borderTopColor: COLORS.border,
                paddingTop: 2,
              }}
            >
              <Text style={{ fontSize: 7 }}>{egreso.nombreTercero}</Text>
            </View>
          </View>
        </View>

        <View style={styles.stampBox}>
          <Text style={styles.stampText}>COMPROBANTE DE EGRESO · {egreso.numero}</Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 4. BALANCE DE PRUEBA
// ============================================================

export async function generarPDFBalancePrueba(
  empresaId: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");

  const cuentas = await db.cuentaPuc.findMany({
    where: { empresaId },
    orderBy: { codigo: "asc" },
  });
  const movs = await db.movimientoContable.findMany({
    where: {
      empresaId,
      comprobante: { estado: "contabilizado" },
    },
    select: { cuentaId: true, debito: true, credito: true },
  });
  const sumas: Record<string, { debito: number; credito: number }> = {};
  for (const m of movs) {
    const cur = sumas[m.cuentaId] ?? { debito: 0, credito: 0 };
    cur.debito += Number(m.debito);
    cur.credito += Number(m.credito);
    sumas[m.cuentaId] = cur;
  }
  const rows = cuentas.map((c) => {
    const s = sumas[c.id] ?? { debito: 0, credito: 0 };
    const saldo = round(
      c.naturaleza === "debito" ? s.debito - s.credito : s.credito - s.debito,
      2,
    );
    return {
      ...c,
      debito: round(s.debito, 2),
      credito: round(s.credito, 2),
      saldo,
    };
  });
  const filtradas = rows.filter(
    (r) => r.debito !== 0 || r.credito !== 0 || r.nivel <= 2,
  );
  const totalDebito = round(
    filtradas.reduce((a, b) => a + b.debito, 0),
    2,
  );
  const totalCredito = round(
    filtradas.reduce((a, b) => a + b.credito, 0),
    2,
  );
  const diferencia = round(totalDebito - totalCredito, 2);

  const doc = (
    <Document title="Balance de Prueba" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Balance de Prueba"}
          subtitulo={`Corte a ${fmtFecha(new Date())} · ${filtradas.length} cuentas`}
        />
        <View style={styles.section}>
          <TablePDF
            columns={[
              {
                label: "Código",
                width: "12%",
                render: (r) => r.codigo,
              },
              {
                label: "Nombre",
                width: "42%",
                render: (r) =>
                  `${"  ".repeat(Math.max(0, (r.nivel ?? 1) - 1))}${r.nombre}`,
              },
              {
                label: "Naturaleza",
                width: "11%",
                align: "center",
                render: (r) => r.naturaleza,
              },
              {
                label: "Débitos",
                width: "12%",
                align: "right",
                render: (r) => fmtNumber(r.debito, 2),
              },
              {
                label: "Créditos",
                width: "12%",
                align: "right",
                render: (r) => fmtNumber(r.credito, 2),
              },
              {
                label: "Saldo",
                width: "11%",
                align: "right",
                render: (r) => fmtNumber(r.saldo, 2),
              },
            ]}
            rows={filtradas}
          />
        </View>
        <View style={[styles.totalsTable, { width: "100%", marginTop: 12 }]}>
          <TotalRow
            label="Total débitos"
            value={fmtNumber(totalDebito, 2)}
            bold
          />
          <TotalRow
            label="Total créditos"
            value={fmtNumber(totalCredito, 2)}
            bold
          />
          <TotalRow
            label="Diferencia"
            value={fmtNumber(diferencia, 2)}
            bold
          />
        </View>
        {Math.abs(diferencia) > 1 && (
          <View style={[styles.stampBox, { borderColor: COLORS.danger }]}>
            <Text style={styles.stampText}>BALANCE DESCUADRADO</Text>
          </View>
        )}
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 5. LIBRO DIARIO (comprobantes en rango)
// ============================================================

export async function generarPDFLibroDiario(
  empresaId: string,
  fechaInicio?: Date,
  fechaFin?: Date,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");

  const where: any = { empresaId, estado: "contabilizado" };
  if (fechaInicio || fechaFin) {
    where.fecha = {};
    if (fechaInicio) where.fecha.gte = fechaInicio;
    if (fechaFin) where.fecha.lte = fechaFin;
  }
  const comprobantes = await db.comprobante.findMany({
    where,
    orderBy: { fecha: "asc" },
    include: {
      movimientos: {
        include: { cuenta: true, tercero: true },
        orderBy: { debito: "desc" },
      },
    },
  });

  const rangoLabel =
    fechaInicio || fechaFin
      ? `${fmtFecha(fechaInicio)} → ${fmtFecha(fechaFin)}`
      : "Todos los períodos";

  const totalDebito = round(
    comprobantes.reduce((a, c) => a + c.totalDebito, 0),
    2,
  );
  const totalCredito = round(
    comprobantes.reduce((a, c) => a + c.totalCredito, 0),
    2,
  );

  const doc = (
    <Document title="Libro Diario" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Libro Diario"}
          subtitulo={`${rangoLabel} · ${comprobantes.length} comprobantes`}
        />
        {comprobantes.map((c) => (
          <View key={c.id} style={{ marginBottom: 8 }} wrap={false}>
            <View
              style={{
                flexDirection: "row",
                backgroundColor: COLORS.primary,
                padding: 4,
                borderRadius: 2,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: "bold",
                  flex: 2,
                }}
              >
                {c.numero} · {c.tipo}
              </Text>
              <Text style={{ color: "#fff", fontSize: 8, flex: 2 }}>
                {fmtFecha(c.fecha)}
              </Text>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 8,
                  flex: 4,
                  fontWeight: "bold",
                }}
              >
                {c.descripcion ?? ""}
              </Text>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 8,
                  flex: 2,
                  textAlign: "right",
                }}
              >
                {fmtNumber(c.totalDebito, 2)} / {fmtNumber(c.totalCredito, 2)}
              </Text>
            </View>
            <TablePDF
              columns={[
                {
                  label: "Cuenta",
                  width: "12%",
                  render: (r) => r.cuenta?.codigo ?? "—",
                },
                {
                  label: "Descripción",
                  width: "44%",
                  render: (r) =>
                    r.descripcion ?? r.cuenta?.nombre ?? "",
                },
                {
                  label: "Tercero",
                  width: "20%",
                  render: (r) => r.tercero?.nombre ?? "",
                },
                {
                  label: "Débito",
                  width: "12%",
                  align: "right",
                  render: (r) => (r.debito ? fmtNumber(r.debito, 2) : ""),
                },
                {
                  label: "Crédito",
                  width: "12%",
                  align: "right",
                  render: (r) => (r.credito ? fmtNumber(r.credito, 2) : ""),
                },
              ]}
              rows={c.movimientos}
            />
          </View>
        ))}
        {comprobantes.length === 0 && (
          <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
            No hay comprobantes contabilizados en el rango seleccionado.
          </Text>
        )}
        <View style={[styles.totalsTable, { width: "100%", marginTop: 12 }]}>
          <TotalRow label="Total débitos del período" value={fmtNumber(totalDebito, 2)} bold />
          <TotalRow label="Total créditos del período" value={fmtNumber(totalCredito, 2)} bold />
        </View>
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 6. LIBRO MAYOR (detalle de una cuenta con saldos acumulados)
// ============================================================

export async function generarPDFLibroMayor(
  cuentaId: string,
  empresaId: string,
  fechaInicio?: Date,
  fechaFin?: Date,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");

  const cuenta = await db.cuentaPuc.findFirst({
    where: { id: cuentaId, empresaId },
  });
  if (!cuenta) throw new Error("Cuenta no encontrada");

  const where: any = {
    empresaId,
    cuentaId,
    comprobante: { estado: "contabilizado" },
  };
  if (fechaInicio || fechaFin) {
    where.fecha = {};
    if (fechaInicio) where.fecha.gte = fechaInicio;
    if (fechaFin) where.fecha.lte = fechaFin;
  }
  const movs = await db.movimientoContable.findMany({
    where,
    orderBy: { fecha: "asc" },
    include: { comprobante: true, tercero: true },
  });

  // Saldo anterior (movimientos antes de fechaInicio)
  let saldoAnterior = 0;
  if (fechaInicio) {
    const prev = await db.movimientoContable.aggregate({
      where: {
        empresaId,
        cuentaId,
        fecha: { lt: fechaInicio },
        comprobante: { estado: "contabilizado" },
      },
      _sum: { debito: true, credito: true },
    });
    const deb = Number(prev._sum.debito ?? 0);
    const cre = Number(prev._sum.credito ?? 0);
    saldoAnterior = round(
      cuenta.naturaleza === "debito" ? deb - cre : cre - deb,
      2,
    );
  }

  let saldo = saldoAnterior;
  const rows = movs.map((m) => {
    saldo = round(saldo + Number(m.debito) - Number(m.credito), 2);
    return { ...m, saldo };
  });

  const totalDebito = round(movs.reduce((a, m) => a + Number(m.debito), 0), 2);
  const totalCredito = round(movs.reduce((a, m) => a + Number(m.credito), 0), 2);

  const doc = (
    <Document title={`Libro Mayor ${cuenta.codigo}`} author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Libro Mayor"}
          subtitulo={`${cuenta.codigo} · ${cuenta.nombre} · Naturaleza: ${cuenta.naturaleza}`}
        />
        <View style={styles.boxRow}>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Cuenta</Text>
            <Text style={styles.boxValue}>{cuenta.codigo}</Text>
            <Text style={{ fontSize: 8 }}>{cuenta.nombre}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Saldo inicial</Text>
            <Text style={styles.boxValue}>{fmtNumber(saldoAnterior, 2)}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Movimientos</Text>
            <Text style={styles.boxValue}>{movs.length}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <TablePDF
            columns={[
              {
                label: "Fecha",
                width: "12%",
                render: (r) => fmtFecha(r.fecha),
              },
              {
                label: "Comprobante",
                width: "18%",
                render: (r) => r.comprobante?.numero ?? "—",
              },
              {
                label: "Descripción",
                width: "30%",
                render: (r) =>
                  r.descripcion ?? r.comprobante?.descripcion ?? "",
              },
              {
                label: "Tercero",
                width: "16%",
                render: (r) => r.tercero?.nombre ?? "",
              },
              {
                label: "Débito",
                width: "12%",
                align: "right",
                render: (r) => (r.debito ? fmtNumber(r.debito, 2) : ""),
              },
              {
                label: "Crédito",
                width: "12%",
                align: "right",
                render: (r) => (r.credito ? fmtNumber(r.credito, 2) : ""),
              },
            ]}
            rows={rows}
          />
        </View>

        <View style={[styles.totalsTable, { width: "100%", marginTop: 12 }]}>
          <TotalRow label="Saldo inicial" value={fmtNumber(saldoAnterior, 2)} />
          <TotalRow label="Total débitos" value={fmtNumber(totalDebito, 2)} />
          <TotalRow label="Total créditos" value={fmtNumber(totalCredito, 2)} />
          <TotalRow label="Saldo final" value={fmtNumber(saldo, 2)} bold />
        </View>
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 7. KARDEX VALORIZADO
// ============================================================

export async function generarPDFKardex(
  productoId: string,
  empresaId: string,
  bodegaId?: string,
  fechaInicio?: Date,
  fechaFin?: Date,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");

  const producto = await db.producto.findFirst({
    where: { id: productoId, empresaId },
  });
  if (!producto) throw new Error("Producto no encontrado");
  const bodega = bodegaId
    ? await db.bodega.findFirst({ where: { id: bodegaId, empresaId } })
    : null;

  // Saldo anterior
  const wherePrev: any = { empresaId, productoId };
  if (bodegaId) wherePrev.bodegaId = bodegaId;
  if (fechaInicio) wherePrev.fecha = { lt: fechaInicio };
  const prevMovs = await db.movimientoInventario.findMany({
    where: wherePrev,
  });
  let salAntCantidad = round(
    prevMovs.reduce((a, m) => a + m.cantidad, 0),
    4,
  );
  let salAntValor = round(
    prevMovs.reduce((a, m) => a + Number(m.costoTotal), 0),
    2,
  );

  const where: any = { empresaId, productoId };
  if (bodegaId) where.bodegaId = bodegaId;
  if (fechaInicio || fechaFin) {
    where.fecha = {};
    if (fechaInicio) where.fecha.gte = fechaInicio;
    if (fechaFin) where.fecha.lte = fechaFin;
  }
  const movs = await db.movimientoInventario.findMany({
    where,
    orderBy: { fecha: "asc" },
    include: { bodega: true },
  });

  let saldoC = salAntCantidad;
  let saldoV = salAntValor;
  const rows = movs.map((m) => {
    saldoC = round(saldoC + m.cantidad, 4);
    saldoV = round(saldoV + Number(m.costoTotal), 2);
    return {
      ...m,
      entradaCantidad: m.cantidad > 0 ? Math.abs(m.cantidad) : 0,
      entradaValor: m.cantidad > 0 ? Math.abs(Number(m.costoTotal)) : 0,
      salidaCantidad: m.cantidad < 0 ? Math.abs(m.cantidad) : 0,
      salidaValor: m.cantidad < 0 ? Math.abs(Number(m.costoTotal)) : 0,
      saldoCantidad: saldoC,
      saldoValor: saldoV,
    };
  });

  const rangoLabel =
    fechaInicio || fechaFin
      ? `${fmtFecha(fechaInicio)} → ${fmtFecha(fechaFin)}`
      : "Histórico completo";

  const doc = (
    <Document title={`Kardex ${producto.codigo}`} author={empresa.razonSocial}>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Kardex Valorizado"}
          subtitulo={`Producto ${producto.codigo} · ${producto.nombre} · ${rangoLabel}`}
        />
        <View style={styles.boxRow}>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Producto</Text>
            <Text style={styles.boxValue}>{producto.codigo}</Text>
            <Text style={{ fontSize: 8 }}>{producto.nombre}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Bodega</Text>
            <Text style={styles.boxValue}>
              {bodega ? bodega.nombre : "Todas"}
            </Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Saldo anterior</Text>
            <Text style={styles.boxValue}>
              {fmtNumber(salAntCantidad, 2)} ({fmtCOP(salAntValor)})
            </Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Costo promedio</Text>
            <Text style={styles.boxValue}>{fmtCOP(producto.costoPromedio)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <TablePDF
            columns={[
              {
                label: "Fecha",
                width: "10%",
                render: (r) => fmtFecha(r.fecha),
              },
              {
                label: "Tipo",
                width: "9%",
                render: (r) => (r.tipo ?? "").toUpperCase(),
              },
              {
                label: "Bodega",
                width: "12%",
                render: (r) => r.bodega?.nombre ?? "—",
              },
              {
                label: "Doc.",
                width: "11%",
                render: (r) => r.documentoTipo ?? "",
              },
              {
                label: "Ent. Cant.",
                width: "9%",
                align: "right",
                render: (r) =>
                  r.entradaCantidad ? fmtNumber(r.entradaCantidad, 2) : "",
              },
              {
                label: "Ent. Valor",
                width: "11%",
                align: "right",
                render: (r) =>
                  r.entradaValor ? fmtCOP(r.entradaValor) : "",
              },
              {
                label: "Sal. Cant.",
                width: "9%",
                align: "right",
                render: (r) =>
                  r.salidaCantidad ? fmtNumber(r.salidaCantidad, 2) : "",
              },
              {
                label: "Sal. Valor",
                width: "11%",
                align: "right",
                render: (r) =>
                  r.salidaValor ? fmtCOP(r.salidaValor) : "",
              },
              {
                label: "Saldo Cant.",
                width: "9%",
                align: "right",
                render: (r) => fmtNumber(r.saldoCantidad, 2),
              },
              {
                label: "Saldo Valor",
                width: "9%",
                align: "right",
                render: (r) => fmtCOP(r.saldoValor),
              },
            ]}
            rows={rows}
          />
        </View>

        <View style={[styles.totalsTable, { width: "100%", marginTop: 12 }]}>
          <TotalRow
            label="Saldo final"
            value={`${fmtNumber(saldoC, 2)} (${fmtCOP(saldoV)})`}
            bold
          />
        </View>
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 8. NÓMINA
// ============================================================

export async function generarPDFNomina(
  nominaId: string,
  empresaId: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");

  const nomina = await db.nomina.findFirst({
    where: { id: nominaId, empresaId },
    include: {
      detalles: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!nomina) throw new Error("Nómina no encontrada");

  const terceroIds = nomina.detalles.map((d) => d.terceroId);
  const terceros = await db.tercero.findMany({
    where: { id: { in: terceroIds } },
  });
  const tMap = new Map(terceros.map((t) => [t.id, t]));

  const parseJSON = (s: string | null | undefined): any[] => {
    if (!s) return [];
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  const detallesCompletos = nomina.detalles.map((d) => {
    const t = tMap.get(d.terceroId);
    return {
      ...d,
      tercero: t,
      devengos: parseJSON(d.devengos),
      deducciones: parseJSON(d.deducciones),
      aportes: parseJSON(d.aportesPatronales),
      provisiones: parseJSON(d.provisiones),
    };
  });

  const doc = (
    <Document title={`Nómina ${nomina.numero}`} author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Comprobante de Nómina"}
          subtitulo={`${nomina.numero} · ${nomina.tipo} · Período ${fmtFecha(nomina.periodoInicio)} → ${fmtFecha(nomina.periodoFin)}`}
          numero={nomina.numero}
        />
        <View style={styles.boxRow}>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Tipo</Text>
            <Text style={styles.boxValue}>{nomina.tipo}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Fecha de pago</Text>
            <Text style={styles.boxValue}>{fmtFecha(nomina.fechaPago)}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Empleados</Text>
            <Text style={styles.boxValue}>{detallesCompletos.length}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Estado</Text>
            <Text
              style={[
                styles.badgeBox,
                {
                  backgroundColor:
                    nomina.estado === "pagada"
                      ? COLORS.primary
                      : nomina.estado === "anulada"
                        ? COLORS.danger
                        : COLORS.warning,
                },
              ]}
            >
              {(nomina.estado ?? "—").toUpperCase()}
            </Text>
          </View>
        </View>

        {detallesCompletos.map((d) => {
          const nombreCompleto = d.tercero?.nombre ?? "—";
          const docEmp = d.tercero?.numeroDocumento ?? "—";
          const cargo = d.tercero?.cargo ?? "—";
          return (
            <View
              key={d.id}
              style={{ marginBottom: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6 }}
              wrap={false}
            >
              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                <Text style={{ flex: 2, fontSize: 9, fontWeight: "bold" }}>
                  {nombreCompleto}
                </Text>
                <Text style={{ flex: 2, fontSize: 8, color: COLORS.textMuted }}>
                  CC: {docEmp} · {cargo}
                </Text>
                <Text style={{ flex: 1, fontSize: 8, color: COLORS.textMuted, textAlign: "right" }}>
                  Días: {fmtNumber(d.diasLaborados, 0)}
                </Text>
              </View>
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: 1, marginRight: 4 }}>
                  <Text style={[styles.sectionTitle, { fontSize: 8, marginBottom: 2 }]}>
                    Devengos
                  </Text>
                  {d.devengos.length === 0 && (
                    <Text style={{ fontSize: 7, color: COLORS.textMuted }}>—</Text>
                  )}
                  {d.devengos.map((c: any, i: number) => (
                    <View key={i} style={{ flexDirection: "row", fontSize: 7 }}>
                      <Text style={{ flex: 3 }}>{c.nombre}</Text>
                      <Text style={{ flex: 2, textAlign: "right" }}>
                        {fmtCOP(c.valor)}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.totalsRow, { marginTop: 2 }]}>
                    <Text style={[styles.totalsLabel, { fontSize: 7 }]}>
                      Total devengado
                    </Text>
                    <Text style={[styles.totalsValue, { fontSize: 7 }]}>
                      {fmtCOP(Number(d.totalDevengado))}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { fontSize: 8, marginBottom: 2 }]}>
                    Deducciones
                  </Text>
                  {d.deducciones.length === 0 && (
                    <Text style={{ fontSize: 7, color: COLORS.textMuted }}>—</Text>
                  )}
                  {d.deducciones.map((c: any, i: number) => (
                    <View key={i} style={{ flexDirection: "row", fontSize: 7 }}>
                      <Text style={{ flex: 3 }}>{c.nombre}</Text>
                      <Text style={{ flex: 2, textAlign: "right" }}>
                        {fmtCOP(c.valor)}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.totalsRow, { marginTop: 2 }]}>
                    <Text style={[styles.totalsLabel, { fontSize: 7 }]}>
                      Total deducciones
                    </Text>
                    <Text style={[styles.totalsValue, { fontSize: 7 }]}>
                      {fmtCOP(Number(d.totalDeducciones))}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[styles.totalsTable, { width: "40%", marginTop: 4 }]}>
                <TotalRow label="Neto a pagar" value={fmtCOP(Number(d.netoAPagar))} bold />
              </View>
              {d.cuneEmpleado && (
                <View style={styles.cufeBox}>
                  <Text style={styles.cufeLabel}>CUNE del empleado</Text>
                  <Text style={styles.cufeValue}>{d.cuneEmpleado}</Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={[styles.totalsTable, { width: "100%", marginTop: 12 }]}>
          <TotalRow label="Total devengos" value={fmtCOP(Number(nomina.totalDevengos))} bold />
          <TotalRow label="Total deducciones" value={fmtCOP(Number(nomina.totalDeducciones))} bold />
          <TotalRow label="Aportes patronales" value={fmtCOP(Number(nomina.totalAportesPatronales))} bold />
          <TotalRow label="Provisiones" value={fmtCOP(Number(nomina.totalProvisiones))} bold />
          <TotalRow label="Neto a pagar" value={fmtCOP(Number(nomina.netoAPagar))} bold />
        </View>

        {nomina.cune && (
          <View style={styles.cufeBox}>
            <Text style={styles.cufeLabel}>CUNE Global</Text>
            <Text style={styles.cufeValue}>{nomina.cune}</Text>
          </View>
        )}

        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 9. REPORTE EJECUTIVO (dashboard en PDF)
// ============================================================

export async function generarPDFReporteEjecutivo(
  empresaId: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");

  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
  const inicioMesPasado = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const facturasMes = await db.facturaVenta.findMany({
    where: { empresaId, fecha: { gte: inicioMes }, estado: "vigente" },
    select: { total: true, subtotalNeto: true, totalIva: true, nombreCliente: true },
  });
  const facturasMesPasado = await db.facturaVenta.findMany({
    where: { empresaId, fecha: { gte: inicioMesPasado, lt: inicioMes }, estado: "vigente" },
    select: { total: true },
  });

  const ventasMes = round(facturasMes.reduce((a, f) => a + Number(f.total), 0), 2);
  const ventasMesPasado = round(facturasMesPasado.reduce((a, f) => a + Number(f.total), 0), 2);
  const variacion = ventasMesPasado > 0 ? round(((ventasMes - ventasMesPasado) / ventasMesPasado) * 100, 2) : 0;
  const numFacturas = facturasMes.length;
  const ticketPromedio = numFacturas > 0 ? round(ventasMes / numFacturas, 2) : 0;

  // Cartera
  const cartera = await db.facturaVenta.findMany({
    where: { empresaId, estado: "vigente", saldoPendiente: { gt: 0 } },
    select: { saldoPendiente: true, fechaVencimiento: true },
  });
  const carteraTotal = round(cartera.reduce((a, c) => a + Number(c.saldoPendiente), 0), 2);
  let cartera30 = 0, cartera60 = 0, cartera90 = 0, carteraMas90 = 0, carteraVencida = 0;
  for (const c of cartera) {
    if (!c.fechaVencimiento) continue;
    const dias = Math.floor((now.getTime() - c.fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24));
    if (dias <= 0) continue;
    if (dias <= 30) cartera30 += Number(c.saldoPendiente);
    else if (dias <= 60) cartera60 += Number(c.saldoPendiente);
    else if (dias <= 90) cartera90 += Number(c.saldoPendiente);
    else carteraMas90 += Number(c.saldoPendiente);
    carteraVencida += Number(c.saldoPendiente);
  }

  // Top productos por valor vendido en el mes
  const detallesMes = await db.detalleFacturaVenta.findMany({
    where: {
      factura: {
        empresaId,
        fecha: { gte: inicioMes },
        estado: "vigente",
      },
    },
    select: {
      productoId: true,
      descripcion: true,
      cantidad: true,
      total: true,
    },
  });
  const porProducto: Record<string, { descripcion: string; cantidad: number; total: number }> = {};
  for (const d of detallesMes) {
    if (!d.productoId) continue;
    if (!porProducto[d.productoId]) {
      porProducto[d.productoId] = { descripcion: d.descripcion, cantidad: 0, total: 0 };
    }
    porProducto[d.productoId].cantidad += d.cantidad;
    porProducto[d.productoId].total += Number(d.total);
  }
  const topProductos = Object.entries(porProducto)
    .map(([id, v]) => ({ id, ...v, total: round(v.total, 2) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Compras
  const comprasMes = await db.facturaCompra.aggregate({
    where: { empresaId, fecha: { gte: inicioMes }, estado: "vigente" },
    _sum: { total: true },
  });

  // Totales catálogo
  const totalProductos = await db.producto.count({ where: { empresaId, activo: true } });
  const totalClientes = await db.tercero.count({ where: { empresaId, tipo: "cliente", activo: true } });
  const totalProveedores = await db.tercero.count({ where: { empresaId, tipo: "proveedor", activo: true } });

  // Stock crítico
  const stockCritico = await db.producto.findMany({
    where: { empresaId, activo: true },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      stockMinimo: true,
      saldosInventario: { select: { cantidad: true } },
    },
  });
  const criticos = stockCritico
    .map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      stockTotal: p.saldosInventario.reduce((a, s) => a + s.cantidad, 0),
      stockMinimo: p.stockMinimo,
    }))
    .filter((p) => p.stockTotal <= p.stockMinimo)
    .slice(0, 10);

  // KPIs contables del mes
  const contaMovs = await db.movimientoContable.aggregate({
    where: { empresaId, fecha: { gte: inicioMes }, comprobante: { estado: "contabilizado" } },
    _sum: { debito: true, credito: true },
  });

  const doc = (
    <Document title="Reporte Ejecutivo" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Reporte Ejecutivo"}
          subtitulo={`Período ${fmtFecha(inicioMes)} → ${fmtFecha(now)}`}
        />

        {/* KPIs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicadores clave del mes</Text>
          <View style={styles.boxRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Ventas del mes</Text>
              <Text style={styles.kpiValue}>{fmtCOP(ventasMes)}</Text>
              <Text style={{ fontSize: 7, color: variacion >= 0 ? COLORS.primary : COLORS.danger }}>
                {variacion >= 0 ? "▲" : "▼"} {Math.abs(variacion)}% vs mes anterior
              </Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Cartera total</Text>
              <Text style={styles.kpiValue}>{fmtCOP(carteraTotal)}</Text>
              <Text style={{ fontSize: 7, color: COLORS.textMuted }}>
                Vencida: {fmtCOP(carteraVencida)}
              </Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Compras del mes</Text>
              <Text style={styles.kpiValue}>{fmtCOP(Number(comprasMes._sum.total ?? 0))}</Text>
              <Text style={{ fontSize: 7, color: COLORS.textMuted }}>
                {numFacturas} facturas emitidas
              </Text>
            </View>
          </View>
          <View style={styles.boxRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Ticket promedio</Text>
              <Text style={styles.kpiValue}>{fmtCOP(ticketPromedio)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Productos críticos</Text>
              <Text style={styles.kpiValue}>{criticos.length}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>Movimientos contables</Text>
              <Text style={styles.kpiValue}>{fmtCOP(Number(contaMovs._sum.debito ?? 0))}</Text>
              <Text style={{ fontSize: 7, color: COLORS.textMuted }}>Débitos del mes</Text>
            </View>
          </View>
        </View>

        {/* Cartera por edades */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cartera por edades</Text>
          <View style={styles.boxRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>0-30 días</Text>
              <Text style={styles.kpiValue}>{fmtCOP(cartera30)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>31-60 días</Text>
              <Text style={styles.kpiValue}>{fmtCOP(cartera60)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>61-90 días</Text>
              <Text style={styles.kpiValue}>{fmtCOP(cartera90)}</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>+90 días</Text>
              <Text style={[styles.kpiValue, { color: COLORS.danger }]}>
                {fmtCOP(carteraMas90)}
              </Text>
            </View>
          </View>
        </View>

        {/* Top productos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top 10 productos vendidos en el mes</Text>
          <TablePDF
            columns={[
              { label: "#", width: "6%", align: "center", render: (_r, i) => String(i + 1) },
              { label: "Código", width: "10%", render: (r) => r.id?.slice(-6) ?? "—" },
              { label: "Descripción", width: "54%", render: (r) => r.descripcion },
              { label: "Cantidad", width: "12%", align: "right", render: (r) => fmtNumber(r.cantidad, 2) },
              { label: "Total", width: "18%", align: "right", render: (r) => fmtCOP(r.total) },
            ]}
            rows={topProductos}
          />
        </View>

        {/* Stock crítico */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Productos con stock crítico</Text>
          <TablePDF
            columns={[
              { label: "Código", width: "15%", render: (r) => r.codigo },
              { label: "Producto", width: "50%", render: (r) => r.nombre },
              { label: "Stock actual", width: "15%", align: "right", render: (r) => fmtNumber(r.stockTotal, 2) },
              { label: "Mínimo", width: "10%", align: "right", render: (r) => fmtNumber(r.stockMinimo, 2) },
              { label: "Estado", width: "10%", align: "center", render: (r) => r.stockTotal <= 0 ? "AGOTADO" : "CRÍTICO" },
            ]}
            rows={criticos}
          />
        </View>

        {/* Resumen */}
        <View style={styles.boxRow}>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Clientes activos</Text>
            <Text style={styles.boxValue}>{totalClientes}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Proveedores activos</Text>
            <Text style={styles.boxValue}>{totalProveedores}</Text>
          </View>
          <View style={styles.boxCol}>
            <Text style={styles.boxLabel}>Productos activos</Text>
            <Text style={styles.boxValue}>{totalProductos}</Text>
          </View>
        </View>

        <Text style={styles.notaText}>
          Reporte consolidado del período actual. Los KPIs se calculan en línea al momento
          de la generación. Este documento no constituye un estado financiero auditado.
        </Text>

        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 10. EXTRACTO BANCARIO (placeholder — sin datos aún)
// ============================================================

export async function generarPDFExtractoBancario(
  cuentaId: string,
  mes: number,
  anio: number,
  empresaId: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");

  const doc = (
    <Document title="Extracto Bancario" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo={"Extracto Bancario"}
          subtitulo={`Cuenta ${cuentaId} · Mes ${mes}/${anio}`}
        />
        <View style={[styles.stampBox, { borderColor: COLORS.warning }]}>
          <Text style={[styles.stampText, { color: COLORS.warning }]}>
            REPORT EN CONSTRUCCIÓN
          </Text>
          <Text style={styles.notaText}>
            Este reporte está reservado para la integración bancaria futura
            (Hermes §10.7). Cuando se carguen los archivos conciliatorios
            (MT940, XML bancario), los movimientos aparecerán aquí.
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen del período</Text>
          <View style={styles.boxRow}>
            <View style={styles.boxCol}>
              <Text style={styles.boxLabel}>Saldo inicial</Text>
              <Text style={styles.boxValue}>—</Text>
            </View>
            <View style={styles.boxCol}>
              <Text style={styles.boxLabel}>Ingresos</Text>
              <Text style={styles.boxValue}>—</Text>
            </View>
            <View style={styles.boxCol}>
              <Text style={styles.boxLabel}>Egresos</Text>
              <Text style={styles.boxValue}>—</Text>
            </View>
            <View style={styles.boxCol}>
              <Text style={styles.boxLabel}>Saldo final</Text>
              <Text style={styles.boxValue}>—</Text>
            </View>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Movimientos</Text>
          <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
            Sin movimientos para mostrar. Pendiente de integración bancaria.
          </Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 14-17. ESTADOS FINANCIEROS NIIF (IFRS)
//
//   generarPDFESF(empresaId, fechaFin) — Estado de Situación Financiera
//   generarPDFEER(empresaId, fechaInicio, fechaFin) — Estado de Resultado Integral
//   generarPDFECP(empresaId, fechaInicio, fechaFin) — Cambios en el Patrimonio
//   generarPDFFE(empresaId, fechaInicio, fechaFin) — Flujos de Efectivo
//
// Todos con layout profesional: header con datos empresa, tabla con
// cuentas y valores, totales destacados, footer con notas y firma.
// ============================================================

import {
  generarESF,
  generarEER,
  generarECP,
  generarEFE,
  type ESFResult,
  type EERResult,
  type ECPResult,
  type EFEResult,
} from "@/lib/niif";
import type { SaldoLine } from "@/lib/niif-mapping";

// Componente reutilizable: fila de tabla NIIF (cuenta | nombre | valor)
function NiifTableRow({
  codigo,
  nombre,
  valor,
  bold,
  alt,
  indent,
  color,
}: {
  codigo?: string;
  nombre: string;
  valor: number | string;
  bold?: boolean;
  alt?: boolean;
  indent?: number;
  color?: string;
}) {
  const valStr = typeof valor === "string" ? valor : fmtCOP(valor);
  return (
    <View
      style={[
        styles.tableRow,
        alt ? styles.tableRowAlt : {},
        { backgroundColor: bold ? COLORS.primaryLight : alt ? "#f1f5f9" : "#ffffff" },
      ]}
    >
      <Text
        style={[
          styles.tableCol,
          {
            width: "12%",
            fontWeight: bold ? "bold" : "normal",
            color: color ?? COLORS.textDark,
            paddingLeft: 4 + (indent ?? 0) * 12,
          },
        ]}
      >
        {codigo ?? ""}
      </Text>
      <Text
        style={[
          styles.tableCol,
          {
            width: "60%",
            fontWeight: bold ? "bold" : "normal",
            color: color ?? COLORS.textDark,
          },
        ]}
      >
        {nombre}
      </Text>
      <Text
        style={[
          styles.tableCol,
          {
            width: "28%",
            textAlign: "right",
            fontWeight: bold ? "bold" : "normal",
            color: color ?? COLORS.textDark,
          },
        ]}
      >
        {valStr}
      </Text>
    </View>
  );
}

// Encabezado de tabla NIIF
function NiifTableHeader() {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.tableColHeader, { width: "12%" }]}>Código</Text>
      <Text style={[styles.tableColHeader, { width: "60%" }]}>Descripción</Text>
      <Text style={[styles.tableColHeader, { width: "28%", textAlign: "right" }]}>
        Valor (COP)
      </Text>
    </View>
  );
}

// Bloque de notas y firma
function NotasYFirma() {
  return (
    <View style={styles.section} break>
      <Text style={styles.sectionTitle}>Notas a los estados financieros</Text>
      <Text style={[styles.notaText, { fontSize: 8 }]}>
        1. Los estados financieros se preparan conforme a las Normas Internacionales de Información Financiera (NIIF/IFRS) emitidas por el IASB.
      </Text>
      <Text style={[styles.notaText, { fontSize: 8 }]}>
        2. Las cifras se expresan en pesos colombianos (COP) y están redondeadas al peso más cercano.
      </Text>
      <Text style={[styles.notaText, { fontSize: 8 }]}>
        3. La base de medición utilizada es el costo histórico, salvo donde se indique lo contrario.
      </Text>
      <Text style={[styles.notaText, { fontSize: 8 }]}>
        4. El impuesto de renta se calcula a la tarifa vigente del 33% conforme a la NIC 12.
      </Text>

      <View style={{ marginTop: 30, flexDirection: "row", justifyContent: "space-around" }}>
        <View style={{ alignItems: "center" }}>
          <View style={{ width: 200, borderTopWidth: 0.5, borderTopColor: COLORS.textMuted, paddingVertical: 4 }}>
            <Text style={{ fontSize: 8, textAlign: "center", color: COLORS.textMuted }}>
              Preparado por
            </Text>
            <Text style={{ fontSize: 9, fontWeight: "bold", textAlign: "center" }}>
              Contador Público
            </Text>
            <Text style={{ fontSize: 8, textAlign: "center", color: COLORS.textMuted }}>
              Tarjeta Profesional No. _______
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "center" }}>
          <View style={{ width: 200, borderTopWidth: 0.5, borderTopColor: COLORS.textMuted, paddingVertical: 4 }}>
            <Text style={{ fontSize: 8, textAlign: "center", color: COLORS.textMuted }}>
              Representante Legal
            </Text>
            <Text style={{ fontSize: 9, fontWeight: "bold", textAlign: "center" }}>
              {""}
            </Text>
            <Text style={{ fontSize: 8, textAlign: "center", color: COLORS.textMuted }}>
              C.C. _______
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// 14. PDF ESTADO DE SITUACIÓN FINANCIERA (ESF)
// ============================================================

export async function generarPDFESF(
  empresaId: string,
  fechaFin: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");
  const data = await generarESF(empresaId, fechaFin);

  const fechaTexto = fmtFecha(data.fechaFin);

  const renderSeccion = (
    titulo: string,
    seccion: { lineas: SaldoLine[]; total: number },
    indent = 0,
  ) => (
    <View key={titulo} style={{ marginTop: 4 }}>
      <Text style={[styles.sectionTitle, { fontSize: 9 }]}>{titulo}</Text>
      <NiifTableHeader />
      {seccion.lineas.length === 0 ? (
        <Text style={[styles.notaText, { padding: 4 }]}>
          Sin partidas para este rubro.
        </Text>
      ) : (
        seccion.lineas.map((l, i) => (
          <NiifTableRow
            key={i}
            codigo={l.codigo}
            nombre={l.nombre}
            valor={l.saldo}
            alt={i % 2 === 1}
            indent={indent}
          />
        ))
      )}
      <NiifTableRow
        nombre={`Total ${titulo}`}
        valor={seccion.total}
        bold
      />
    </View>
  );

  const doc = (
    <Document title="Estado de Situación Financiera" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo="Estado de Situación Financiera"
          subtitulo={`Al ${fechaTexto} · (NIIF/IFRS)`}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACTIVO</Text>
          {renderSeccion("Efectivo y equivalentes", data.activo.efectivo, 1)}
          {renderSeccion("Inversiones y clientes", data.activo.clientes, 1)}
          {renderSeccion("Inventarios", data.activo.inventarios, 1)}
          {renderSeccion("Activo corriente (otros)", data.activo.corriente, 1)}
          {renderSeccion("Activo no corriente", data.activo.no_corriente, 1)}
          <NiifTableRow
            nombre="TOTAL ACTIVO"
            valor={data.totalActivo}
            bold
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PASIVO</Text>
          {renderSeccion("Pasivo corriente", data.pasivo.corriente, 1)}
          {renderSeccion("Pasivo no corriente", data.pasivo.no_corriente, 1)}
          <NiifTableRow
            nombre="TOTAL PASIVO"
            valor={data.pasivo.total}
            bold
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PATRIMONIO</Text>
          <NiifTableHeader />
          {data.patrimonio.lineas.length === 0 ? (
            <Text style={[styles.notaText, { padding: 4 }]}>
              Sin partidas de patrimonio.
            </Text>
          ) : (
            data.patrimonio.lineas.map((l, i) => (
              <NiifTableRow
                key={i}
                codigo={l.codigo}
                nombre={l.nombre}
                valor={l.saldo}
                alt={i % 2 === 1}
                indent={1}
              />
            ))
          )}
          <NiifTableRow
            nombre="Utilidad del período"
            valor={data.patrimonio.utilidadPeriodo}
            indent={1}
          />
          <NiifTableRow
            nombre="TOTAL PATRIMONIO"
            valor={data.totalPasivoPatrimonio - data.pasivo.total}
            bold
          />
          <NiifTableRow
            nombre="TOTAL PASIVO + PATRIMONIO"
            valor={data.totalPasivoPatrimonio}
            bold
          />
          <NiifTableRow
            nombre="DIFERENCIA (Activo − Pasivo+Patrimonio)"
            valor={data.diferencia}
            bold
            color={Math.abs(data.diferencia) < 1 ? COLORS.primary : COLORS.danger}
          />
        </View>

        <NotasYFirma />
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 15. PDF ESTADO DE RESULTADO INTEGRAL (EER)
// ============================================================

export async function generarPDFEER(
  empresaId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");
  const data = await generarEER(empresaId, fechaInicio, fechaFin);

  const renderLista = (
    titulo: string,
    lineas: SaldoLine[],
    total: number,
  ) => (
    <View key={titulo} style={{ marginTop: 4 }}>
      <Text style={[styles.sectionTitle, { fontSize: 9 }]}>{titulo}</Text>
      <NiifTableHeader />
      {lineas.length === 0 ? (
        <Text style={[styles.notaText, { padding: 4 }]}>
          Sin partidas para este rubro.
        </Text>
      ) : (
        lineas.map((l, i) => (
          <NiifTableRow
            key={i}
            codigo={l.codigo}
            nombre={l.nombre}
            valor={l.saldo}
            alt={i % 2 === 1}
            indent={1}
          />
        ))
      )}
      <NiifTableRow nombre={`Total ${titulo}`} valor={total} bold />
    </View>
  );

  const doc = (
    <Document title="Estado de Resultado Integral" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo="Estado de Resultado Integral"
          subtitulo={`Del ${fmtFecha(data.fechaInicio)} al ${fmtFecha(data.fechaFin)} · (NIIF/IFRS)`}
        />

        <View style={styles.section}>
          {renderLista("Ingresos", data.ingresos, data.totalIngresos)}
          {renderLista("Costos de venta", data.costosVenta, data.totalCostosVenta)}
          <NiifTableRow
            nombre="UTILIDAD BRUTA"
            valor={data.utilidadBruta}
            bold
            color={data.utilidadBruta >= 0 ? COLORS.primary : COLORS.danger}
          />
          {renderLista("Gastos administrativos", data.gastosAdmin, data.totalGastosAdmin)}
          {renderLista("Costos de producción", data.costosProduccion, data.totalCostosProduccion)}
          <NiifTableRow
            nombre="UTILIDAD OPERATIVA"
            valor={data.utilidadOperativa}
            bold
            color={data.utilidadOperativa >= 0 ? COLORS.primary : COLORS.danger}
          />
          {renderLista("Otros ingresos", data.otrosIngresos, data.totalOtrosIngresos)}
          {renderLista("Otros gastos", data.otrosGastos, data.totalOtrosGastos)}
          <NiifTableRow
            nombre="UTILIDAD ANTES DE IMPUESTOS"
            valor={data.utilidadAntesImpuestos}
            bold
            color={data.utilidadAntesImpuestos >= 0 ? COLORS.primary : COLORS.danger}
          />
          <NiifTableRow
            nombre="Impuesto de renta (33%)"
            valor={data.impuestoRenta}
            bold
            color={COLORS.danger}
          />
          <NiifTableRow
            nombre="UTILIDAD NETA DEL PERÍODO"
            valor={data.utilidadNeta}
            bold
            color={data.utilidadNeta >= 0 ? COLORS.primary : COLORS.danger}
          />
        </View>

        <NotasYFirma />
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 16. PDF ESTADO DE CAMBIOS EN EL PATRIMONIO (ECP)
// ============================================================

export async function generarPDFECP(
  empresaId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");
  const data = await generarECP(empresaId, fechaInicio, fechaFin);

  const doc = (
    <Document title="Estado de Cambios en el Patrimonio" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo="Estado de Cambios en el Patrimonio"
          subtitulo={`Del ${fmtFecha(data.fechaInicio)} al ${fmtFecha(data.fechaFin)} · (NIIF/IFRS)`}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SALDO INICIAL</Text>
          <NiifTableHeader />
          <NiifTableRow
            nombre="Saldo inicial del patrimonio"
            valor={data.saldoInicialPatrimonio}
            bold
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AUMENTOS DE PATRIMONIO</Text>
          <NiifTableHeader />
          {data.aumentos.length === 0 ? (
            <Text style={[styles.notaText, { padding: 4 }]}>
              No se registran aumentos en el período.
            </Text>
          ) : (
            data.aumentos.map((a, i) => (
              <NiifTableRow
                key={`a-${i}`}
                codigo={a.categoria.slice(0, 3).toUpperCase()}
                nombre={a.concepto}
                valor={a.monto}
                alt={i % 2 === 1}
                indent={1}
              />
            ))
          )}
          <NiifTableRow
            nombre="Utilidad neta del período"
            valor={data.utilidadNetaPeriodo}
            bold
            color={data.utilidadNetaPeriodo >= 0 ? COLORS.primary : COLORS.danger}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REDUCCIONES DE PATRIMONIO</Text>
          <NiifTableHeader />
          {data.reducciones.length === 0 ? (
            <Text style={[styles.notaText, { padding: 4 }]}>
              No se registran reducciones en el período.
            </Text>
          ) : (
            data.reducciones.map((r, i) => (
              <NiifTableRow
                key={`r-${i}`}
                codigo={r.categoria.slice(0, 3).toUpperCase()}
                nombre={r.concepto}
                valor={r.monto}
                alt={i % 2 === 1}
                indent={1}
              />
            ))
          )}
          {data.dividendos > 0 && (
            <NiifTableRow
              codigo="DIV"
              nombre="Dividendos pagados"
              valor={data.dividendos}
              indent={1}
              color={COLORS.danger}
            />
          )}
        </View>

        <View style={styles.section}>
          <NiifTableRow
            nombre="SALDO FINAL DEL PATRIMONIO"
            valor={data.saldoFinalPatrimonio}
            bold
            color={COLORS.primary}
          />
        </View>

        <NotasYFirma />
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

// ============================================================
// 17. PDF ESTADO DE FLUJOS DE EFECTIVO (EFE)
// ============================================================

export async function generarPDFFE(
  empresaId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<Buffer> {
  const empresa = await cargarEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");
  const data = await generarEFE(empresaId, fechaInicio, fechaFin);

  const renderFlujos = (
    titulo: string,
    flujos: { concepto: string; monto: number }[],
    total: number,
  ) => (
    <View key={titulo} style={{ marginTop: 4 }}>
      <Text style={[styles.sectionTitle, { fontSize: 9 }]}>{titulo}</Text>
      <NiifTableHeader />
      {flujos.length === 0 ? (
        <Text style={[styles.notaText, { padding: 4 }]}>
          Sin flujos para esta sección.
        </Text>
      ) : (
        flujos.map((f, i) => (
          <NiifTableRow
            key={i}
            codigo="—"
            nombre={f.concepto}
            valor={f.monto}
            alt={i % 2 === 1}
            indent={1}
          />
        ))
      )}
      <NiifTableRow nombre={`Total ${titulo}`} valor={total} bold />
    </View>
  );

  const doc = (
    <Document title="Estado de Flujos de Efectivo" author={empresa.razonSocial}>
      <Page size="LETTER" style={styles.page}>
        <Header
          empresa={empresa}
          titulo="Estado de Flujos de Efectivo"
          subtitulo={`Del ${fmtFecha(data.fechaInicio)} al ${fmtFecha(data.fechaFin)} · Método indirecto · (NIIF/IFRS)`}
        />

        <View style={styles.section}>
          {renderFlujos(
            "Flujos de efectivo de actividades de operación",
            data.flujosOperacion,
            data.totalOperacion,
          )}
          {renderFlujos(
            "Flujos de efectivo de actividades de inversión",
            data.flujosInversion,
            data.totalInversion,
          )}
          {renderFlujos(
            "Flujos de efectivo de actividades de financiación",
            data.flujosFinanciacion,
            data.totalFinanciacion,
          )}
          <NiifTableRow
            nombre="AUMENTO NETO DEL EFECTIVO"
            valor={data.aumentoNetoEfectivo}
            bold
            color={COLORS.primary}
          />
          <NiifTableRow
            nombre="Saldo inicial de efectivo"
            valor={data.saldoInicial}
            indent={1}
          />
          <NiifTableRow
            nombre="SALDO FINAL DE EFECTIVO"
            valor={data.saldoFinal}
            bold
            color={COLORS.primary}
          />
        </View>

        <NotasYFirma />
        <Footer />
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}
