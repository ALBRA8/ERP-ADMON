// ============================================================
// /api/mcp/server-info — Metadatos del servidor MCP del propio ERP
// Devuelve URI base, listado de resources/tools/prompts, token requerido
// (solo si el usuario es admin), URLs de ejemplo para clientes externos.
// ============================================================
import { NextRequest } from "next/server";
import { ok, serverError, unauthorized, forbidden } from "@/lib/api";
import { getSession } from "@/lib/auth";
import {
  MCP_RESOURCES_INFO,
  MCP_TOOLS_INFO,
  MCP_PROMPTS_INFO,
} from "@/lib/mcp-server";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    // URL base: la del host actual + /api/mcp
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const baseUrl = `${proto}://${host}/api/mcp`;

    const tokenConfigured = !!process.env.MCP_API_TOKEN;
    const isAdmin = session.rol === "admin";

    const pythonSnippet = `from mcp import Client
from mcp.client.streamable_http import streamablehttp

async def main():
    async with streamablehttp("${baseUrl}") as (read, write, _):
        async with Client(read, write) as session:
            await session.initialize()
            # Listar tools
            tools = await session.list_tools()
            print("Tools:", [t.name for t in tools.tools])
            # Llamar a una tool
            result = await session.call_tool("consultar_balance", {})
            print("Balance:", result.content)

import asyncio
asyncio.run(main())`;

    const jsSnippet = `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("${baseUrl}"),
  { requestInit: { headers: { Authorization: "Bearer <TOKEN>" } } }
);

const client = new Client({ name: "demo-client", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
console.log("Tools:", tools.tools.map(t => t.name));

const result = await client.callTool({ name: "consultar_balance", arguments: {} });
console.log("Balance:", result.content);

await client.close();`;

    return ok({
      serverInfo: {
        name: "marsella-erp",
        version: "1.0.0",
        protocolVersion: "2025-03-26",
        baseUrl,
      },
      auth: {
        mode: "bearer",
        tokenConfigured,
        token: isAdmin && tokenConfigured ? process.env.MCP_API_TOKEN : undefined,
        jwtSupported: true,
        description:
          "Envía 'Authorization: Bearer <TOKEN>' en cada request. El token puede ser el fijo (MCP_API_TOKEN) o un JWT de sesión del ERP.",
      },
      resources: MCP_RESOURCES_INFO,
      tools: MCP_TOOLS_INFO,
      prompts: MCP_PROMPTS_INFO,
      examples: {
        curl: `curl -X POST ${baseUrl} \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'`,
        python: pythonSnippet,
        javascript: jsSnippet,
      },
    });
  } catch (e) {
    return serverError("Error al obtener server-info", e);
  }
}

// El endpoint no debe exponer el token a usuarios no-admin
export async function POST() {
  return forbidden("Usa GET");
}
