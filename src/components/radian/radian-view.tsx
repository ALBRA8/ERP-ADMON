"use client";

// ============================================================
// ERP Marsella — Vista DIAN Radian (Eventos de Recepción)
// Hermes §5.5
//
// Tabs:
//   1. Eventos — tabla con filtros, diálogo nuevo evento, sheet
//      lateral con detalle, XML pretty-print + respuesta DIAN,
//      botones reenviar / anular.
//   2. Acuse masivo — selector de rango fechas, lista facturas
//      de compra sin evento 030, generación masiva.
//   3. Estadísticas — cards + gráfica de barras de últimos 30
//      días (sin recharts, puro DIV).
//   4. Historial — tabla cronológica con estado, trackId,
//      mensajeError.
//
// Backend:
//   GET    /api/radian/eventos          (lista con filtros)
//   POST   /api/radian/eventos          (crea evento)
//   GET    /api/radian/eventos/[id]     (detalle)
//   POST   /api/radian/eventos/[id]/enviar
//   POST   /api/radian/eventos/[id]/anular
//   POST   /api/radian/eventos/bulk     (acuse masivo 030)
//   GET    /api/radian/eventos/stats
//   GET    /api/compras                 (facturas recibidas)
//
// Acento emerald/teal, dark mode con `dark:`, responsive
// mobile-first, sonner toasts.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Copy,
  FileCheck2,
  FileText,
  Hash,
  Inbox,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Trash2,
  XCircle,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ---------- Tipos ----------

interface EventoRadian {
  id: string;
  empresaId: string;
  numero: string;
  facturaCompraId: string | null;
  tipo: string;
  fecha: string;
  terceroId: string | null;
  nitEmisor: string;
  cufeFactura: string;
  estado: string;
  xmlEvento: string | null;
  respuestaDIAN: string | null;
  trackId: string | null;
  mensajeError: string | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EventoRadianDetalle extends EventoRadian {
  facturaCompra?: any;
  tercero?: any;
}

interface FacturaCompra {
  id: string;
  numero: string;
  proveedorFacturaNumero?: string | null;
  terceroId?: string | null;
  nombreProveedor: string;
  nitProveedor: string;
  fecha: string;
  total: number;
}

interface StatsRadian {
  por_tipo: Record<string, number>;
  por_estado: Record<string, number>;
  total: number;
  ultimos_30_dias: Array<{
    fecha: string;
    total: number;
    por_tipo: Record<string, number>;
  }>;
}

// ---------- Helpers fetch ----------

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Error al consultar");
  return json as T;
}

async function apiPost<T>(
  url: string,
  body?: any,
  method = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Error al procesar");
  return json as T;
}

// ---------- Helpers UI ----------

const TIPOS: Record<string, { label: string; color: string }> = {
  "030": {
    label: "Acuse de recibo",
    color:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  },
  "031": {
    label: "Recibo bien/servicio",
    color:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  },
  "032": {
    label: "Rechazo",
    color:
      "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900",
  },
  "033": {
    label: "Transferencia",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  },
  "034": {
    label: "Pago",
    color:
      "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
  },
  "035": {
    label: "Cobro",
    color:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900",
  },
  "036": {
    label: "Cancelación sin pago",
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-900",
  },
};

const ESTADOS: Record<string, { label: string; color: string }> = {
  borrador: {
    label: "Borrador",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  },
  enviado: {
    label: "Enviado",
    color:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  },
  aceptado: {
    label: "Aceptado",
    color:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  },
  rechazado: {
    label: "Rechazado",
    color:
      "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900",
  },
  anulado: {
    label: "Anulado",
    color:
      "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
  },
};

function tipoBadge(tipo: string) {
  const t = TIPOS[tipo];
  if (!t) return <Badge variant="outline">{tipo}</Badge>;
  return <Badge className={t.color}>{tipo} · {t.label}</Badge>;
}

function estadoBadge(estado: string) {
  const t = ESTADOS[estado];
  if (!t) return <Badge variant="outline">{estado}</Badge>;
  return <Badge className={t.color}>{t.label}</Badge>;
}

