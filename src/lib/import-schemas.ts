// ============================================================
// import-schemas.ts — Schemas Zod por entidad para Importaciones
// Masivas desde Excel (Hermes §5.20). ERP Marsella.
// ============================================================
import { z } from "zod";

// ---------- Helpers ----------
const num = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? parseFloat(String(v).replace(",", ".")) || 0 : v));
const numOpt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return undefined;
    return typeof v === "string" ? parseFloat(String(v).replace(",", ".")) || undefined : v;
  });
const str = z.union([z.string(), z.number(), z.null(), z.undefined()]).transform((v) => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
});
const strOpt = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return undefined;
    return String(v).trim();
  });
const boolStr = z
  .union([z.boolean(), z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (typeof v === "boolean") return v;
    if (v === null || v === undefined) return false;
    const s = String(v).trim().toLowerCase();
    return s === "true" || s === "si" || s === "sí" || s === "1" || s === "yes" || s === "y";
  });
const dateStr = z
  .union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return new Date();
    if (v instanceof Date) return v;
    // acepta YYYY-MM-DD o DD/MM/YYYY o timestamp
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
      const [dd, mm, yyyy] = s.split(/[/\s]/);
      const d = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    const t = Date.parse(s);
    return isNaN(t) ? new Date() : new Date(t);
  });

// Items JSON: string parseable a array de {productoCodigo?, descripcion, cantidad, precioUnitario, descuento?}
const itemsSchema = z
  .union([z.string(), z.array(z.any()), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Items requeridos (JSON o columnas separadas por ;)",
      });
      return [];
    }
    if (Array.isArray(v)) return v as any[];
    // String → intentar parse JSON, si no, formato compacto: desc|cant|precio;desc2|cant2|precio2
    const s = String(v).trim();
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // formato compacto separado por ; y |
      const items = s
        .split(";")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("|").map((p) => p.trim());
          return {
            descripcion: parts[0] ?? "",
            cantidad: parseFloat(parts[1] ?? "1") || 1,
            precioUnitario: parseFloat(parts[2] ?? "0") || 0,
            productoCodigo: parts[3] ?? undefined,
          };
        });
      if (items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Items con formato inválido",
        });
      }
      return items;
    }
  });

// ---------- 1. Terceros ----------
export const terceroImportSchema = z.object({
  tipo: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const s = String(v ?? "cliente").trim().toLowerCase();
      if (["cliente", "proveedor", "empleado", "socio", "todos"].includes(s)) return s;
      if (s === "c") return "cliente";
      if (s === "p") return "proveedor";
      return "cliente";
    }),
  tipoDocumento: str.transform((v) => {
    const s = v.toUpperCase();
    if (["CC", "NIT", "CE", "TI", "PT"].includes(s)) return s;
    if (s === "C") return "CC";
    if (s === "N") return "NIT";
    return "CC";
  }),
  numeroDocumento: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 3, "Número de documento muy corto"),
  nombre: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 2, "Nombre muy corto"),
  direccion: strOpt,
  telefono: strOpt,
  email: strOpt,
  ciudadId: strOpt,
  regimenTributario: str.transform((v) => {
    const s = v.toLowerCase();
    if (["comun", "simplificado", "no_responsable", "gran_contribuyente"].includes(s)) return s;
    if (s === "común" || s === "") return "comun";
    return "comun";
  }),
  cupoCredito: numOpt.default(0),
  diasPlazo: numOpt.default(0),
});

// ---------- 2. Productos ----------
export const productoImportSchema = z.object({
  codigo: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 1, "Código requerido"),
  codigoBarras: strOpt,
  nombre: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 2, "Nombre muy corto"),
  tipo: str.transform((v) => {
    const s = v.toLowerCase();
    if (["producto", "servicio", "kit", "insumo"].includes(s)) return s;
    return "producto";
  }),
  inventariable: boolStr.default(true),
  precio1: num.default(0),
  costo: num.default(0),
  tarifaIva: num.default(19),
  stockMinimo: num.default(0),
});

// ---------- 3. Facturas de Venta ----------
export const facturaVentaImportSchema = z.object({
  clienteNit: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 1, "Cliente NIT requerido"),
  clienteNombre: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 2, "Nombre de cliente requerido"),
  fecha: dateStr,
  items: itemsSchema,
  formaPago: str.transform((v) => {
    const s = v.toLowerCase();
    if (["efectivo", "tarjeta", "transferencia", "credito", "mixto"].includes(s)) return s;
    return "efectivo";
  }),
  total: numOpt.optional(),
});

