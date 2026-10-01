"use client";

// ============================================================
// ERP Marsella — Vista MCP (Model Context Protocol)
// Servidor (lo que ofrezco) | Conexiones externas | Auditoría | Documentación
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Plug,
  Server,
  Network,
  ScrollText,
  BookOpen,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Play,
  Copy,
  Check,
  ExternalLink,
  Activity,
  ShieldCheck,
  Key,
  Code,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---------- Tipos ----------
interface CatalogItem {
  uri?: string;
  name: string;
  description?: string;
  mimeType?: string;
  inputSchema?: any;
  arguments?: any[];
}

interface ServerInfo {
  serverInfo: { name: string; version: string; protocolVersion: string; baseUrl: string };
  auth: {
    mode: string;
    tokenConfigured: boolean;
    token?: string;
    jwtSupported: boolean;
    description: string;
  };
  resources: CatalogItem[];
  tools: CatalogItem[];
  prompts: CatalogItem[];
  examples: { curl: string; python: string; javascript: string };
}

interface ConexionItem {
  id: string;
  empresaId: string;
  nombre: string;
  descripcion: string | null;
  tipoTransporte: string;
  endpoint: string;
  authHeader: string;
  authPrefix: string;
  hasAuthToken: boolean;
  resourcesCount: number;
  toolsCount: number;
  promptsCount: number;
  resourcesList: CatalogItem[];
  toolsList: CatalogItem[];
  promptsList: CatalogItem[];
  activo: boolean;
  ultimoSync: string | null;
  ultimoError: string | null;
  createdAt: string;
}

interface LogItem {
  id: string;
  empresaId: string;
  conexionId: string | null;
  conexion?: { nombre: string; endpoint: string } | null;
  direccion: string;
  tipo: string;
  nombre: string;
  argumentos: string | null;
  resultado: string | null;
  duracionMs: number | null;
  userId: string | null;
  error: string | null;
  createdAt: string;
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(d));
  } catch {
    return String(d);
  }
}

function prettyJson(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copiado al portapapeles");
}

// ============================================================
// Componente principal
// ============================================================
export function McpView() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        <h1 className="text-xl font-bold">MCP · Model Context Protocol</h1>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 -mt-2">
        Conecta el ERP con LLMs y sistemas externos vía el estándar MCP de Anthropic.
      </p>

      <Tabs defaultValue="server" className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
          <TabsTrigger value="server">
            <Server className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Servidor MCP</span>
            <span className="sm:hidden">Servidor</span>
          </TabsTrigger>
          <TabsTrigger value="conexiones">
            <Network className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Conexiones</span>
            <span className="sm:hidden">Conex.</span>
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Auditoría</span>
            <span className="sm:hidden">Logs</span>
          </TabsTrigger>
          <TabsTrigger value="docs">
            <BookOpen className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Documentación</span>
            <span className="sm:hidden">Docs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="server" className="space-y-4">
          <ServerTab />
        </TabsContent>
        <TabsContent value="conexiones" className="space-y-4">
          <ConexionesTab />
        </TabsContent>
        <TabsContent value="logs" className="space-y-4">
          <LogsTab />
        </TabsContent>
        <TabsContent value="docs" className="space-y-4">
          <DocsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Tab 1 — Servidor MCP (lo que ofrezco)
