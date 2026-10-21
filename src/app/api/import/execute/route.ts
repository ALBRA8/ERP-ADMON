import { NextRequest } from "next/server";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { getSession, requirePermission } from "@/lib/auth";
import {
  parseExcelFile,
  detectarMapeoColumnas,
  validarFilas,
  importToEntity,
  type ImportResult,
} from "@/lib/import-excel";
import { IMPORT_SCHEMAS } from "@/lib/import-schemas";
import { auditAction } from "@/lib/tenant";

interface ExecuteBody {
  targetEntity: string;
  fileBuffer: string; // base64
  sheetName?: string;
  mapping?: Record<string, string | null>;
  fileName?: string;
}

// POST /api/import/execute
// Body: { targetEntity, fileBuffer (base64), mapping, sheetName }
// Hace todo el flujo: parse → mapeo → validación → importación
// Devuelve { inserted, updated, failed, errors, total, durationMs }
export async function POST(req: NextRequest) {
  const startTotal = Date.now();
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // FIX-SEGURIDAD H-CRIT-003: RBAC — importaciones:write (solo admin/contador).
    const denied = await requirePermission(session, "importaciones:write");
    if (denied) return denied;

    const body = (await req.json()) as ExecuteBody;
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
    const sheet =
      (body.sheetName && parsed.sheets.find((s) => s.name === body.sheetName)) ||
      parsed.sheets[0];
    if (!sheet) {
      return badRequest("Hoja no encontrada");
    }

    // Mapeo
    let mappingDict: Record<string, string | null>;
    if (body.mapping && Object.keys(body.mapping).length > 0) {
      mappingDict = body.mapping;
    } else {
      const autoMapping = detectarMapeoColumnas(sheet.columns, body.targetEntity);
      mappingDict = {};
      for (const m of autoMapping) {
        mappingDict[m.excelCol] = m.targetField;
      }
    }

    // Validar TODAS las filas
    const result = validarFilas(
      sheet.rows,
      sheet.columns,
      mappingDict,
      body.targetEntity,
    );

    if (result.validRows.length === 0) {
      return ok({
        inserted: 0,
        updated: 0,
        failed: result.errors.length,
        total: 0,
        errors: result.errors.slice(0, 200),
        totalErrors: result.errors.length,
        durationMs: Date.now() - startTotal,
        message: "No hay filas válidas para importar",
      } as ImportResult & { totalErrors: number; message: string });
    }

    // Importar
    const importRes = await importToEntity(
      body.targetEntity,
      result.validRows,
      session,
    );

    // Persistir auditoría en AuditoriaMultiTenant
    try {
      await auditAction(
        session,
        "import_excel",
        body.targetEntity,
        undefined,
        {
          entity: body.targetEntity,
          fileName: body.fileName,
          totalRows: importRes.total,
          inserted: importRes.inserted,
          updated: importRes.updated,
          failed: importRes.failed,
          durationMs: importRes.durationMs,
          summary: `Importación masiva Excel: ${body.fileName ?? "archivo.xlsx"} (${importRes.inserted} ins, ${importRes.updated} act, ${importRes.failed} fall)`,
        },
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        req.headers.get("user-agent")?.slice(0, 200) ?? null,
      );
    } catch {
      // no crítico
    }

    return ok({
      ...importRes,
      errors: importRes.errors.slice(0, 200),
      totalErrors: importRes.errors.length,
      durationMs: Date.now() - startTotal,
      validRowsCount: result.validRows.length,
      totalValidationErrors: result.errors.length,
    });
  } catch (e: any) {
    return serverError("Error al ejecutar importación", e);
  }
}