// ---------- 4. Facturas de Compra ----------
export const facturaCompraImportSchema = z.object({
  proveedorNit: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 1, "Proveedor NIT requerido"),
  proveedorNombre: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 2, "Nombre de proveedor requerido"),
  fecha: dateStr,
  items: itemsSchema,
  total: numOpt.optional(),
});

// ---------- 5. Usuarios de Servicio Público ----------
export const usuarioServicioImportSchema = z.object({
  numeroContrato: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 1, "Número de contrato requerido"),
  direccion: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 1, "Dirección requerida"),
  estrato: num.transform((v) => Math.max(1, Math.min(6, Math.round(v)))),
  uso: str.transform((v) => {
    const s = v.toLowerCase();
    if (["residencial", "comercial", "industrial", "oficial"].includes(s)) return s;
    return "residencial";
  }),
  tarifaFija: num.default(0),
  tarifaVariable: num.default(0),
  medidor: strOpt,
});

// ---------- 6. Movimientos Contables ----------
export const movimientoContableImportSchema = z.object({
  fecha: dateStr,
  cuentaCodigo: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 1, "Código PUC requerido"),
  terceroNit: strOpt,
  debito: num.default(0),
  credito: num.default(0),
  descripcion: strOpt,
});

// ---------- 7. Comandas ----------
export const comandaImportSchema = z.object({
  mesaCodigo: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length >= 1, "Código de mesa requerido"),
  mesero: strOpt,
  items: itemsSchema,
});

// ============================================================
// Registro central de schemas
// ============================================================
export const IMPORT_SCHEMAS: Record<string, z.ZodType<any>> = {
  terceros: terceroImportSchema,
  productos: productoImportSchema,
  "facturas-venta": facturaVentaImportSchema,
  "facturas-compra": facturaCompraImportSchema,
  "usuarios-servicio": usuarioServicioImportSchema,
  "movimientos-contables": movimientoContableImportSchema,
  comandas: comandaImportSchema,
};

// ============================================================
// Metadatos de cada entidad para mapeo, plantilla y UI
// ============================================================
export interface EntityField {
  key: string;
  label: string;
  aliases?: string[]; // sin acentos, lowercase
  required: boolean;
  example?: string;
}

export interface EntityMeta {
  key: string;
  label: string;
  description: string;
  fields: EntityField[];
  exampleRow: Record<string, any>;
}

