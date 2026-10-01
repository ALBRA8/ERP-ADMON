// ============================================================
// /api/mcp/conexiones/[id]/probar — prueba conexión y devuelve catálogo
// ============================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { MCPClient, loadConexion } from "@/lib/mcp-client";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await ctx.params;
    const conexion = await loadConexion(session.empresaId, id);
    if (!conexion) return notFound("Conexión no encontrada");

    const client = new MCPClient(conexion);
    const start = Date.now();
    try {
      await client.connect();
      const catalog = await client.syncCatalog();
      return ok({
        ok: true,
        duracionMs: Date.now() - start,
        catalog,
      });
    } catch (e: any) {
      return ok({
        ok: false,
        error: e?.message ?? String(e),
        duracionMs: Date.now() - start,
      });
    } finally {
      await client.disconnect();
    }
  } catch (e) {
    return serverError("Error al probar conexión MCP", e);
  }
}