// ============================================================
function ServerTab() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/mcp/server-info");
      const d = await r.json();
      setInfo(d);
      setTokenInput(d?.auth?.token ?? "");
    } catch (e: any) {
      toast.error("Error al cargar info del servidor", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-neutral-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Cargando servidor MCP…
        </CardContent>
      </Card>
    );
  }

  if (!info) {
    return (
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>No se pudo cargar la info del servidor.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Server info card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {info.serverInfo.name}
                <Badge variant="secondary" className="font-mono text-xs">
                  v{info.serverInfo.version}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Protocolo MCP {info.serverInfo.protocolVersion} · Transporte Streamable HTTP
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Refrescar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-neutral-500">URL base (endpoint SSE/HTTP)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                readOnly
                value={info.serverInfo.baseUrl}
                className="font-mono text-xs bg-neutral-50 dark:bg-neutral-900"
              />
              <Button variant="outline" size="sm" onClick={() => copy(info.serverInfo.baseUrl)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
              <CardContent className="pt-4">
                <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  Resources
                </div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {info.resources.length}
                </div>
                <div className="text-xs text-neutral-500">Datos que se pueden leer</div>
              </CardContent>
            </Card>
            <Card className="bg-teal-50/50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900">
              <CardContent className="pt-4">
                <div className="text-xs text-teal-700 dark:text-teal-400 font-medium">
                  Tools
                </div>
                <div className="text-2xl font-bold text-teal-700 dark:text-teal-300">
                  {info.tools.length}
                </div>
                <div className="text-xs text-neutral-500">Acciones ejecutables</div>
              </CardContent>
            </Card>
            <Card className="bg-cyan-50/50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-900">
              <CardContent className="pt-4">
                <div className="text-xs text-cyan-700 dark:text-cyan-400 font-medium">
                  Prompts
                </div>
                <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">
                  {info.prompts.length}
                </div>
                <div className="text-xs text-neutral-500">Plantillas para LLM</div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Token card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Token de acceso
          </CardTitle>
          <CardDescription>
            Compártelo con sistemas externos. Cualquiera con el token puede acceder al servidor MCP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {info.auth.tokenConfigured ? (
            <>
              <div className="flex gap-2">
                <Input
                  readOnly
                  type={showToken ? "text" : "password"}
                  value={tokenInput || "••••••••••••••••••••••••••"}
                  className="font-mono text-xs bg-neutral-50 dark:bg-neutral-900"
                />
                <Button variant="outline" size="sm" onClick={() => setShowToken((s) => !s)}>
                  {showToken ? "Ocultar" : "Ver"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copy(tokenInput || "")}
                  disabled={!tokenInput}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              {info.auth.jwtSupported && (
                <div className="flex items-start gap-2 text-xs text-neutral-500">
                  <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-500" />
                  <span>
                    También acepta JWT de sesión del ERP (<code className="font-mono">Authorization: Bearer &lt;jwt&gt;</code>).
                    Un usuario autenticado puede consumir el MCP sin configurar token extra.
                  </span>
                </div>
              )}
            </>
          ) : (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertTitle>Token no configurado</AlertTitle>
              <AlertDescription>
                Define <code className="font-mono text-xs">MCP_API_TOKEN</code> en{" "}
                <code className="font-mono text-xs">.env</code> para permitir acceso externo.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Resources disponibles
          </CardTitle>
          <CardDescription>URIs que un cliente puede leer (GET).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {info.resources.map((r, i) => (
            <ResourceCard key={i} item={r} />
          ))}
        </CardContent>
      </Card>

      {/* Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Tools disponibles
          </CardTitle>
          <CardDescription>Acciones que un cliente puede invocar (POST).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {info.tools.map((t, i) => (
            <ToolCard key={i} item={t} />
          ))}
        </CardContent>
      </Card>

      {/* Prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            Prompts disponibles
          </CardTitle>
          <CardDescription>Plantillas de instrucciones para LLMs.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {info.prompts.map((p, i) => (
            <Card key={i} className="border-neutral-200 dark:border-neutral-800">
              <CardContent className="pt-4">
                <div className="font-mono text-xs text-cyan-700 dark:text-cyan-300 font-semibold">
                  {p.name}
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  {p.description}
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Snippets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Code className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Ejemplos de cliente
          </CardTitle>
          <CardDescription>
            Snippets listos para que un sistema externo se conecte al ERP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SnippetBlock title="cURL" lang="bash" code={info.examples.curl} />
          <SnippetBlock title="Python (mcp SDK)" lang="python" code={info.examples.python} />
          <SnippetBlock
            title="JavaScript / TypeScript (@modelcontextprotocol/sdk)"
            lang="javascript"
            code={info.examples.javascript}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SnippetBlock({ title, lang, code }: { title: string; lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-900 px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {lang}
          </Badge>
          <span className="text-xs font-medium">{title}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            toast.success("Copiado");
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-600" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </Button>
      </div>
      <pre className="p-3 text-xs overflow-x-auto max-h-80 bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ResourceCard({ item }: { item: CatalogItem }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Para resources de plantilla, pedir un valor para los parámetros
  const uri = item.uri ?? "";
  const hasTemplate = uri.includes("{");
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});

  const extractParams = (u: string): string[] => {
    const matches = u.match(/\{(\w+)\}/g) ?? [];
    return matches.map((m) => m.replace(/[{}]/g, ""));
  };
  const params = extractParams(uri);

  const buildUri = () => {
    let result = uri;
    for (const p of params) {
      result = result.replace(`{${p}}`, templateValues[p] ?? "");
    }
    return result;
  };

  async function probar() {
    setLoading(true);
    setOpen(true);
    setResult(null);
    try {
      const targetUri = buildUri();
      // Llamada interna: invocar via tool MCP del propio servidor
      const r = await fetch("/api/mcp/server-info");
      const _info = await r.json();
      // Aquí no podemos leer directamente el resource sin un cliente MCP;
      // exponemos una API simple vía POST a server-info que ejecute la lectura.
      // Como simplificación: si es lista (sin template), devolvemos un resumen del catálogo.
      const resp = await fetch("/api/mcp/server-info", { method: "POST" });
      const d = await resp.json();
      setResult({ uri: targetUri, note: "Para probar un resource, conéctese vía cliente MCP externo o usa la API HTTP directamente.", info: d });
    } catch (e: any) {
      setResult({ error: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-neutral-200 dark:border-neutral-800 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors">
      <CardContent className="pt-4 space-y-2">
        <div className="font-mono text-xs text-emerald-700 dark:text-emerald-300 break-all">
          {uri}
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          {item.description}
        </div>
        {item.mimeType && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {item.mimeType}
          </Badge>
        )}
        {hasTemplate && params.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="text-[10px] uppercase text-neutral-500">Parámetros</div>
            {params.map((p) => (
              <Input
                key={p}
                placeholder={p}
                className="h-7 text-xs"
                value={templateValues[p] ?? ""}
                onChange={(e) =>
                  setTemplateValues((v) => ({ ...v, [p]: e.target.value }))
                }
              />
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={probar} className="w-full h-7 text-xs">
          {loading ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
          Probar
        </Button>
        {open && result !== null && (
          <pre className="text-[10px] bg-neutral-50 dark:bg-neutral-950 rounded p-2 max-h-40 overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function ToolCard({ item }: { item: CatalogItem }) {
  const [open, setOpen] = useState(false);
  const [argsText, setArgsText] = useState("{}");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function ejecutar() {
    setLoading(true);
    setOpen(true);
    setResult(null);
    try {
      const args = JSON.parse(argsText || "{}");
      // Llama internamente a nuestro propio servidor MCP via call-tool
      // Como no hay conexión guardada para el propio server, ejecutamos vía fetch directo
      // simulando lo que haría un cliente externo:
      setResult({ info: "Tool ejecutable vía cliente MCP externo (ver snippets arriba).", tool: item.name, args });
    } catch (e: any) {
      setResult({ error: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-neutral-200 dark:border-neutral-800 hover:border-teal-300 dark:hover:border-teal-800 transition-colors">
      <CardContent className="pt-4 space-y-2">
        <div className="font-mono text-xs text-teal-700 dark:text-teal-300 font-semibold">
          {item.name}
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          {item.description}
        </div>
        {item.inputSchema && (
          <details className="text-[10px] text-neutral-500">
            <summary className="cursor-pointer">inputSchema</summary>
            <pre className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded mt-1 overflow-x-auto max-h-40">
              {JSON.stringify(item.inputSchema, null, 2)}
            </pre>
          </details>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen((o) => !o)}
          className="w-full h-7 text-xs"
        >
          <Play className="w-3 h-3 mr-1" />
          Probar
        </Button>
        {open && (
          <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <Label className="text-[10px] uppercase text-neutral-500">
              Argumentos (JSON)
            </Label>
            <Textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              className="text-xs font-mono h-20"
            />
            <Button size="sm" onClick={ejecutar} disabled={loading} className="w-full h-7 text-xs">
              {loading ? (
                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Play className="w-3 h-3 mr-1" />
              )}
              Ejecutar
            </Button>
            {result !== null && (
              <pre className="text-[10px] bg-neutral-50 dark:bg-neutral-950 rounded p-2 max-h-40 overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 2 — Conexiones externas
// ============================================================
function ConexionesTab() {
  const [items, setItems] = useState<ConexionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ConexionItem | null>(null);
  const [selected, setSelected] = useState<ConexionItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/mcp/conexiones");
      const d = await r.json();
      setItems(d.items ?? []);
    } catch (e: any) {
      toast.error("Error al cargar conexiones", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function probar(c: ConexionItem) {
    toast.loading("Probando conexión…", { id: `pr-${c.id}` });
    try {
      const r = await fetch(`/api/mcp/conexiones/${c.id}/probar`, { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        toast.success(`Conexión OK · ${d.duracionMs}ms`, {
          id: `pr-${c.id}`,
          description: `${d.catalog?.resources?.length ?? 0} res · ${d.catalog?.tools?.length ?? 0} tools · ${d.catalog?.prompts?.length ?? 0} prompts`,
        });
        load();
      } else {
        toast.error("Error en la conexión", {
          id: `pr-${c.id}`,
          description: d.error,
        });
      }
    } catch (e: any) {
      toast.error("Error", { id: `pr-${c.id}`, description: e?.message });
    }
  }

  async function sincronizar(c: ConexionItem) {
    toast.loading("Sincronizando catálogo…", { id: `sy-${c.id}` });
    try {
      const r = await fetch(`/api/mcp/conexiones/${c.id}/sincronizar`, { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        toast.success("Catálogo sincronizado", {
          id: `sy-${c.id}`,
          description: `${d.catalog?.resources?.length ?? 0} res · ${d.catalog?.tools?.length ?? 0} tools · ${d.catalog?.prompts?.length ?? 0} prompts`,
        });
        load();
      } else {
        toast.error("Error al sincronizar", { id: `sy-${c.id}`, description: d.error });
      }
    } catch (e: any) {
      toast.error("Error", { id: `sy-${c.id}`, description: e?.message });
    }
  }

  async function eliminar(c: ConexionItem) {
    if (!confirm(`¿Eliminar conexión "${c.nombre}"?`)) return;
    try {
      await fetch(`/api/mcp/conexiones?id=${c.id}`, { method: "DELETE" });
      toast.success("Conexión eliminada");
      load();
    } catch (e: any) {
      toast.error("Error al eliminar", { description: e?.message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Conexiones externas</h2>
          <p className="text-xs text-neutral-500">
            Servidores MCP que el ERP consume (CRM, bancos, e-commerce, etc.)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Nueva conexión
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-neutral-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
            Cargando conexiones…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Network className="w-10 h-10 text-neutral-300 mx-auto" />
            <div className="text-neutral-500">No hay conexiones MCP externas configuradas.</div>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Crear la primera
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors"
              onClick={() => setSelected(c)}
            >
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.nombre}</div>
                    <div className="text-xs text-neutral-500 truncate">{c.endpoint}</div>
                  </div>
                  <Badge
                    variant={c.activo ? "default" : "outline"}
                    className={
                      c.activo
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : ""
                    }
                  >
                    {c.activo ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                {c.descripcion && (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                    {c.descripcion}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {c.resourcesCount} res
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {c.toolsCount} tools
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {c.promptsCount} prompts
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {c.tipoTransporte}
                  </Badge>
                </div>
                {c.ultimoError && (
                  <div className="text-[10px] text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span className="truncate">{c.ultimoError}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      probar(c);
                    }}
                  >
                    <Activity className="w-3 h-3 mr-1" />
                    Probar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      sincronizar(c);
                    }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Sync
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(c);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-500 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      eliminar(c);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-[10px] text-neutral-400">
                  Último sync: {formatDateTime(c.ultimoSync)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DialogConexion
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => load()}
      />

      <SheetConexion conexion={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DialogConexion({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ConexionItem | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    tipoTransporte: "sse" as "sse" | "websocket" | "stdio",
    endpoint: "",
    authToken: "",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    activo: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        nombre: editing.nombre,
        descripcion: editing.descripcion ?? "",
        tipoTransporte: editing.tipoTransporte as any,
        endpoint: editing.endpoint,
        authToken: "", // no se devuelve, dejar vacío = no cambiar
        authHeader: editing.authHeader,
        authPrefix: editing.authPrefix,
        activo: editing.activo,
      });
    } else {
      setForm({
        nombre: "",
        descripcion: "",
        tipoTransporte: "sse",
        endpoint: "",
        authToken: "",
        authHeader: "Authorization",
        authPrefix: "Bearer",
        activo: true,
      });
    }
  }, [editing, open]);

  async function guardar() {
    if (!form.nombre || !form.endpoint) {
      toast.error("Nombre y endpoint son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const body: any = { ...form };
      if (!body.authToken) delete body.authToken;
      if (editing) {
        body.id = editing.id;
        const r = await fetch("/api/mcp/conexiones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        toast.success("Conexión actualizada");
      } else {
        const r = await fetch("/api/mcp/conexiones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        toast.success("Conexión creada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error("Error al guardar", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar conexión" : "Nueva conexión MCP"}</DialogTitle>
          <DialogDescription>
            Configura un servidor MCP externo (CRM, banco, e-commerce).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>Nombre</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="CRM-ALBRA, Banco BBVA, Shopify…"
            />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Descripción opcional"
            />
          </div>
          <div>
            <Label>Endpoint (URL)</Label>
            <Input
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="https://crm.albra.co/api/mcp"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Transporte</Label>
              <Select
                value={form.tipoTransporte}
                onValueChange={(v) =>
                  setForm({ ...form, tipoTransporte: v as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sse">SSE / HTTP</SelectItem>
                  <SelectItem value="websocket">WebSocket</SelectItem>
                  <SelectItem value="stdio">stdio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={form.activo}
                  onCheckedChange={(v) => setForm({ ...form, activo: v })}
                />
                <span className="text-xs text-neutral-500">
                  {form.activo ? "Activa" : "Inactiva"}
                </span>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500 mb-2">
              Autenticación (opcional)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Auth header</Label>
                <Input
                  value={form.authHeader}
                  onChange={(e) =>
                    setForm({ ...form, authHeader: e.target.value })
                  }
                  placeholder="Authorization"
                />
              </div>
              <div>
                <Label>Auth prefix</Label>
                <Input
                  value={form.authPrefix}
                  onChange={(e) =>
                    setForm({ ...form, authPrefix: e.target.value })
                  }
                  placeholder="Bearer"
                />
              </div>
            </div>
            <div className="mt-2">
              <Label>
                Auth token{" "}
                {editing && (
                  <span className="text-[10px] text-neutral-400">
                    (dejar vacío = no cambiar)
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={form.authToken}
                onChange={(e) =>
                  setForm({ ...form, authToken: e.target.value })
                }
                placeholder="Token secreto (se cifra AES-256-GCM)"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving && <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />}
            {editing ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetConexion({
  conexion,
  onClose,
}: {
  conexion: ConexionItem | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"resources" | "tools" | "prompts">("resources");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [argsText, setArgsText] = useState("{}");
  const [activeItem, setActiveItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    if (conexion) {
      setTab("resources");
      setResult(null);
      setActiveItem(null);
      setArgsText("{}");
    }
  }, [conexion]);

  if (!conexion) return null;

  const resources: CatalogItem[] = conexion.resourcesList ?? [];
  const tools: CatalogItem[] = conexion.toolsList ?? [];
  const prompts: CatalogItem[] = conexion.promptsList ?? [];

  async function ejecutar() {
    if (!activeItem || !conexion) return;
    setLoading(true);
    setResult(null);
    try {
      const args = JSON.parse(argsText || "{}");
      let r: Response;
      if (tab === "resources") {
        r = await fetch(`/api/mcp/conexiones/${conexion.id}/read-resource`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uri: activeItem.uri ?? activeItem.name }),
        });
      } else if (tab === "tools") {
        r = await fetch(`/api/mcp/conexiones/${conexion.id}/call-tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: activeItem.name, args }),
        });
      } else {
        r = await fetch(`/api/mcp/conexiones/${conexion.id}/get-prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: activeItem.name, args }),
        });
      }
      const d = await r.json();
      setResult(d);
    } catch (e: any) {
      setResult({ error: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={!!conexion} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Network className="w-4 h-4 text-emerald-600" />
            {conexion.nombre}
          </SheetTitle>
          <SheetDescription className="space-y-1">
            <div className="font-mono text-xs">{conexion.endpoint}</div>
            <div className="flex gap-1 flex-wrap mt-1">
              <Badge variant="outline" className="text-[10px]">
                {resources.length} resources
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {tools.length} tools
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {prompts.length} prompts
              </Badge>
            </div>
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
          </TabsList>

          <TabsContent value="resources" className="mt-3 space-y-2">
            {resources.length === 0 ? (
              <div className="text-xs text-neutral-500 py-6 text-center">
                Sin resources cacheados. Sincroniza el catálogo.
              </div>
            ) : (
              resources.map((r, i) => (
                <CatalogRow
                  key={i}
                  item={r}
                  active={activeItem === r}
                  onClick={() => {
                    setActiveItem(r);
                    setArgsText("{}");
                    setResult(null);
                  }}
                />
              ))
            )}
          </TabsContent>
          <TabsContent value="tools" className="mt-3 space-y-2">
            {tools.length === 0 ? (
              <div className="text-xs text-neutral-500 py-6 text-center">
                Sin tools cacheados. Sincroniza el catálogo.
              </div>
            ) : (
              tools.map((t, i) => (
                <CatalogRow
                  key={i}
                  item={t}
                  active={activeItem === t}
                  onClick={() => {
                    setActiveItem(t);
                    setArgsText(
                      t.inputSchema ? JSON.stringify(t.inputSchema, null, 2) : "{}",
                    );
                    setResult(null);
                  }}
                />
              ))
            )}
          </TabsContent>
          <TabsContent value="prompts" className="mt-3 space-y-2">
            {prompts.length === 0 ? (
              <div className="text-xs text-neutral-500 py-6 text-center">
                Sin prompts cacheados. Sincroniza el catálogo.
              </div>
            ) : (
              prompts.map((p, i) => (
                <CatalogRow
                  key={i}
                  item={p}
                  active={activeItem === p}
                  onClick={() => {
                    setActiveItem(p);
                    setArgsText("{}");
                    setResult(null);
                  }}
                />
              ))
            )}
          </TabsContent>
        </Tabs>

        {activeItem && (
          <div className="mt-4 space-y-2">
            <Label className="text-xs uppercase text-neutral-500">
              {tab === "resources" ? "URI" : tab === "tools" ? "Argumentos JSON" : "Argumentos JSON"}
            </Label>
            {tab === "resources" ? (
              <Input
                readOnly
                value={activeItem.uri ?? activeItem.name}
                className="font-mono text-xs"
              />
            ) : (
              <Textarea
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                className="text-xs font-mono h-24"
              />
            )}
            <Button size="sm" onClick={ejecutar} disabled={loading} className="w-full">
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5" />
              )}
              Ejecutar
            </Button>
            {result !== null && (
              <div className="space-y-1">
                <Label className="text-xs uppercase text-neutral-500">Resultado</Label>
                <pre className="text-[10px] bg-neutral-50 dark:bg-neutral-950 rounded p-2 max-h-60 overflow-auto border border-neutral-200 dark:border-neutral-800">
                  {prettyJson(JSON.stringify(result))}
                </pre>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function parseCatalog(_c: ConexionItem, _kind: "resources" | "tools" | "prompts"): CatalogItem[] {
  // Obsoleto: ahora los catálogos vienen en el item directamente.
  return [];
}

function CatalogRow({
  item,
  active,
  onClick,
}: {
  item: CatalogItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border p-2 transition-colors ${
        active
          ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
          : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
      }`}
    >
      <div className="font-mono text-xs text-emerald-700 dark:text-emerald-300 truncate">
        {item.uri ?? item.name}
      </div>
      {item.description && (
        <div className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
          {item.description}
        </div>
      )}
    </button>
  );
}

// ============================================================
// Tab 3 — Log de auditoría
// ============================================================
function LogsTab() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    direccion: "",
    tipo: "",
  });
  const [selected, setSelected] = useState<LogItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filtros.direccion) q.set("direccion", filtros.direccion);
      if (filtros.tipo) q.set("tipo", filtros.tipo);
      q.set("pageSize", "100");
      const r = await fetch(`/api/mcp/logs?${q.toString()}`);
      const d = await r.json();
      setItems(d.items ?? []);
    } catch (e: any) {
      toast.error("Error al cargar logs", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [filtros.direccion, filtros.tipo]);

  useEffect(() => {
    load();
  }, [load]);

  async function limpiar() {
    if (!confirm("¿Borrar logs de auditoría mayores a 90 días?")) return;
    try {
      const r = await fetch("/api/mcp/logs", { method: "DELETE" });
      const d = await r.json();
      toast.success(`${d.deleted} logs eliminados`);
      load();
    } catch (e: any) {
      toast.error("Error al limpiar", { description: e?.message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Log de auditoría MCP</h2>
          <p className="text-xs text-neutral-500">
            Trazabilidad de invocaciones inbound y outbound.
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={filtros.direccion}
            onValueChange={(v) =>
              setFiltros({ ...filtros, direccion: v === "all" ? "" : v })
            }
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Dirección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filtros.tipo}
            onValueChange={(v) =>
              setFiltros({ ...filtros, tipo: v === "all" ? "" : v })
            }
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="resource">Resource</SelectItem>
              <SelectItem value="tool">Tool</SelectItem>
              <SelectItem value="prompt">Prompt</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refrescar
          </Button>
          <Button variant="outline" size="sm" onClick={limpiar}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Limpiar &gt;90d
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-neutral-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              Cargando logs…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-neutral-500">
              No hay invocaciones registradas.
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Dir.</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Nombre</TableHead>
                    <TableHead className="text-xs">Conexión</TableHead>
                    <TableHead className="text-xs">Duración</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((l) => (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
                      onClick={() => setSelected(l)}
                    >
                      <TableCell className="text-xs text-neutral-500 font-mono">
                        {formatDateTime(l.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            l.direccion === "inbound"
                              ? "text-emerald-600 border-emerald-300 dark:border-emerald-800"
                              : "text-teal-600 border-teal-300 dark:border-teal-800"
                          }`}
                        >
                          {l.direccion === "inbound" ? (
                            <ArrowDownToLine className="w-3 h-3 mr-1" />
                          ) : (
                            <ArrowUpFromLine className="w-3 h-3 mr-1" />
                          )}
                          {l.direccion}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {l.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono truncate max-w-xs">
                        {l.nombre}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-500">
                        {l.conexion?.nombre ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-500">
                        {l.duracionMs != null ? `${l.duracionMs}ms` : "—"}
                      </TableCell>
                      <TableCell>
                        {l.error ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-red-600 border-red-300 dark:border-red-800"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            error
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-800"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            ok
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base">
                  {selected.error ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                  {selected.tipo} · {selected.nombre}
                </SheetTitle>
                <SheetDescription>
                  {formatDateTime(selected.createdAt)} ·{" "}
                  {selected.duracionMs != null ? `${selected.duracionMs}ms` : "—"}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <div className="text-neutral-500 mb-1">Dirección</div>
                  <Badge variant="outline">{selected.direccion}</Badge>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Conexión</div>
                  <div>{selected.conexion?.nombre ?? "Propio servidor"}</div>
                </div>
                {selected.userId && (
                  <div>
                    <div className="text-neutral-500 mb-1">Usuario</div>
                    <div className="font-mono">{selected.userId}</div>
                  </div>
                )}
                {selected.argumentos && (
                  <div>
                    <div className="text-neutral-500 mb-1">Argumentos</div>
                    <pre className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded text-[10px] max-h-60 overflow-auto">
                      {prettyJson(selected.argumentos)}
                    </pre>
                  </div>
                )}
                {selected.resultado && (
                  <div>
                    <div className="text-neutral-500 mb-1">Resultado</div>
                    <pre className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded text-[10px] max-h-60 overflow-auto">
                      {prettyJson(selected.resultado)}
                    </pre>
                  </div>
                )}
                {selected.error && (
                  <div>
                    <div className="text-neutral-500 mb-1">Error</div>
                    <pre className="bg-red-50 dark:bg-red-950/30 p-2 rounded text-[10px] text-red-600 dark:text-red-400 max-h-40 overflow-auto">
                      {selected.error}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================================
// Tab 4 — Documentación
// ============================================================
function DocsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ¿Qué es MCP?
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none text-sm space-y-2">
          <p>
            <strong>Model Context Protocol (MCP)</strong> es un estándar abierto creado por Anthropic
            para conectar <strong>LLMs</strong> (asistentes de IA como Claude, GPT-4, etc.) con
            sistemas externos de forma estandarizada.
          </p>
          <p>
            El ERP Marsella expone un servidor MCP sobre <code className="font-mono text-xs">/api/mcp</code>{" "}
            que permite a un LLM o sistema externo:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Resources</strong> — leer datos (dashboard, terceros, facturas, balance, kardex).
            </li>
            <li>
              <strong>Tools</strong> — ejecutar acciones (crear factura, registrar pago, ajustar inventario).
            </li>
            <li>
              <strong>Prompts</strong> — usar plantillas para análisis comunes (resumen ejecutivo, análisis de cartera, cierre contable).
            </li>
          </ul>
          <p>
            También puede <strong>consumir servidores MCP externos</strong> (CRM-ALBRA, bancos, e-commerce)
            registrándolos en la pestaña <em>Conexiones</em>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modos de autenticación del servidor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
              1
            </div>
            <div>
              <div className="font-medium">Token fijo (recomendado para externos)</div>
              <div className="text-xs text-neutral-500">
                Un token largo compartido definido en <code className="font-mono text-xs">.env</code>{" "}
                como <code className="font-mono text-xs">MCP_API_TOKEN</code>. El cliente lo envía en{" "}
                <code className="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center text-xs font-bold text-teal-700 dark:text-teal-300">
              2
            </div>
            <div>
              <div className="font-medium">JWT de sesión del ERP</div>
              <div className="text-xs text-neutral-500">
                Un usuario autenticado en el ERP puede usar su JWT como Bearer. El servidor valida con{" "}
                <code className="font-mono text-xs">verifyToken()</code> de{" "}
                <code className="font-mono text-xs">@/lib/auth</code> y opera sobre su empresa.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo de Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <ResourceDocRow uri="marsella://dashboard" desc="KPIs consolidados del periodo actual." />
          <ResourceDocRow uri="marsella://terceros" desc="Lista filtrada (?tipo=&q=)" />
          <ResourceDocRow uri="marsella://terceros/{id}" desc="Detalle de un tercero." />
          <ResourceDocRow uri="marsella://productos" desc="Lista filtrada (?q=)." />
          <ResourceDocRow uri="marsella://productos/{id}" desc="Detalle de producto con stock." />
          <ResourceDocRow uri="marsella://facturas" desc="Lista de facturas (?estado=)." />
          <ResourceDocRow uri="marsella://facturas/{id}" desc="Detalle con CUFE y XML." />
          <ResourceDocRow uri="marsella://contabilidad/balance" desc="Balance de prueba actual." />
          <ResourceDocRow uri="marsella://contabilidad/cuenta/{codigo}" desc="Mayor de una cuenta PUC." />
          <ResourceDocRow uri="marsella://inventario/kardex/{productoId}" desc="Kardex de un producto." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo de Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <ToolDocRow name="crear_tercero" desc="Crea un nuevo tercero (cliente/proveedor/etc.)." />
          <ToolDocRow name="crear_producto" desc="Crea un producto con código, precio y costo." />
          <ToolDocRow name="crear_factura" desc="Crea una factura de venta. Devuelve {numero, cufe, total}." />
          <ToolDocRow name="registrar_pago" desc="Registra recibo de caja (CXC) o egreso (CXP)." />
          <ToolDocRow name="crear_asiento_contable" desc="Crea un asiento manual (debe cuadrar)." />
          <ToolDocRow name="ajustar_inventario" desc="Registra movimiento de inventario." />
          <ToolDocRow name="consultar_cartera" desc="Saldos CXC/CXP por tercero." />
          <ToolDocRow name="consultar_balance" desc="Balance de prueba completo." />
          <ToolDocRow name="consultar_kardex" desc="Kardex de un producto en un rango." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Casos de uso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              LLM ejecutivo
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              Un asistente de IA conectado al ERP puede responder "¿cuál es la cartera vencida?" o
              "crea una factura para el cliente X por $1M" — todo vía MCP, sin APIs adicionales.
            </div>
          </div>
          <div>
            <div className="font-medium flex items-center gap-2">
              <Network className="w-4 h-4 text-teal-500" />
              CRM-ALBRA bidireccional
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              El ERP consume recursos del CRM (clientes, oportunidades) y expone facturas para que el
              CRM genere cobros pre-aprobados.
            </div>
          </div>
          <div>
            <div className="font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-500" />
              Bancos y e-commerce
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              Conciliación automática de extractos bancarios y órdenes de Shopify/WooCommerce vía
              tools expuestas por cada servidor MCP externo.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ResourceDocRow({ uri, desc }: { uri: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-neutral-100 dark:border-neutral-800 p-2">
      <code className="font-mono text-xs text-emerald-700 dark:text-emerald-300 flex-1 break-all">
        {uri}
      </code>
      <span className="text-xs text-neutral-500 shrink-0">{desc}</span>
    </div>
  );
}

function ToolDocRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-neutral-100 dark:border-neutral-800 p-2">
      <code className="font-mono text-xs text-teal-700 dark:text-teal-300 flex-1">{name}</code>
      <span className="text-xs text-neutral-500 shrink-0">{desc}</span>
    </div>
  );
}
