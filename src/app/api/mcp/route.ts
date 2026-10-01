// ============================================================
// /api/mcp/route.ts — Endpoint del servidor MCP del ERP
// Transporte: Streamable HTTP (Web Standard) sobre /api/mcp.
// Autenticación: Bearer token MCP_API_TOKEN o JWT de sesión.
// ============================================================
import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, logMcpCall } from "@/lib/mcp-server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_API_TOKEN = process.env.MCP_API_TOKEN ?? "";
const MCP_EMPRESA_ID = process.env.MCP_EMPRESA_ID ?? "";

// Sesiones activas: sessionId → contexto
const sessions = new Map<
  string,
  {
    transport: WebStandardStreamableHTTPServerTransport;
    empresaId: string;
    userId?: string;
  }
>();

interface AuthResult {
  ok: boolean;
  empresaId?: string;
  userId?: string;
  error?: string;
}

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth) {
    return { ok: false, error: "Falta header Authorization" };
  }
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      error: "Authorization mal formado (esperado: Bearer <token>)",
    };
  }
  const token = match[1];

  // 1. ¿Coincide con el token fijo MCP_API_TOKEN?
  if (MCP_API_TOKEN && token === MCP_API_TOKEN) {
    let empresaId = MCP_EMPRESA_ID || undefined;
    if (!empresaId) {
      const emp = await db.empresa.findFirst({ select: { id: true } });
      if (!emp) return { ok: false, error: "No hay empresas configuradas" };
      empresaId = emp.id;
    }
    return { ok: true, empresaId };
  }

  // 2. ¿Es un JWT válido?
  const session = await verifyToken(token);
  if (session) {
    return { ok: true, empresaId: session.empresaId, userId: session.userId };
  }

  return { ok: false, error: "Token inválido" };
}

// POST: requests JSON-RPC (initialize, tools/list, tools/call, etc.)
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok || !auth.empresaId) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: auth.error ?? "No autorizado" },
        id: null,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const sessionId = req.headers.get("mcp-session-id") ?? undefined;
  let session = sessionId ? sessions.get(sessionId) : undefined;

  const method = (body as any)?.method;
  const isInit = !session && method === "initialize";

  if (isInit || !session) {
    // Crear nuevo transport y servidor
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () =>
        crypto.randomUUID().replace(/-/g, "").slice(0, 32),
      onsessioninitialized: (sid) => {
        sessions.set(sid, {
          transport,
          empresaId: auth.empresaId!,
          userId: auth.userId,
        });
      },
      onsessionclosed: (sid) => {
        sessions.delete(sid);
      },
    });

    const server = createMcpServer({
      empresaId: auth.empresaId!,
      userId: auth.userId,
    });

    try {
      await server.connect(transport);
    } catch (e: any) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Server connect failed: ${e?.message ?? e}`,
          },
          id: (body as any)?.id ?? null,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Procesar request
    const response = await transport.handleRequest(req, { parsedBody: body });
    await logMcpCall({
      empresaId: auth.empresaId!,
      direccion: "inbound",
      tipo: "tool",
      nombre: method ?? "unknown",
      argumentos: body,
      userId: auth.userId,
    });
    return response;
  }

  // Sesión existente
  try {
    const response = await session!.transport.handleRequest(req, {
      parsedBody: body,
    });
    await logMcpCall({
      empresaId: session!.empresaId,
      direccion: "inbound",
      tipo: "tool",
      nombre: method ?? "unknown",
      argumentos: body,
      userId: session!.userId,
    });
    return response;
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: e?.message ?? "Internal error" },
        id: (body as any)?.id ?? null,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// GET: SSE stream (para que el server envíe mensajes asíncronos al cliente)
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok || !auth.empresaId) {
    return new Response(
      JSON.stringify({ error: auth.error ?? "No autorizado" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  const sessionId = req.headers.get("mcp-session-id") ?? undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    return new Response(
      JSON.stringify({
        error: "Sesión no encontrada. Inicialice primero con POST /api/mcp",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  const session = sessions.get(sessionId)!;
  try {
    return await session.transport.handleRequest(req);
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Error en SSE" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// DELETE: cerrar sesión
export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok || !auth.empresaId) {
    return new Response(
      JSON.stringify({ error: auth.error ?? "No autorizado" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  const sessionId = req.headers.get("mcp-session-id") ?? undefined;
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
  }
  return new Response(null, { status: 204 });
}
