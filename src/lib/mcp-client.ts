// ============================================================
// mcp-client.ts — Cliente MCP del ERP Marsella
// Consume servidores MCP externos (CRM-ALBRA, bancos, e-commerce)
// usando el transporte Streamable HTTP (Web Standard).
// ============================================================
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  Resource,
  Tool,
  Prompt,
  ReadResourceResult,
  CallToolResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { logMcpCall } from "@/lib/mcp-server";

// Tipo de la conexión en DB (parcial, lo que necesitamos)
export interface MCPConexionRecord {
  id: string;
  empresaId: string;
  nombre: string;
  descripcion: string | null;
  tipoTransporte: string;
  endpoint: string;
  authTokenEnc: string | null;
  authHeader: string;
  authPrefix: string;
  resources: string | null;
  tools: string | null;
  prompts: string | null;
  activo: boolean;
  ultimoSync: Date | null;
  ultimoError: string | null;
}

export interface CatalogSync {
  resources: Resource[];
  tools: Tool[];
  prompts: Prompt[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildHeaders(conexion: MCPConexionRecord): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
  };
  if (conexion.authTokenEnc) {
    try {
      const token = decrypt(conexion.authTokenEnc);
      const header = conexion.authHeader || "Authorization";
      const prefix = conexion.authPrefix || "Bearer";
      headers[header] = `${prefix} ${token}`.trim();
    } catch {
      // token no descifrable → no agregamos header
    }
  }
  return headers;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private conexion: MCPConexionRecord;
  private cachedResources: Resource[] | null = null;
  private cachedTools: Tool[] | null = null;
  private cachedPrompts: Prompt[] | null = null;

  constructor(conexion: MCPConexionRecord) {
    this.conexion = conexion;
  }

  // Conexión con reintentos (3 intentos, backoff 1s/2s/4s)
  async connect(): Promise<void> {
    if (this.client) return;
    const headers = buildHeaders(this.conexion);
    let lastError: Error | null = null;
    for (let i = 0; i < 3; i++) {
      try {
        this.transport = new StreamableHTTPClientTransport(
          new URL(this.conexion.endpoint),
          { requestInit: { headers } },
        );
        this.client = new Client(
          { name: "marsella-erp-client", version: "1.0.0" },
          {
            capabilities: {
              sampling: {},
              roots: { listChanged: true },
            },
          },
        );
        await this.client.connect(this.transport);
        return;
      } catch (e: any) {
        lastError = e;
        // Limpieza para reintento
        this.client = null;
        this.transport = null;
        if (i < 2) await sleep(1000 * Math.pow(2, i));
      }
    }
    throw new Error(
      `No se pudo conectar a ${this.conexion.endpoint}: ${lastError?.message ?? lastError}`,
    );
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch {
      // ignore
    }
    this.client = null;
    this.transport = null;
  }

  async listResources(force = false): Promise<Resource[]> {
    if (!this.client) await this.connect();
    if (!force && this.cachedResources) return this.cachedResources;
    const result = await this.client!.listResources();
    this.cachedResources = result.resources ?? [];
    return this.cachedResources;
  }

  async listTools(force = false): Promise<Tool[]> {
    if (!this.client) await this.connect();
    if (!force && this.cachedTools) return this.cachedTools;
    const result = await this.client!.listTools();
    this.cachedTools = result.tools ?? [];
    return this.cachedTools;
  }

  async listPrompts(force = false): Promise<Prompt[]> {
    if (!this.client) await this.connect();
    if (!force && this.cachedPrompts) return this.cachedPrompts;
    const result = await this.client!.listPrompts();
    this.cachedPrompts = result.prompts ?? [];
    return this.cachedPrompts;
  }

