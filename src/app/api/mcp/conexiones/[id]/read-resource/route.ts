// ============================================================
// /api/mcp/conexiones/[id]/read-resource — lee resource externo
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
    const { uri } = body;
    if (!uri) return badRequest("uri requerido");

    const client = new MCPClient(conexion);
    try {
      await client.connect();
      const result = await client.readResource(String(uri));
      return ok({ ok: true, result });
    } catch (e: any) {
      return ok({ ok: false, error: e?.message ?? String(e) });
    } finally {
      await client.disconnect();
    }
  } catch (e) {
    return serverError("Error al leer resource MCP", e);
  }
}
