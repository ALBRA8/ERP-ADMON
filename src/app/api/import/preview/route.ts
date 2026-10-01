import { NextRequest } from "next/server";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";
import {
  parseExcelFile,
  detectarMapeoColumnas,
  validarFilas,
  type ColumnMapping,
} from "@/lib/import-excel";
import { IMPORT_SCHEMAS } from "@/lib/import-schemas";

interface PreviewBody {
  targetEntity: string;
  fileBuffer: string; // base64
  sheetName?: string;
  mapping?: Record<string, string | null>;
}

// POST /api/import/preview
// Body: { targetEntity, fileBuffer (base64), sheetName?, mapping? }
// Si no se pasa mapping, autodetecta.
// Devuelve { mapping: [{excelCol, targetField, confidence, sampleValues}], validRows, errors }
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const body = (await req.json()) as PreviewBody;
    if (!body.targetEntity || !body.fileBuffer) {
      return badRequest("targetEntity y fileBuffer son requeridos");
    }
    if (!IMPORT_SCHEMAS[body.targetEntity]) {
      return badRequest(`Entidad no soportada: ${body.targetEntity}`);
    }

    const buffer = Buffer.from(body.fileBuffer, "base64");
    const parsed = await parseExcelFile(buffer);
    if (parsed.sheets.length === 0) {
      return badRequest("El archivo no contiene hojas");
    }

    // Seleccionar sheet
    const sheet =
      (body.sheetName && parsed.sheets.find((s) => s.name === body.sheetName)) ||
      parsed.sheets[0];
    if (!sheet) {
      return badRequest("Hoja no encontrada");
    }

    // Mapeo: usar mapping del cliente o autodetectar
    let mapping: ColumnMapping[];
    let mappingDict: Record<string, string | null>;
    if (body.mapping && Object.keys(body.mapping).length > 0) {
      mapping = sheet.columns.map((col) => ({
        excelCol: col,
        targetField: body.mapping![col] ?? null,
        confidence: 1, // mapeo manual
        suggested: false,
      }));
      mappingDict = body.mapping;
    } else {
      mapping = detectarMapeoColumnas(sheet.columns, body.targetEntity);
      mappingDict = {};
      for (const m of mapping) {
        mappingDict[m.excelCol] = m.targetField;
      }
    }

    // Validar filas (solo preview limita a primeras 100)
    const previewRows = sheet.rows.slice(0, 100);
    const result = validarFilas(
      previewRows,
      sheet.columns,
      mappingDict,
      body.targetEntity,
    );

    // Sample values por columna
    const sampleValues: Record<string, any[]> = {};
    for (const col of sheet.columns) {
      const idx = sheet.columns.indexOf(col);
      sampleValues[col] = previewRows
        .slice(0, 5)
        .map((r) => r[idx])
        .filter((v) => v !== null && v !== undefined && v !== "");
    }

    const mappingOut = mapping.map((m) => ({
      excelCol: m.excelCol,
      targetField: m.targetField,
      confidence: m.confidence,
      suggested: m.suggested,
      sampleValues: sampleValues[m.excelCol] ?? [],
    }));

    return ok({
      sheetName: sheet.name,
      sheetColumns: sheet.columns,
      totalRowsInSheet: sheet.rows.length,
      previewedRows: previewRows.length,
      mapping: mappingOut,
      validRows: result.validRows.length,
      errors: result.errors.slice(0, 100), // top 100 errores
      totalErrors: result.errors.length,
      rowCount: result.rowCount,
    });
  } catch (e) {
    return serverError("Error en preview", e);
  }
}