export const ENTITY_META: EntityMeta[] = [
  {
    key: "terceros",
    label: "Terceros",
    description: "Clientes, proveedores, empleados, socios.",
    fields: [
      { key: "tipo", label: "Tipo", aliases: ["tipo", "clase", "tipo tercero"], required: true, example: "cliente" },
      { key: "tipoDocumento", label: "Tipo Documento", aliases: ["tipodocumento", "tipo doc", "td", "tipo identificacion"], required: true, example: "CC" },
      { key: "numeroDocumento", label: "Número Documento", aliases: ["numerodocumento", "numero", "documento", "nit", "cc", "cedula", "identificacion"], required: true, example: "1234567890" },
      { key: "nombre", label: "Nombre / Razón Social", aliases: ["nombre", "razon social", "razonsocial", "nombres", "cliente", "proveedor"], required: true, example: "Comercial La Sabana S.A.S." },
      { key: "direccion", label: "Dirección", aliases: ["direccion", "dir", "domicilio"], required: false, example: "Calle 45 # 23-18" },
      { key: "telefono", label: "Teléfono", aliases: ["telefono", "tel", "celular", "movil", "cel"], required: false, example: "3105551212" },
      { key: "email", label: "Email", aliases: ["email", "correo", "e-mail", "mail"], required: false, example: "ventas@lasabana.co" },
      { key: "ciudadId", label: "Ciudad (ID o Nombre)", aliases: ["ciudad", "ciudadid", "municipio"], required: false, example: "Cali" },
      { key: "regimenTributario", label: "Régimen Tributario", aliases: ["regimen", "regimen tributario", "regimentributario", "responsabilidad"], required: false, example: "comun" },
      { key: "cupoCredito", label: "Cupo Crédito", aliases: ["cupo", "cupo credito", "cupo crediticio", "limite"], required: false, example: "5000000" },
      { key: "diasPlazo", label: "Días Plazo", aliases: ["dias", "plazo", "dias plazo", "diasplazo"], required: false, example: "30" },
    ],
    exampleRow: {
      tipo: "cliente",
      tipoDocumento: "NIT",
      numeroDocumento: "900123456",
      nombre: "Comercial La Sabana S.A.S.",
      direccion: "Calle 45 # 23-18",
      telefono: "3105551212",
      email: "ventas@lasabana.co",
      ciudadId: "Cali",
      regimenTributario: "comun",
      cupoCredito: 5000000,
      diasPlazo: 30,
    },
  },
  {
    key: "productos",
    label: "Productos",
    description: "Productos, servicios, kits e insumos.",
    fields: [
      { key: "codigo", label: "Código / SKU", aliases: ["codigo", "sku", "codigo interno", "cod", "referencia"], required: true, example: "P001" },
      { key: "codigoBarras", label: "Código de Barras", aliases: ["codigobarras", "barras", "ean", "upc", "barcode"], required: false, example: "7701234567890" },
      { key: "nombre", label: "Nombre", aliases: ["nombre", "descripcion", "producto", "articulo", "name"], required: true, example: "Café Marsella 500g" },
      { key: "tipo", label: "Tipo", aliases: ["tipo", "clase"], required: true, example: "producto" },
      { key: "inventariable", label: "Inventariable (Si/No)", aliases: ["inventariable", "maneja inventario", "inventario"], required: false, example: "Si" },
      { key: "precio1", label: "Precio 1", aliases: ["precio1", "precio", "precio venta", "valor", "precio unitario", "pu"], required: true, example: "18500" },
      { key: "costo", label: "Costo", aliases: ["costo", "costo promedio", "ultimo costo"], required: false, example: "12000" },
      { key: "tarifaIva", label: "Tarifa IVA %", aliases: ["tarifaiva", "iva", "porcentaje iva", "% iva"], required: false, example: "19" },
      { key: "stockMinimo", label: "Stock Mínimo", aliases: ["stockminimo", "minimo", "stock min", "reorden"], required: false, example: "10" },
    ],
    exampleRow: {
      codigo: "P001",
      codigoBarras: "7701234567890",
      nombre: "Café Marsella 500g",
      tipo: "producto",
      inventariable: "Si",
      precio1: 18500,
      costo: 12000,
      tarifaIva: 19,
      stockMinimo: 10,
    },
  },
  {
    key: "facturas-venta",
    label: "Facturas de Venta",
    description: "Facturas emitidas a clientes. Items como JSON o 'desc|cant|precio;...'",
    fields: [
      { key: "clienteNit", label: "Cliente NIT/CC", aliases: ["clientenit", "nit cliente", "nit", "cliente nit", "documento cliente"], required: true, example: "900123456" },
      { key: "clienteNombre", label: "Cliente Nombre", aliases: ["clientenombre", "nombre cliente", "razon social cliente"], required: true, example: "Comercial La Sabana" },
      { key: "fecha", label: "Fecha", aliases: ["fecha", "fecha factura", "f", "emision"], required: true, example: "2026-01-15" },
      { key: "items", label: "Items (JSON o desc|cant|precio;...)", aliases: ["items", "detalles", "lineas", "conceptos", "productos"], required: true, example: "Café 500g|2|18500;Azúcar|1|3200" },
      { key: "formaPago", label: "Forma de Pago", aliases: ["formapago", "pago", "forma pago", "medio pago"], required: true, example: "efectivo" },
      { key: "total", label: "Total (opcional, se calcula)", aliases: ["total", "valor total"], required: false, example: "" },
    ],
    exampleRow: {
      clienteNit: "900123456",
      clienteNombre: "Comercial La Sabana",
      fecha: "2026-01-15",
      items: "Café 500g|2|18500;Azúcar|1|3200",
      formaPago: "efectivo",
      total: "",
    },
  },
  {
    key: "facturas-compra",
    label: "Facturas de Compra",
    description: "Facturas recibidas de proveedores. Items como JSON o 'desc|cant|precio;...'",
    fields: [
      { key: "proveedorNit", label: "Proveedor NIT/CC", aliases: ["proveedornit", "nit proveedor", "nit", "documento proveedor"], required: true, example: "900987654" },
      { key: "proveedorNombre", label: "Proveedor Nombre", aliases: ["proveedornombre", "nombre proveedor", "razon social proveedor"], required: true, example: "Distribuidora Andina" },
      { key: "fecha", label: "Fecha", aliases: ["fecha", "fecha factura", "f", "emision"], required: true, example: "2026-01-15" },
      { key: "items", label: "Items (JSON o desc|cant|precio;...)", aliases: ["items", "detalles", "lineas", "conceptos"], required: true, example: "Insumo A|10|5000;Insumo B|5|8500" },
      { key: "total", label: "Total (opcional, se calcula)", aliases: ["total", "valor total"], required: false, example: "" },
    ],
    exampleRow: {
      proveedorNit: "900987654",
      proveedorNombre: "Distribuidora Andina",
      fecha: "2026-01-15",
      items: "Insumo A|10|5000;Insumo B|5|8500",
      total: "",
    },
  },
  {
    key: "usuarios-servicio",
    label: "Usuarios Servicio Público",
    description: "Contratos de servicios públicos (agua, energía, gas, aseo).",
    fields: [
      { key: "numeroContrato", label: "Número Contrato", aliases: ["numerocontrato", "contrato", "num contrato", "n contrato"], required: true, example: "USU-001" },
      { key: "direccion", label: "Dirección", aliases: ["direccion", "dir", "domicilio"], required: true, example: "Cra 1 # 23-45" },
      { key: "estrato", label: "Estrato (1-6)", aliases: ["estrato", "estrato socioeconomico", "est"], required: true, example: "3" },
      { key: "uso", label: "Uso", aliases: ["uso", "tipo uso", "uso servicio"], required: true, example: "residencial" },
      { key: "tarifaFija", label: "Tarifa Fija", aliases: ["tarifafija", "cargo fijo", "fijo"], required: true, example: "4500" },
      { key: "tarifaVariable", label: "Tarifa Variable", aliases: ["tarifavariable", "variable", "tarifa consumo"], required: true, example: "250" },
      { key: "medidor", label: "Medidor #", aliases: ["medidor", "numero medidor", "num medidor"], required: false, example: "M-12345" },
    ],
    exampleRow: {
      numeroContrato: "USU-001",
      direccion: "Cra 1 # 23-45",
      estrato: 3,
      uso: "residencial",
      tarifaFija: 4500,
      tarifaVariable: 250,
      medidor: "M-12345",
    },
  },
  {
    key: "movimientos-contables",
    label: "Movimientos Contables",
    description: "Asientos contables manuales (una fila por movimiento).",
    fields: [
      { key: "fecha", label: "Fecha", aliases: ["fecha", "f", "fecha asiento"], required: true, example: "2026-01-15" },
      { key: "cuentaCodigo", label: "Código PUC Cuenta", aliases: ["cuentacodigo", "cuenta", "codigo cuenta", "cuenta puc", "puc"], required: true, example: "1105" },
      { key: "terceroNit", label: "Tercero NIT (opcional)", aliases: ["terceronit", "nit", "tercero", "documento tercero"], required: false, example: "900123456" },
      { key: "debito", label: "Débito", aliases: ["debito", "debe", "db", "d"], required: true, example: "100000" },
      { key: "credito", label: "Crédito", aliases: ["credito", "haber", "cr", "c"], required: true, example: "0" },
      { key: "descripcion", label: "Descripción", aliases: ["descripcion", "concepto", "detalle", "glosa"], required: false, example: "Pago proveedor" },
    ],
    exampleRow: {
      fecha: "2026-01-15",
      cuentaCodigo: "1105",
      terceroNit: "900123456",
      debito: 100000,
      credito: 0,
      descripcion: "Pago proveedor",
    },
  },
  {
    key: "comandas",
    label: "Comandas",
    description: "Comandas de restaurante. Items como 'desc|cant|precio;...'",
    fields: [
      { key: "mesaCodigo", label: "Código Mesa", aliases: ["mesacodigo", "mesa", "codigo mesa", "num mesa"], required: true, example: "M01" },
      { key: "mesero", label: "Mesero (nombre)", aliases: ["mesero", "mesero nombre", "vendedor"], required: false, example: "Juan Pérez" },
      { key: "items", label: "Items (desc|cant|precio;...)", aliases: ["items", "detalles", "pedidos", "productos"], required: true, example: "Café Americano|2|3500;Té Helado|1|4500" },
    ],
    exampleRow: {
      mesaCodigo: "M01",
      mesero: "Juan Pérez",
      items: "Café Americano|2|3500;Té Helado|1|4500",
    },
  },
];

export function getEntityMeta(key: string): EntityMeta | undefined {
  return ENTITY_META.find((e) => e.key === key);
}

export const ENTITY_KEYS = ENTITY_META.map((e) => e.key);