  async syncCatalog(): Promise<CatalogSync> {
    const [resources, tools, prompts] = await Promise.all([
      this.listResources(true),
      this.listTools(true),
      this.listPrompts(true),
    ]);
    return { resources, tools, prompts };
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    if (!this.client) await this.connect();
    const start = Date.now();
    try {
      const result = await this.client!.readResource({ uri });
      await logMcpCall({
        empresaId: this.conexion.empresaId,
        conexionId: this.conexion.id,
        direccion: "outbound",
        tipo: "resource",
        nombre: uri,
        argumentos: { uri },
        resultado: result,
        duracionMs: Date.now() - start,
      });
      return result;
    } catch (e: any) {
      await logMcpCall({
        empresaId: this.conexion.empresaId,
        conexionId: this.conexion.id,
        direccion: "outbound",
        tipo: "resource",
        nombre: uri,
        argumentos: { uri },
        duracionMs: Date.now() - start,
        error: e?.message ?? String(e),
      });
      throw e;
    }
  }

  async callTool(name: string, args: object = {}): Promise<CallToolResult> {
    if (!this.client) await this.connect();
    const start = Date.now();
    try {
      const result = await this.client!.callTool({ name, arguments: args as any });
      await logMcpCall({
        empresaId: this.conexion.empresaId,
        conexionId: this.conexion.id,
        direccion: "outbound",
        tipo: "tool",
        nombre: name,
        argumentos: { name, args },
        resultado: result,
        duracionMs: Date.now() - start,
      });
      return result as CallToolResult;
    } catch (e: any) {
      await logMcpCall({
        empresaId: this.conexion.empresaId,
        conexionId: this.conexion.id,
        direccion: "outbound",
        tipo: "tool",
        nombre: name,
        argumentos: { name, args },
        duracionMs: Date.now() - start,
        error: e?.message ?? String(e),
      });
      throw e;
    }
  }

  async getPrompt(
    name: string,
    args: Record<string, string> = {},
  ): Promise<GetPromptResult> {
    if (!this.client) await this.connect();
    const start = Date.now();
    try {
      const result = await this.client!.getPrompt({ name, arguments: args });
      await logMcpCall({
        empresaId: this.conexion.empresaId,
        conexionId: this.conexion.id,
        direccion: "outbound",
        tipo: "prompt",
        nombre: name,
        argumentos: { name, args },
        resultado: result,
        duracionMs: Date.now() - start,
      });
      return result;
    } catch (e: any) {
      await logMcpCall({
        empresaId: this.conexion.empresaId,
        conexionId: this.conexion.id,
        direccion: "outbound",
        tipo: "prompt",
        nombre: name,
        argumentos: { name, args },
        duracionMs: Date.now() - start,
        error: e?.message ?? String(e),
      });
      throw e;
    }
  }
}

// ---------- Helper: carga una conexión desde la DB ----------

export async function loadConexion(
  empresaId: string,
  conexionId: string,
): Promise<MCPConexionRecord | null> {
  const c = await db.mCPConexion.findFirst({
    where: { id: conexionId, empresaId },
  });
  if (!c) return null;
  return c as unknown as MCPConexionRecord;
}

// ---------- Helper: prueba de conexión (sin guardar) ----------

export async function probarConexion(
  conexion: MCPConexionRecord,
): Promise<{ ok: boolean; catalog?: CatalogSync; error?: string; duracionMs: number }> {
  const start = Date.now();
  const client = new MCPClient(conexion);
  try {
    await client.connect();
    const catalog = await client.syncCatalog();
    return { ok: true, catalog, duracionMs: Date.now() - start };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ?? String(e),
      duracionMs: Date.now() - start,
    };
  } finally {
    await client.disconnect();
  }
}

// ---------- Helper: sincroniza catálogo y guarda en DB ----------

export async function sincronizarConexion(
  conexion: MCPConexionRecord,
): Promise<{ ok: boolean; catalog?: CatalogSync; error?: string }> {
  const client = new MCPClient(conexion);
  try {
    await client.connect();
    const catalog = await client.syncCatalog();
    await db.mCPConexion.update({
      where: { id: conexion.id },
      data: {
        resources: JSON.stringify(catalog.resources),
        tools: JSON.stringify(catalog.tools),
        prompts: JSON.stringify(catalog.prompts),
        ultimoSync: new Date(),
        ultimoError: null,
      },
    });
    return { ok: true, catalog };
  } catch (e: any) {
    await db.mCPConexion.update({
      where: { id: conexion.id },
      data: { ultimoError: e?.message ?? String(e) },
    });
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    await client.disconnect();
  }
}
