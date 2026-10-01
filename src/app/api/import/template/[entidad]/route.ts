import { NextRequest } from "next/server";
import { badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { generarPlantillaExcel } from "@/lib/import-excel";
import { getEntityMeta } from "@/lib/import-schemas";

// GET /api/import/template/[entidad]
// Genera y descarga el .xlsx plantilla para la entidad.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ entidad: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { entidad } = await ctx.params;
    const meta = getEntityMeta(entidad);
    if (!meta) return notFound(`Entidad no soportada: ${entidad}`);

    const buffer = await generarPlantillaExcel(entidad);
    const filename = `plantilla-${entidad}.xlsx`;
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return serverError("Error al generar plantilla", e);
  }
}

export async function POST() {
  return badRequest("Método no permitido. Use GET.");
}