function fmtFecha(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtFechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function truncarCufe(cufe: string, n = 12): string {
  if (!cufe) return "—";
  if (cufe.length <= n * 2) return cufe;
  return `${cufe.slice(0, n)}…${cufe.slice(-n)}`;
}

/** Pretty-print un XML o JSON string con indentación legible. */
function prettyXml(input?: string | null): string {
  if (!input) return "";
  // Si es JSON, parsear y formatear
  if (input.trim().startsWith("{") || input.trim().startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      /* falla abajo */
    }
  }
  // Si parece XML, formatear con regex sencillo
  if (input.includes("<")) {
    let xml = input.replace(/>\s*</g, ">\n<").trim();
    const tokens = xml.split("\n");
    let indent = 0;
    const out: string[] = [];
    for (const tok of tokens) {
      const trimmed = tok.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("</")) {
        indent = Math.max(0, indent - 1);
        out.push("  ".repeat(indent) + trimmed);
      } else if (
        trimmed.startsWith("<") &&
        !trimmed.startsWith("<!") &&
        !trimmed.startsWith("<?") &&
        !trimmed.endsWith("/>") &&
        !trimmed.includes("</") &&
        !trimmed.endsWith(">")
      ) {
        // open tag
        out.push("  ".repeat(indent) + trimmed);
        indent++;
      } else if (trimmed.startsWith("<") && !trimmed.endsWith("/>")) {
        // self-closing or empty
        if (trimmed.endsWith(">")) {
          out.push("  ".repeat(indent) + trimmed);
        } else {
          out.push("  ".repeat(indent) + trimmed);
        }
      } else {
        out.push("  ".repeat(indent) + trimmed);
      }
    }
    return out.join("\n");
  }
  return input;
}

async function copiarAlPortapapeles(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado");
  } catch (e: any) {
    toast.error("No se pudo copiar: " + (e?.message ?? e));
  }
}

// ============================================================
// Componente principal
// ============================================================

