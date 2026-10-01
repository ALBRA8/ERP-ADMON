import { NextRequest } from "next/server";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { parseExcelFile } from "@/lib/import-excel";

// POST /api/import/parse — recibe multipart/form-data con 'file' (.xlsx)
// Devuelve { sheets, columns, rows, totalRows } sin persistir nada.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return badRequest(
        "Se requiere multipart/form-data con un campo 'file' (.xlsx)",
      );
    }
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return badRequest("Archivo 'file' requerido (multipart/form-data con campo file)");
    }
    if (file.size === 0) {
      return badRequest("El archivo está vacío");
    }
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      return badRequest("El archivo debe ser .xlsx o .xls");
    }
    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);
    const parsed = await parseExcelFile(buffer);
    // Para el preview limitamos rows a 100 (preview only)
    const sheetsPreview = parsed.sheets.map((s) => ({
      name: s.name,
      columns: s.columns,
      rows: s.rows.slice(0, 100),
      rowCount: s.rows.length,
    }));
    return ok({
      sheets: sheetsPreview,
      totalRows: parsed.totalRows,
      fileName: file.name,
    });
  } catch (e) {
    return serverError("Error al parsear Excel", e);
  }
}
