// ============================================================
// import-excel.ts — Importador universal de Excel (Hermes §5.20)
// ERP Marsella. CUALQUIER entidad del catálogo.
// ============================================================
import {
  IMPORT_SCHEMAS,
  ENTITY_META,
  getEntityMeta,
  type EntityField,
} from "@/lib/import-schemas";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

// ---------- Tipos ----------
export interface SheetData {
  name: string;
  columns: string[];
  rows: any[][];
}

export interface ParsedExcel {
  sheets: SheetData[];
  totalRows: number;
}

export interface ColumnMapping {
  excelCol: string;
  targetField: string | null;
  confidence: number; // 0..1
  suggested: boolean;
}

export interface ValidationError {
  row: number; // 1-based en el Excel
  field: string;
  error: string;
  value?: any;
}

export interface ValidationResult {
  validRows: Record<string, any>[];
  errors: ValidationError[];
  rowCount: number;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  failed: number;
  total: number;
  errors: ValidationError[];
  durationMs: number;
}

// ---------- Normalización de texto ----------
function normalize(s: string): string {
  return s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Distancia de Levenshtein simplificada
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const maxLen = Math.max(na.length, nb.length);
  const d = levenshtein(na, nb);
  return Math.max(0, 1 - d / maxLen);
}

// ============================================================
// parseExcelFile — usa exceljs (import dinámico)
// ============================================================
export async function parseExcelFile(buffer: Buffer): Promise<ParsedExcel> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  // Cast a `any`: exceljs declara su propia `interface Buffer extends ArrayBuffer`
  // global que colisiona con el `Buffer<TArrayBuffer>` genérico de @types/node,
  // por lo que TS no logra reconciliar los dos tipos. Además, las opciones
  // `cellText`/`cellDates` existen en runtime pero no en `XlsxReadOptions`.
  // El cast evita ambos mismatches.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer, { cellText: false, cellDates: true } as any);

  const sheets: SheetData[] = [];
  let totalRows = 0;

  for (const ws of wb.worksheets) {
    // leer header (fila 1) y rows
    const columns: string[] = [];
    const rows: any[][] = [];
    let headerRow: any[] | null = null;

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = (row.values as any[]).slice(1); // quitar slot 0
      if (rowNumber === 1) {
        headerRow = values;
        // normalizar headers a string no vacío
        for (let i = 0; i < values.length; i++) {
          const v = values[i];
          columns.push(v === null || v === undefined ? `Columna ${i + 1}` : String(v).trim());
        }
      } else {
        // saltar filas completamente vacías
        const allEmpty = values.every((v) => v === null || v === undefined || v === "");
        if (!allEmpty) {
          rows.push(values);
        }
      }
    });

    if (!headerRow) {
      sheets.push({ name: ws.name, columns: [], rows: [] });
      continue;
    }

    sheets.push({ name: ws.name, columns, rows });
    totalRows += rows.length;
  }

  return { sheets, totalRows };
}

// ============================================================
// detectarMapeoColumnas — matching inteligente (case, acentos, fuzzy)
// ============================================================
export function detectarMapeoColumnas(
  headers: string[],
  targetEntity: string,
): ColumnMapping[] {
  const meta = getEntityMeta(targetEntity);
  if (!meta) {
    return headers.map((h) => ({
      excelCol: h,
      targetField: null,
      confidence: 0,
      suggested: false,
    }));
  }

  // Para evitar que varios headers mapeen al mismo field, marcamos los usados
  const usedFields = new Set<string>();
  const result: ColumnMapping[] = headers.map((h) => {
    let best: { field: string | null; conf: number } = { field: null, conf: 0 };
    for (const f of meta.fields) {
      // skip campos ya asignados con alta confianza
      if (usedFields.has(f.key)) continue;
      // 1) alias exacto normalizado
      const candidates = [f.label, f.key, ...(f.aliases ?? [])];
      let conf = 0;
      for (const alias of candidates) {
        const c = similarity(h, alias);
        if (c > conf) conf = c;
      }
      if (conf > best.conf) {
        best = { field: f.key, conf };
      }
    }
    if (best.field && best.conf >= 0.6) {
      usedFields.add(best.field);
    }
    return {
      excelCol: h,
      targetField: best.field,
      confidence: Math.round(best.conf * 100) / 100,
      suggested: best.conf >= 0.6,
    };
  });

  return result;
}

