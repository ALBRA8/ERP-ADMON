// ============================================================
// /api/mcp/conexiones/[id]/sincronizar — sincroniza catálogo y guarda
// ============================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { sincronizarConexion, loadConexion } from "@/lib/mcp-client";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await ctx.params;
    const conexion = await loadConexion(session.empresaId, id);
    if (!conexion) return notFound("Conexión no encontrada");

    const result = await sincronizarConexion(conexion);
    return ok(result);
  } catch (e) {
    return serverError("Error al sincronizar conexión MCP", e);
  }
}
