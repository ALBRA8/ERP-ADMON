import { ok, serverError, unauthorized } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { ENTITY_META } from "@/lib/import-schemas";

// GET /api/import/entities
// Lista las entidades soportadas para importar con sus campos requeridos.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const list = ENTITY_META.map((e) => ({
      key: e.key,
      label: e.label,
      description: e.description,
      fields: e.fields.map((f) => ({
        key: f.key,
        label: f.label,
        required: f.required,
        example: f.example ?? "",
      })),
      exampleRow: e.exampleRow,
    }));
    return ok({ entities: list, total: list.length });
  } catch (e) {
    return serverError("Error al listar entidades", e);
  }
}