// ============================================================
// buildRowObject — aplica mapping a una fila y devuelve objeto
// ============================================================
export function buildRowObject(
  row: any[],
  columns: string[],
  mapping: Record<string, string | null>,
): Record<string, any> {
  const obj: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const targetField = mapping[col];
    if (!targetField) continue;
    const value = row[i] ?? null;
    obj[targetField] = value;
  }
  return obj;
}

// ============================================================
// validarFilas — valida contra el Zod schema de la entidad
// ============================================================
export function validarFilas(
  rows: any[][],
  columns: string[],
  mapping: Record<string, string | null>,
  targetEntity: string,
): ValidationResult {
  const schema = IMPORT_SCHEMAS[targetEntity];
  if (!schema) {
    return {
      validRows: [],
      errors: [
        {
          row: 0,
          field: "_schema",
          error: `No hay schema definido para entidad: ${targetEntity}`,
        },
      ],
      rowCount: rows.length,
    };
  }

  const validRows: Record<string, any>[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // La fila en Excel comienza en la fila 2 (la 1 es header)
    const excelRow = i + 2;
    const obj = buildRowObject(row, columns, mapping);
    const r = schema.safeParse(obj);
    if (r.success) {
      validRows.push(r.data);
    } else {
      for (const issue of r.error.issues) {
        const fieldPath = issue.path.join(".") || "_row";
        errors.push({
          row: excelRow,
          field: fieldPath,
          error: issue.message,
          value: obj[fieldPath],
        });
      }
      // Si hay errores pero la fila aún podría ser válida parcialmente, no la agregamos
    }
  }

  return { validRows, errors, rowCount: rows.length };
}

// ============================================================
// importToEntity — inserta en BD según el tipo de entidad
// Maneja duplicados vía upsert usando llaves naturales por entidad.
// ============================================================
export async function importToEntity(
  targetEntity: string,
  validRows: Record<string, any>[],
  session: SessionPayload,
): Promise<ImportResult> {
  const start = Date.now();
  const errors: ValidationError[] = [];
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const excelRow = i + 2;
    try {
      const res = await upsertEntity(targetEntity, row, session);
      if (res === "inserted") inserted++;
      else if (res === "updated") updated++;
    } catch (e: any) {
      failed++;
      errors.push({
        row: excelRow,
        field: "_db",
        error: e?.message ?? "Error desconocido en BD",
        value: row,
      });
    }
  }

  return {
    inserted,
    updated,
    failed,
    total: validRows.length,
    errors,
    durationMs: Date.now() - start,
  };
}