export function RadianView() {
  const [tab, setTab] = useState<
    "eventos" | "acuse" | "stats" | "historial"
  >("eventos");

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">DIAN Radian</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Eventos de Recepción de Títulos Valor Electrónicos (030–036). Hermes §5.5.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="eventos">
              <FileCheck2 className="w-4 h-4 mr-2" /> Eventos
            </TabsTrigger>
            <TabsTrigger value="acuse">
              <Layers className="w-4 h-4 mr-2" /> Acuse masivo
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 className="w-4 h-4 mr-2" /> Estadísticas
            </TabsTrigger>
            <TabsTrigger value="historial">
              <Activity className="w-4 h-4 mr-2" /> Historial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="eventos" className="mt-4">
            <TabEventos />
          </TabsContent>
          <TabsContent value="acuse" className="mt-4">
            <TabAcuseMasivo />
          </TabsContent>
          <TabsContent value="stats" className="mt-4">
            <TabEstadisticas />
          </TabsContent>
          <TabsContent value="historial" className="mt-4">
            <TabHistorial />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Tab: Eventos
// ============================================================

function TabEventos() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EventoRadian[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Filtros
  const [q, setQ] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("");

  // Sheet detalle
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Diálogo nuevo evento
  const [dlgNuevo, setDlgNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q) params.set("q", q);
      if (tipoFiltro) params.set("tipo", tipoFiltro);
      if (estadoFiltro) params.set("estado", estadoFiltro);
      const data = await apiGet<{ items: EventoRadian[]; total: number }>(
        `/api/radian/eventos?${params.toString()}`,
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar eventos");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, tipoFiltro, estadoFiltro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs text-neutral-500">Buscar</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  className="pl-9"
                  placeholder="Número, CUFE, NIT, trackId..."
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-neutral-500">Tipo</Label>
              <Select
                value={tipoFiltro}
                onValueChange={(v) => {
                  setTipoFiltro(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {Object.entries(TIPOS).map(([code, t]) => (
                    <SelectItem key={code} value={code}>
                      {code} · {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-neutral-500">Estado</Label>
              <Select
                value={estadoFiltro}
                onValueChange={(v) => {
                  setEstadoFiltro(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {Object.entries(ESTADOS).map(([code, t]) => (
                    <SelectItem key={code} value={code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void cargar()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setDlgNuevo(true)}
            >
              <FileCheck2 className="w-4 h-4 mr-2" /> Nuevo evento
            </Button>
            <div className="text-xs text-neutral-500 ml-auto">
              {total} evento(s) · página {page} de {Math.max(1, Math.ceil(total / pageSize))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando eventos...
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-neutral-500 gap-2">
              <Inbox className="w-10 h-10 opacity-40" />
              <div>No hay eventos Radian registrados.</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDlgNuevo(true)}
              >
                Crear primer evento
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead className="min-w-[160px]">Número</TableHead>
                    <TableHead className="min-w-[140px]">Fecha</TableHead>
                    <TableHead className="min-w-[140px]">Tipo</TableHead>
                    <TableHead className="min-w-[120px]">NIT Emisor</TableHead>
                    <TableHead className="min-w-[200px]">CUFE factura</TableHead>
                    <TableHead className="min-w-[120px]">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((ev) => (
                    <TableRow
                      key={ev.id}
                      className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                      onClick={() => setSelectedId(ev.id)}
                    >
                      <TableCell className="font-mono text-xs">
                        {ev.numero}
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtFechaCorta(ev.fecha)}
                      </TableCell>
                      <TableCell>{tipoBadge(ev.tipo)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {ev.nitEmisor}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-mono text-xs cursor-help">
                              {truncarCufe(ev.cufeFactura)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[500px]">
                            <span className="font-mono text-xs break-all">
                              {ev.cufeFactura}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{estadoBadge(ev.estado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginación */}
      {total > pageSize && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs text-neutral-500">
            {page} / {Math.ceil(total / pageSize)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}

      {/* Sheet detalle */}
      <SheetDetalle
        eventoId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void cargar()}
      />

      {/* Diálogo nuevo evento */}
      <DialogNuevoEvento
        open={dlgNuevo}
        onOpenChange={setDlgNuevo}
        onCreated={() => {
          setDlgNuevo(false);
          void cargar();
        }}
      />
    </div>
  );
}

// ============================================================
// Sheet detalle
// ============================================================

function SheetDetalle({
  eventoId,
  onClose,
  onUpdated,
}: {
  eventoId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [evento, setEvento] = useState<EventoRadianDetalle | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [anulando, setAnulando] = useState(false);

  const load = useCallback(async () => {
    if (!eventoId) return;
    setLoading(true);
    try {
      const data = await apiGet<EventoRadianDetalle>(
        `/api/radian/eventos/${eventoId}`,
      );
      setEvento(data);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar detalle");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [eventoId, onClose]);

  useEffect(() => {
    if (eventoId) void load();
  }, [eventoId, load]);

  const handleEnviar = async () => {
    if (!evento) return;
    setEnviando(true);
    try {
      const res = await apiPost<{
        ok: boolean;
        estado: string;
        trackId?: string;
        mensajeError?: string;
      }>(`/api/radian/eventos/${evento.id}/enviar`);
      if (res.ok) {
        toast.success(`Evento aceptado por DIAN. TrackId: ${res.trackId}`);
      } else {
        toast.error(res.mensajeError ?? "DIAN rechazó el evento", {
          duration: 8000,
        });
      }
      await load();
      onUpdated();
    } catch (e: any) {
      toast.error(e.message ?? "Error al enviar");
    } finally {
      setEnviando(false);
    }
  };

  const handleAnular = async () => {
    if (!evento) return;
    setAnulando(true);
    try {
      await apiPost(`/api/radian/eventos/${evento.id}/anular`);
      toast.success("Evento anulado");
      await load();
      onUpdated();
    } catch (e: any) {
      toast.error(e.message ?? "Error al anular");
    } finally {
      setAnulando(false);
    }
  };

  return (
    <Sheet open={!!eventoId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="sm:max-w-2xl w-full overflow-y-auto p-0"
      >
        <SheetHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <span className="font-mono">{evento?.numero ?? "—"}</span>
          </SheetTitle>
          <SheetDescription>
            Detalle del evento Radian y respuestas DIAN.
          </SheetDescription>
        </SheetHeader>

        {loading || !evento ? (
          <div className="py-16 flex items-center justify-center text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* KPIs / badges */}
            <div className="flex flex-wrap gap-2">
              {tipoBadge(evento.tipo)}
              {estadoBadge(evento.estado)}
            </div>

            {/* Datos principales */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Hash className="w-4 h-4 text-emerald-600" />
                  Datos del evento
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-xs">
                <Campo label="Fecha">{fmtFecha(evento.fecha)}</Campo>
                <Campo label="NIT emisor (proveedor)">
                  <span className="font-mono">{evento.nitEmisor}</span>
                </Campo>
                <Campo label="Tercero">
                  {evento.tercero?.nombre ?? evento.terceroId ?? "—"}
                </Campo>
                <Campo label="Factura compra">
                  {evento.facturaCompra
                    ? `${evento.facturaCompra.numero} · ${evento.facturaCompra.nombreProveedor}`
                    : evento.facturaCompraId ?? "—"}
                </Campo>
                <Campo label="TrackId">
                  <span className="font-mono">{evento.trackId ?? "—"}</span>
                </Campo>
                <Campo label="Observaciones">
                  {evento.observaciones ?? "—"}
                </Campo>
              </CardContent>
            </Card>

            {/* CUFE factura */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CUFE factura original</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-2">
                  <code className="flex-1 font-mono text-xs break-all bg-neutral-50 dark:bg-neutral-900 p-2 rounded">
                    {evento.cufeFactura}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copiarAlPortapapeles(evento.cufeFactura)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Mensaje error */}
            {evento.mensajeError && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>Error DIAN</AlertTitle>
                <AlertDescription className="text-xs">
                  {evento.mensajeError}
                </AlertDescription>
              </Alert>
            )}

            {/* XML evento */}
            {evento.xmlEvento && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600" />
                      XML del evento (UBL 2.1)
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void copiarAlPortapapeles(
                          prettyXml(evento.xmlEvento ?? ""),
                        )
                      }
                    >
                      <Copy className="w-3 h-3 mr-1" /> Copiar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="font-mono text-[10px] leading-tight bg-neutral-50 dark:bg-neutral-900 p-3 rounded max-h-72 overflow-y-auto whitespace-pre-wrap break-all">
                    {prettyXml(evento.xmlEvento)}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Respuesta DIAN */}
            {evento.respuestaDIAN && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-600" />
                      Respuesta DIAN
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void copiarAlPortapapeles(
                          prettyXml(evento.respuestaDIAN ?? ""),
                        )
                      }
                    >
                      <Copy className="w-3 h-3 mr-1" /> Copiar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="font-mono text-[10px] leading-tight bg-neutral-50 dark:bg-neutral-900 p-3 rounded max-h-60 overflow-y-auto whitespace-pre-wrap break-all">
                    {prettyXml(evento.respuestaDIAN)}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Acciones */}
            <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background py-2 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={
                  enviando ||
                  evento.estado === "aceptado" ||
                  evento.estado === "anulado"
                }
                onClick={() => void handleEnviar()}
              >
                {enviando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Reenviar a DIAN
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  anulando ||
                  evento.estado === "anulado" ||
                  evento.estado === "aceptado"
                }
                onClick={() => void handleAnular()}
              >
                {anulando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Anular
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="font-medium text-xs">{children}</div>
    </div>
  );
}

// ============================================================
// Diálogo Nuevo Evento
// ============================================================

function DialogNuevoEvento({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState<string>("030");
  const [nitEmisor, setNitEmisor] = useState("");
  const [cufeFactura, setCufeFactura] = useState("");
  const [terceroId, setTerceroId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [facturaCompraId, setFacturaCompraId] = useState("");

  // Lista de facturas de compra para selección opcional
  const [facturas, setFacturas] = useState<FacturaCompra[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(false);

  const cargarFacturas = useCallback(async () => {
    setLoadingFacturas(true);
    try {
      const data = await apiGet<{ items: FacturaCompra[] }>(
        "/api/compras?page=1&pageSize=200",
      );
      setFacturas(data.items ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingFacturas(false);
    }
  }, []);

  useEffect(() => {
    if (open) void cargarFacturas();
  }, [open, cargarFacturas]);

  const limpiar = () => {
    setTipo("030");
    setNitEmisor("");
    setCufeFactura("");
    setTerceroId("");
    setObservaciones("");
    setFacturaCompraId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipo) return toast.error("Selecciona un tipo de evento");
    if (!nitEmisor.trim())
      return toast.error("Ingresa el NIT del proveedor emisor de la factura");
    if (!cufeFactura.trim() || cufeFactura.trim().length < 10)
      return toast.error("Ingresa el CUFE de la factura electrónica recibida");

    setSaving(true);
    try {
      const res = await apiPost<{
        evento: EventoRadian;
        envioAutomatico: { ok: boolean; trackId?: string; mensaje?: string };
      }>("/api/radian/eventos", {
        facturaCompraId: facturaCompraId || undefined,
        tipo,
        nitEmisor: nitEmisor.trim(),
        cufeFactura: cufeFactura.trim(),
        terceroId: terceroId || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success(`Evento ${res.evento.numero} creado`);
      if (!res.envioAutomatico.ok) {
        toast.error(
          "Sin envío automático: " +
            (res.envioAutomatico.mensaje ?? "Configuración DIAN pendiente"),
          { duration: 8000 },
        );
      } else if (res.envioAutomatico.trackId) {
        toast.success(
          `Enviado a DIAN · trackId: ${res.envioAutomatico.trackId}`,
        );
      }
      limpiar();
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear evento");
    } finally {
      setSaving(false);
    }
  };

  // Cuando selecciona una factura, rellenar NIT y sugerir CUFE
  const onFacturaSelect = (id: string) => {
    setFacturaCompraId(id);
    if (id) {
      const fc = facturas.find((f) => f.id === id);
      if (fc) {
        setNitEmisor(fc.nitProveedor);
        if (fc.terceroId) setTerceroId(fc.terceroId);
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          limpiar();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo evento Radian</DialogTitle>
          <DialogDescription>
            Genera un evento sobre una factura electrónica recibida. Si la
            empresa tiene configuración DIAN activa, se intenta enviar
            automáticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo */}
          <div>
            <Label className="text-xs">Tipo de evento *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPOS).map(([code, t]) => (
                  <SelectItem key={code} value={code}>
                    {code} · {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-neutral-500 mt-1">
              {TIPOS[tipo]?.label ?? ""}
            </p>
          </div>

          {/* Factura compra opcional */}
          <div>
            <Label className="text-xs">
              Factura de compra (opcional, autocompleta NIT)
            </Label>
            <Select
              value={facturaCompraId}
              onValueChange={onFacturaSelect}
              disabled={loadingFacturas || facturas.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="— Sin factura de compra —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Sin factura de compra —</SelectItem>
                {facturas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.numero} · {f.nombreProveedor} · {f.nitProveedor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* NIT emisor */}
          <div>
            <Label className="text-xs">NIT emisor (proveedor) *</Label>
            <Input
              placeholder="Ej: 900123456-7"
              value={nitEmisor}
              onChange={(e) => setNitEmisor(e.target.value)}
              required
            />
          </div>

          {/* CUFE factura */}
          <div>
            <Label className="text-xs">CUFE de la factura electrónica *</Label>
            <Textarea
              placeholder="Pega aquí el CUFE (96 caracteres hex) de la factura electrónica recibida del proveedor"
              value={cufeFactura}
              onChange={(e) => setCufeFactura(e.target.value)}
              rows={3}
              className="font-mono text-xs"
              required
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              {cufeFactura.length} caracteres
            </p>
          </div>

          {/* Tercero opcional */}
          <div>
            <Label className="text-xs">Tercero ID (opcional)</Label>
            <Input
              placeholder="ID interno del tercero (Tercero.id)"
              value={terceroId}
              onChange={(e) => setTerceroId(e.target.value)}
            />
          </div>

          {/* Observaciones */}
          <div>
            <Label className="text-xs">Observaciones (opcional)</Label>
            <Textarea
              placeholder="Notas internas sobre el evento"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileCheck2 className="w-4 h-4 mr-2" />
              )}
              Crear evento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Tab: Acuse masivo (030)
// ============================================================

function TabAcuseMasivo() {
  const [loading, setLoading] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [facturas, setFacturas] = useState<FacturaCompra[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [eventosPrevios, setEventosPrevios] = useState<
    Map<string, EventoRadian[]>
  >(new Map());

  // Rango de fechas
  const hoy = new Date();
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  const [fechaInicio, setFechaInicio] = useState(
    hace30.toISOString().slice(0, 10),
  );
  const [fechaFin, setFechaFin] = useState(hoy.toISOString().slice(0, 10));

  // CUFE manual: como las facturas de compra actuales no tienen CUFE
  // almacenado, dejamos que el usuario ingrese manualmente CUFE por
  // factura (o se deja vacío y el backend generará con cufeFactura=""
  // -> se rechazará). Para evitar bloquear el flujo demo, mostramos
  // un input editable de CUFE por factura seleccionada.
  const [cufeManual, setCufeManual] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "200",
      });
      if (fechaInicio) params.set("q", "");
      const data = await apiGet<{ items: FacturaCompra[]; total: number }>(
        `/api/compras?${params.toString()}`,
      );
      // Filtrar por rango de fechas en cliente (la API no soporta
      // filtro de fechas directamente en /api/compras, lo hacemos acá)
      const ini = new Date(fechaInicio + "T00:00:00");
      const fin = new Date(fechaFin + "T23:59:59");
      const filtradas = (data.items ?? []).filter((f) => {
        const fch = new Date(f.fecha);
        return fch >= ini && fch <= fin;
      });
      setFacturas(filtradas);

      // Cargar eventos Radian existentes (030) para marcar las que ya tienen acuse
      const evs = await apiGet<{ items: EventoRadian[] }>(
        "/api/radian/eventos?page=1&pageSize=500&tipo=030",
      );
      const map = new Map<string, EventoRadian[]>();
      for (const e of evs.items ?? []) {
        if (e.facturaCompraId) {
          const arr = map.get(e.facturaCompraId) ?? [];
          arr.push(e);
          map.set(e.facturaCompraId, arr);
        }
      }
      setEventosPrevios(map);

      // Inicializar CUFE manual vacío para todas
      const initCufe: Record<string, string> = {};
      for (const f of filtradas) initCufe[f.id] = "";
      setCufeManual(initCufe);

      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar facturas");
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      // Selecciona solo facturas SIN evento 030 previo aceptado
      const candidatas = facturas.filter((f) => {
        const evs = eventosPrevios.get(f.id) ?? [];
        return !evs.some((e) => e.estado === "aceptado");
      });
      if (prev.size === candidatas.length && candidatas.length > 0) {
        return new Set();
      }
      return new Set(candidatas.map((f) => f.id));
    });
  };

  const handleGenerar = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos una factura");
      return;
    }
    // Validar CUFE manual para cada seleccionada
    const eventos: any[] = [];
    let sinCufe = 0;
    for (const fid of selected) {
      const fc = facturas.find((f) => f.id === fid);
      if (!fc) continue;
      const cufe = (cufeManual[fid] ?? "").trim();
      if (!cufe || cufe.length < 10) {
        sinCufe++;
        continue;
      }
      eventos.push({
        facturaCompraId: fid,
        tipo: "030",
        nitEmisor: fc.nitProveedor,
        cufeFactura: cufe,
        terceroId: fc.terceroId,
      });
    }
    if (eventos.length === 0) {
      toast.error(
        `Las ${sinCufe} factura(s) seleccionada(s) no tienen CUFE. Pega el CUFE para cada una.`,
        { duration: 8000 },
      );
      return;
    }
    setProcesando(true);
    try {
      const res = await apiPost<{ creados: number; errores: any[] }>(
        "/api/radian/eventos/bulk",
        { eventos },
      );
      toast.success(
        `${res.creados} acuse(s) 030 generados` +
          (res.errores.length
            ? `, ${res.errores.length} con error`
            : ""),
      );
      if (sinCufe > 0) {
        toast.error(
          `${sinCufe} factura(s) sin CUFE omitidas (ingresa el CUFE y vuelve a procesar)`,
          { duration: 8000 },
        );
      }
      await cargar();
    } catch (e: any) {
      toast.error(e.message ?? "Error en acuse masivo");
    } finally {
      setProcesando(false);
    }
  };

  const facturasSinAcuse = facturas.filter((f) => {
    const evs = eventosPrevios.get(f.id) ?? [];
    return !evs.some((e) => e.estado === "aceptado");
  });

  return (
    <div className="space-y-4">
      <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Acuse masivo de recibo (Evento 030)
          </CardTitle>
          <CardDescription className="text-emerald-700 dark:text-emerald-400">
            Selecciona facturas de compra recibidas y genera acuses 030
            masivamente. Cada factura requiere el CUFE de la factura
            electrónica original recibida del proveedor.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filtros de fecha */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Fecha inicio</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Fecha fin</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
            <div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void cargar()}
                disabled={loading}
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Cargar facturas
              </Button>
            </div>
            <div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void handleGenerar()}
                disabled={procesando || selected.size === 0}
              >
                {procesando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileCheck2 className="w-4 h-4 mr-2" />
                )}
                Generar acuses ({selected.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-emerald-600" />
            <div>
              <div className="text-xs text-neutral-500">Facturas en rango</div>
              <div className="text-2xl font-bold">{facturas.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
            <div>
              <div className="text-xs text-neutral-500">Pendientes acuse 030</div>
              <div className="text-2xl font-bold">{facturasSinAcuse.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            <div>
              <div className="text-xs text-neutral-500">Con acuse 030 aceptado</div>
              <div className="text-2xl font-bold">
                {facturas.length - facturasSinAcuse.length}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando facturas...
            </div>
          ) : facturasSinAcuse.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-neutral-500 gap-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-60" />
              <div>
                Todas las facturas del rango tienen acuse 030 aceptado.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={
                          selected.size === facturasSinAcuse.length &&
                          facturasSinAcuse.length > 0
                        }
                        onCheckedChange={() => toggleAll()}
                      />
                    </TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>NIT</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="min-w-[280px]">CUFE factura electrónica</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturasSinAcuse.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(f.id)}
                          onCheckedChange={() => toggle(f.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {f.proveedorFacturaNumero ?? f.numero}
                      </TableCell>
                      <TableCell className="text-xs">
                        {f.nombreProveedor}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {f.nitProveedor}
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtFechaCorta(f.fecha)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Intl.NumberFormat("es-CO", {
                          style: "currency",
                          currency: "COP",
                          maximumFractionDigits: 0,
                        }).format(f.total ?? 0)}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Pega el CUFE (96 hex)..."
                          value={cufeManual[f.id] ?? ""}
                          onChange={(e) =>
                            setCufeManual((prev) => ({
                              ...prev,
                              [f.id]: e.target.value,
                            }))
                          }
                          className="font-mono text-xs h-8"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab: Estadísticas
// ============================================================

function TabEstadisticas() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<StatsRadian | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<StatsRadian>("/api/radian/eventos/stats");
      setStats(data);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar estadísticas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (loading || !stats) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center text-neutral-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando estadísticas...
        </CardContent>
      </Card>
    );
  }

  // Máximo para normalizar barras de últimos 30 días
  const max30 = Math.max(1, ...stats.ultimos_30_dias.map((d) => d.total));

  // Colores por tipo (mismos badges)
  const colorBarra = (tipo: string) => {
    switch (tipo) {
      case "030": return "bg-sky-500";
      case "031": return "bg-emerald-500";
      case "032": return "bg-red-500";
      case "033": return "bg-amber-500";
      case "034": return "bg-teal-500";
      case "035": return "bg-cyan-500";
      case "036": return "bg-orange-500";
      default: return "bg-neutral-500";
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total eventos"
          value={stats.total}
          icon={<FileCheck2 className="w-5 h-5" />}
          color="emerald"
        />
        <KpiCard
          label="Aceptados"
          value={stats.por_estado["aceptado"] ?? 0}
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="emerald"
        />
        <KpiCard
          label="Pendientes"
          value={(stats.por_estado["borrador"] ?? 0) +
            (stats.por_estado["enviado"] ?? 0)}
          icon={<AlertCircle className="w-5 h-5" />}
          color="amber"
        />
        <KpiCard
          label="Rechazados"
          value={stats.por_estado["rechazado"] ?? 0}
          icon={<XCircle className="w-5 h-5" />}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por tipo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Eventos por tipo</CardTitle>
            <CardDescription>Distribución por código de evento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(TIPOS).map(([code, t]) => {
              const n = stats.por_tipo[code] ?? 0;
              const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
              return (
                <div key={code} className="flex items-center gap-3">
                  <div className="w-32 text-xs">{code} · {t.label}</div>
                  <div className="flex-1 h-5 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                    <div
                      className={`h-full ${colorBarra(code)} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-10 text-right text-xs font-mono">{n}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Por estado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Eventos por estado</CardTitle>
            <CardDescription>Distribución por estado de envío</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(ESTADOS).map(([code, t]) => {
              const n = stats.por_estado[code] ?? 0;
              const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
              return (
                <div key={code} className="flex items-center gap-3">
                  <div className="w-32 text-xs">{t.label}</div>
                  <div className="flex-1 h-5 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-10 text-right text-xs font-mono">{n}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Últimos 30 días */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Eventos últimos 30 días</CardTitle>
          <CardDescription>
            Línea temporal de creación de eventos (barras apiladas por tipo).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
            {stats.ultimos_30_dias.map((d) => {
              const h = (d.total / max30) * 100;
              return (
                <Tooltip key={d.fecha}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex flex-col justify-end items-center group flex-1 min-w-[8px] cursor-help"
                    >
                      <div
                        className="w-full rounded-t overflow-hidden flex flex-col-reverse"
                        style={{ height: `${Math.max(2, h)}%` }}
                      >
                        {Object.entries(d.por_tipo).map(([tipo, n]) => (
                          <div
                            key={tipo}
                            className={`${colorBarra(tipo)} w-full`}
                            style={{ height: `${(n / d.total) * 100}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <div className="font-mono">
                        {fmtFechaCorta(d.fecha)}
                      </div>
                      <div className="font-bold">{d.total} evento(s)</div>
                      {Object.entries(d.por_tipo).map(([tipo, n]) => (
                        <div key={tipo}>
                          {tipo}: {n}
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-neutral-500">
            <span>
              {fmtFechaCorta(stats.ultimos_30_dias[0]?.fecha)}
            </span>
            <span>
              {fmtFechaCorta(
                stats.ultimos_30_dias[stats.ultimos_30_dias.length - 1]?.fecha,
              )}
            </span>
          </div>
          {/* Leyenda */}
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(TIPOS).map(([code, t]) => (
              <div key={code} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${colorBarra(code)}`} />
                <span className="text-xs">{code} · {t.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "emerald" | "amber" | "red" | "teal";
}) {
  const colorClass = {
    emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    amber: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    red: "text-red-600 bg-red-50 dark:bg-red-950/30",
    teal: "text-teal-600 bg-teal-50 dark:bg-teal-950/30",
  }[color];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClass}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-neutral-500 truncate">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab: Historial
// ============================================================

function TabHistorial() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EventoRadian[]>([]);
  const [q, setQ] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
      });
      if (q) params.set("q", q);
      const data = await apiGet<{ items: EventoRadian[]; total: number }>(
        `/api/radian/eventos?${params.toString()}`,
      );
      setItems(data.items);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar historial");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input
                className="pl-9"
                placeholder="Buscar por número, CUFE, trackId, NIT..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => void cargar()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-neutral-500 gap-2">
              <Activity className="w-10 h-10 opacity-40" />
              <div>Sin eventos en el historial.</div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>TrackId</TableHead>
                    <TableHead>Mensaje error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs">
                        {fmtFecha(ev.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {ev.numero}
                      </TableCell>
                      <TableCell>{tipoBadge(ev.tipo)}</TableCell>
                      <TableCell>{estadoBadge(ev.estado)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {ev.trackId ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {truncarCufe(ev.trackId, 8)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span className="font-mono text-xs break-all">
                                {ev.trackId}
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[320px]">
                        {ev.mensajeError ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-red-600 dark:text-red-400 cursor-help truncate block">
                                {ev.mensajeError}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[400px]">
                              <span className="text-xs">
                                {ev.mensajeError}
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-neutral-400">—</span>
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
    </div>
  );
}
