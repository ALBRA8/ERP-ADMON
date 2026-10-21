// ============================================================
// /api/mcp/conexiones/[id]/get-prompt — obtiene prompt externo
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

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const { prompt, args } = body;
    if (!prompt) return badRequest("prompt requerido");

    const client = new MCPClient(conexion);
    try {
      await client.connect();
      const result = await client.getPrompt(String(prompt), args ?? {});
      return ok({ ok: true, result });
    } catch (e: any) {
      return ok({ ok: false, error: e?.message ?? String(e) });
    } finally {
      await client.disconnect();
    }
  } catch (e) {
    return serverError("Error al obtener prompt MCP", e);
  }
}