// ============================================================
// upsertEntity — un solo registro por entidad
// ============================================================
async function upsertEntity(
  entity: string,
  data: Record<string, any>,
  session: SessionPayload,
): Promise<"inserted" | "updated"> {
  const empresaId = session.empresaId;

  switch (entity) {
    case "terceros": {
      const where = {
        empresaId_tipoDocumento_numeroDocumento: {
          empresaId,
          tipoDocumento: data.tipoDocumento,
          numeroDocumento: data.numeroDocumento,
        },
      };
      const existing = await db.tercero.findUnique({ where });
      // resolver ciudadId por nombre si no es cuid
      let ciudadId = data.ciudadId ?? null;
      if (ciudadId && !/^[a-z0-9]{20,}$/i.test(String(ciudadId))) {
        // buscar ciudad por nombre
        const ciudad = await db.ciudad.findFirst({
          where: { nombre: { contains: String(ciudadId) } },
        });
        ciudadId = ciudad?.id ?? null;
      }
      const payload = {
        empresaId,
        tipo: data.tipo,
        tipoDocumento: data.tipoDocumento,
        numeroDocumento: data.numeroDocumento,
        nombre: data.nombre,
        direccion: data.direccion ?? null,
        telefono: data.telefono ?? null,
        email: data.email ?? null,
        ciudadId,
        regimenTributario: data.regimenTributario,
        cupoCredito: data.cupoCredito ?? 0,
        diasPlazo: data.diasPlazo ?? 0,
      };
      if (existing) {
        await db.tercero.update({ where, data: payload });
        return "updated";
      }
      await db.tercero.create({ data: payload });
      return "inserted";
    }

    case "productos": {
      const where = { empresaId_codigo: { empresaId, codigo: data.codigo } };
      const existing = await db.producto.findUnique({ where });
      const payload = {
        empresaId,
        codigo: data.codigo,
        codigoBarras: data.codigoBarras ?? null,
        nombre: data.nombre,
        tipo: data.tipo,
        inventariable: data.inventariable,
        precio1: data.precio1,
        ultimoCosto: data.costo,
        costoPromedio: data.costo,
        tarifaIva: data.tarifaIva,
        stockMinimo: data.stockMinimo,
      };
      if (existing) {
        await db.producto.update({ where, data: payload });
        return "updated";
      }
      await db.producto.create({ data: payload });
      return "inserted";
    }

    case "facturas-venta": {
      // Resolver terceroId por NIT
      const t = await db.tercero.findFirst({
        where: { empresaId, numeroDocumento: data.clienteNit },
      });
      // Calcular totales desde items
      let subtotal = 0;
      let totalIva = 0;
      const detalles = (data.items as any[]).map((it: any) => {
        const cantidad = Number(it.cantidad) || 0;
        const precio = Number(it.precioUnitario) || 0;
        const sub = cantidad * precio;
        const iva = sub * ((Number(it.tarifaIva ?? data.tarifaIva ?? 19)) / 100);
        subtotal += sub;
        totalIva += iva;
        return {
          descripcion: it.descripcion ?? it.productoCodigo ?? "",
          cantidad,
          precioUnitario: precio,
          subtotal: sub,
          tarifaIva: Number(it.tarifaIva ?? 19),
          iva,
          total: sub + iva,
        };
      });
      const total = data.total ?? subtotal + totalIva;
      // Generar número único interno
      const count = await db.facturaVenta.count({ where: { empresaId } });
      const numero = `IMP-${count + 1}`;
      await db.facturaVenta.create({
        data: {
          empresaId,
          numero,
          terceroId: t?.id ?? null,
          nombreCliente: data.clienteNombre,
          nitCliente: data.clienteNit,
          fecha: data.fecha,
          subtotalBruto: subtotal,
          subtotalNeto: subtotal,
          totalIva,
          total,
          formaPago: data.formaPago,
          estado: "vigente",
          estadoCartera: data.formaPago === "credito" ? "pendiente" : "pagada",
          saldoPendiente: data.formaPago === "credito" ? total : 0,
          detalles: { create: detalles },
        },
      });
      return "inserted";
    }

    case "facturas-compra": {
      const t = await db.tercero.findFirst({
        where: { empresaId, numeroDocumento: data.proveedorNit },
      });
      let subtotal = 0;
      let totalIva = 0;
      const detalles = (data.items as any[]).map((it: any) => {
        const cantidad = Number(it.cantidad) || 0;
        const precio = Number(it.precioUnitario) || 0;
        const sub = cantidad * precio;
        const iva = sub * ((Number(it.tarifaIva ?? 19)) / 100);
        subtotal += sub;
        totalIva += iva;
        return {
          descripcion: it.descripcion ?? "",
          cantidad,
          precioUnitario: precio,
          subtotal: sub,
          tarifaIva: Number(it.tarifaIva ?? 19),
          iva,
          total: sub + iva,
        };
      });
      const total = data.total ?? subtotal + totalIva;
      const count = await db.facturaCompra.count({ where: { empresaId } });
      const numero = `IMPC-${count + 1}`;
      await db.facturaCompra.create({
        data: {
          empresaId,
          numero,
          terceroId: t?.id ?? null,
          nombreProveedor: data.proveedorNombre,
          nitProveedor: data.proveedorNit,
          fecha: data.fecha,
          subtotal,
          totalIva,
          total,
          saldoPendiente: total,
          estadoCartera: "pendiente",
          estado: "vigente",
          detalles: { create: detalles },
        },
      });
      return "inserted";
    }

    case "usuarios-servicio": {
      const where = {
        empresaId_numeroContrato: {
          empresaId,
          numeroContrato: data.numeroContrato,
        },
      };
      const existing = await db.usuarioServicio.findUnique({ where });
      const payload = {
        empresaId,
        numeroContrato: data.numeroContrato,
        direccion: data.direccion,
        estrato: data.estrato,
        uso: data.uso,
        tarifaFija: data.tarifaFija,
        tarifaVariable: data.tarifaVariable,
        medidor: data.medidor ?? null,
      };
      if (existing) {
        await db.usuarioServicio.update({ where, data: payload });
        return "updated";
      }
      await db.usuarioServicio.create({ data: payload });
      return "inserted";
    }

    case "movimientos-contables": {
      // Agrupar por fecha+descripcion → un comprobante por fila para simplicidad.
      // Resolver cuenta por código
      const cuenta = await db.cuentaPuc.findFirst({
        where: { empresaId, codigo: String(data.cuentaCodigo) },
      });
      if (!cuenta) {
        throw new Error(`Cuenta PUC no encontrada: ${data.cuentaCodigo}`);
      }
      // Resolver tercero por NIT
      let terceroId: string | null = null;
      if (data.terceroNit) {
        const ter = await db.tercero.findFirst({
          where: { empresaId, numeroDocumento: String(data.terceroNit) },
        });
        terceroId = ter?.id ?? null;
      }
      // Crear comprobante + movimiento
      const count = await db.comprobante.count({ where: { empresaId } });
      const numero = `IMP-${count + 1}`;
      const debito = Number(data.debito) || 0;
      const credito = Number(data.credito) || 0;
      const comprobante = await db.comprobante.create({
        data: {
          empresaId,
          numero,
          tipo: "manual",
          fecha: data.fecha,
          descripcion: data.descripcion ?? "Importación masiva",
          totalDebito: debito,
          totalCredito: credito,
          diferencia: debito - credito,
          estado: "contabilizado",
          movimientos: {
            create: [
              {
                empresaId,
                cuentaId: cuenta.id,
                terceroId,
                descripcion: data.descripcion ?? null,
                debito,
                credito,
                fecha: data.fecha,
              },
            ],
          },
        },
      });
      // Actualizar saldo de la cuenta
      await db.cuentaPuc.update({
        where: { id: cuenta.id },
        data: {
          saldoActual: { increment: debito - credito },
        },
      });
      void comprobante;
      return "inserted";
    }

    case "comandas": {
      // Resolver mesa por código
      const mesa = await db.mesa.findFirst({
        where: { empresaId, codigo: String(data.mesaCodigo) },
      });
      if (!mesa) {
        throw new Error(`Mesa no encontrada: ${data.mesaCodigo}`);
      }
      // Resolver mesero por nombre (búsqueda libre en Tercero tipo=empleado o socio)
      let meseroId: string | null = null;
      if (data.mesero) {
        const mesero = await db.tercero.findFirst({
          where: {
            empresaId,
            nombre: { contains: String(data.mesero) },
          },
        });
        meseroId = mesero?.id ?? null;
      }
      let total = 0;
      const detallesData = (data.items as any[]).map((it: any) => {
        const cantidad = Number(it.cantidad) || 1;
        const precio = Number(it.precioUnitario) || 0;
        const sub = cantidad * precio;
        total += sub;
        return {
          empresaId,
          descripcion: it.descripcion ?? "",
          cantidad,
          precioUnitario: precio,
          subtotal: sub,
          estado: "solicitado",
        };
      });
      await db.comanda.create({
        data: {
          empresaId,
          mesaId: mesa.id,
          meseroId,
          estado: "abierta",
          total,
          detalles: { create: detallesData },
        },
      });
      return "inserted";
    }

    default:
      throw new Error(`Entidad no soportada: ${entity}`);
  }
}

