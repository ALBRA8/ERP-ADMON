// ============================================================
// /api/mcp/conexiones/[id]/call-tool — invoca tool en servidor externo
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

    const body = await req.json();
    const { tool, args } = body;
    if (!tool) return badRequest("tool requerido");

    const client = new MCPClient(conexion);
    try {
      await client.connect();
      const result = await client.callTool(String(tool), args ?? {});
      return ok({ ok: true, result });
    } catch (e: any) {
      return ok({ ok: false, error: e?.message ?? String(e) });
    } finally {
      await client.disconnect();
    }
  } catch (e) {
    return serverError("Error al llamar tool MCP", e);
  }
}