// ============================================================
// generarPlantillaExcel — .xlsx con headers + 2 filas ejemplo
// ============================================================
export async function generarPlantillaExcel(
  targetEntity: string,
): Promise<Buffer> {
  const meta = getEntityMeta(targetEntity);
  if (!meta) {
    throw new Error(`Entidad no soportada: ${targetEntity}`);
  }
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Marsella ERP";
  wb.created = new Date();
  const ws = wb.addWorksheet(meta.label.substring(0, 30));

  // Header
  ws.columns = meta.fields.map((f) => ({
    header: f.label,
    key: f.key,
    width: 22,
  }));

  // Estilo header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" }, // emerald-700
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };

  // 2 filas ejemplo
  const ex = meta.exampleRow;
  const row2: Record<string, any> = {};
  const row3: Record<string, any> = {};
  for (const f of meta.fields) {
    row2[f.key] = ex[f.key] ?? "";
    // segunda fila variante
    if (typeof ex[f.key] === "number") {
      row3[f.key] = Number(ex[f.key]) * 2;
    } else if (typeof ex[f.key] === "string" && ex[f.key]) {
      row3[f.key] = ex[f.key] + " (ejemplo 2)";
    } else {
      row3[f.key] = ex[f.key] ?? "";
    }
  }
  ws.addRow(row2);
  ws.addRow(row3);

  // Marcar celdas requeridas en header con *
  // (estilo ya aplicado; alternativamente agregar comentario)
  meta.fields.forEach((f, idx) => {
    const cell = ws.getCell(1, idx + 1);
    if (f.required) {
      cell.note = {
        texts: [
          { "font": { bold: true }, "text": "Campo requerido" },
        ],
      };
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ============================================================
// generarCSVErrores — para descarga desde el UI
// ============================================================
export function generarCSVErrores(
  errors: ValidationError[],
  columns: string[],
  rows: any[][],
): string {
  const headers = ["Fila", "Campo", "Error", ...columns];
  const lines = [headers.map(escapeCSV).join(",")];
  for (const e of errors) {
    const rowData = rows[e.row - 2] ?? [];
    const cells = [
      String(e.row),
      e.field,
      e.error,
      ...rowData.map((c) => (c === null || c === undefined ? "" : String(c))),
    ];
    lines.push(cells.map(escapeCSV).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}

function escapeCSV(v: string): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ============================================================
// generarLogTxt — log de importación detallado
// ============================================================
export function generarLogTxt(
  entity: string,
  result: ImportResult,
  fileName: string,
): string {
  const lines: string[] = [];
  lines.push("================================================");
  lines.push(`  IMPORTACIÓN ${entity.toUpperCase()}`);
  lines.push(`  Archivo: ${fileName}`);
  lines.push(`  Fecha:    ${new Date().toISOString()}`);
  lines.push("================================================");
  lines.push("");
  lines.push(`Total filas procesadas: ${result.total}`);
  lines.push(`Insertados:             ${result.inserted}`);
  lines.push(`Actualizados:           ${result.updated}`);
  lines.push(`Fallidos:               ${result.failed}`);
  lines.push(`Duración:               ${result.durationMs} ms`);
  lines.push("");
  if (result.errors.length) {
    lines.push("--- ERRORES DETALLADOS ---");
    for (const e of result.errors) {
      lines.push(
        `  Fila ${e.row} | Campo '${e.field}' | ${e.error}${
          e.value !== undefined && e.value !== null ? ` | Valor: ${JSON.stringify(e.value)}` : ""
        }`,
      );
    }
  } else {
    lines.push("Sin errores.");
  }
  lines.push("");
  lines.push("================================================");
  return lines.join("\n");
}

// Re-exportar ENTITY_META y EntityField para conveniencia del UI
export { ENTITY_META, type EntityField };
