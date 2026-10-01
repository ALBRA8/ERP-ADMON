"use client";

// ============================================================
// ERP Marsella — Costos y Órdenes de Producción (Hermes §5.7)
// Tabs: Órdenes | Nueva orden | Recetas | Histórico
// Acento emerald/teal, dark mode, responsive mobile-first.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Factory,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ClipboardList,
  PlayCircle,
  StopCircle,
  Ban,
  CheckCircle2,
  FileBarChart,
  Beaker,
  PackageOpen,
  ListChecks,
  AlertTriangle,
  Save,
  Coins,
  Boxes,
  ChevronRight,
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
  SheetFooter,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Helpers ----------
const fmtFecha = (iso: string | Date | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

const fmtFechaHora = (iso: string | Date | null | undefined) => {
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
};

const ESTADO_ORDEN: Record<
  string,
  { label: string; color: string; Icon: any }
> = {
  borrador: {
    label: "Borrador",
    color:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
    Icon: ClipboardList,
  },
  en_proceso: {
    label: "En proceso",
    color:
      "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
    Icon: PlayCircle,
  },
  finalizada: {
    label: "Finalizada",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  anulada: {
    label: "Anulada",
    color:
      "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    Icon: Ban,
  },
};

function getEstado(estado: string) {
  return (
    ESTADO_ORDEN[estado] ?? {
      label: estado,
      color:
        "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
      Icon: ClipboardList,
    }
  );
}

// ---------- Tipos ----------
interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  inventariable: boolean;
  tipo: string;
}

interface DetalleOrden {
  id: string;
  tipo: string;
  productoId?: string | null;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
  producto?: Producto | null;
}

interface OrdenProduccion {
  id: string;
  numero: string;
  fechaInicio: string;
  fechaFin?: string | null;
  estado: string;
  productoResultanteId?: string | null;
  productoResultante?: Producto | null;
  cantidadProducir: number;
  cantidadProducida: number;
  costoMateriaPrima: number;
  costoManoObra: number;
  costoIndirectos: number;
  costoTotal: number;
  costoUnitario: number;
  comprobanteContableId?: string | null;
  observaciones?: string | null;
  detalles?: DetalleOrden[];
  comprobante?: {
    id: string;
    numero: string;
    fecha: string;
    descripcion?: string | null;
    totalDebito: number;
    totalCredito: number;
    estado: string;
  } | null;
}

interface RecetaIngrediente {
  id?: string;
  productoId?: string | null;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
  producto?: Producto | null;
  stockActual?: number | null;
  disponible?: boolean | null;
}

interface Receta {
  id: string;
  empresaId: string;
  productoId: string;
  nombre: string;
  descripcion?: string | null;
  rendimiento: number;
  activa: boolean;
  ingredientes: RecetaIngrediente[];
  producto?: Producto | null;
}

interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
}

// ---------- Fetch helpers ----------
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Error al consultar");
  return json as T;
}

async function apiPost<T>(
  url: string,
  body: any,
  method = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Error al procesar");
  return json as T;
}

// ============================================================
// Componente principal
// ============================================================
export function ProduccionView() {
  const [tab, setTab] = useState("ordenes");
  const [loading, setLoading] = useState(false);

  // Datos
  const [ordenes, setOrdenes] = useState<OrdenProduccion[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);

  // Filtros
  const [q, setQ] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("");

  // Histórico
  const [histInicio, setHistInicio] = useState<string>("");
  const [histFin, setHistFin] = useState<string>("");
  const [historico, setHistorico] = useState<OrdenProduccion[]>([]);

  // Sheet
  const [sheetOrden, setSheetOrden] = useState<OrdenProduccion | null>(null);

  // Dialog nueva orden
  const [dlgNueva, setDlgNueva] = useState(false);

  // Dialog nueva/editar receta
  const [dlgReceta, setDlgReceta] = useState<Receta | null>(null);
  const [dlgRecetaNew, setDlgRecetaNew] = useState(false);

  // Sheet receta (calcular costo)
  const [sheetReceta, setSheetReceta] = useState<Receta | null>(null);
  const [calcCantidad, setCalcCantidad] = useState<number>(1);
  const [calcBodega, setCalcBodega] = useState<string>("");
  const [calcResultado, setCalcResultado] = useState<any>(null);

  // Diálogo finalizar
  const [dlgFinalizar, setDlgFinalizar] = useState<OrdenProduccion | null>(null);
  const [finCantidad, setFinCantidad] = useState<number>(0);
  const [finBodega, setFinBodega] = useState<string>("");

  // Diálogo anular
  const [dlgAnular, setDlgAnular] = useState<OrdenProduccion | null>(null);
  const [anuBodega, setAnuBodega] = useState<string>("");

  // Diálogo iniciar
  const [dlgIniciar, setDlgIniciar] = useState<OrdenProduccion | null>(null);
  const [iniBodega, setIniBodega] = useState<string>("");

  // ---------- Carga de datos ----------
  const cargarOrdenes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (q) params.set("q", q);
      if (estadoFiltro && estadoFiltro !== "ALL")
        params.set("estado", estadoFiltro);
      const data = await apiGet<{ items: OrdenProduccion[]; total: number }>(
        `/api/produccion/ordenes?${params.toString()}`,
      );
      setOrdenes(data.items);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar órdenes");
    } finally {
      setLoading(false);
    }
  }, [q, estadoFiltro]);

  const cargarRecetas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<Receta[]>(`/api/produccion/recetas`);
      setRecetas(data);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar recetas");
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarCatalogos = useCallback(async () => {
    try {
      const [prods, bods] = await Promise.all([
        apiGet<{ items: Producto[]; total: number }>(
          `/api/productos?pageSize=500`,
        ),
        apiGet<Bodega[]>(`/api/inventario?op=bodegas`),
      ]);
      setProductos(prods.items.filter((p) => p.inventariable));
      setBodegas(bods);
      if (bods.length && !calcBodega) setCalcBodega(bods[0].id);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar catálogos");
    }
  }, [calcBodega]);

  const cargarHistorico = useCallback(async () => {
    setLoading(true);
    try {
      const paramsFin = new URLSearchParams({
        page: "1",
        pageSize: "500",
        estado: "finalizada",
      });
      if (histInicio) paramsFin.set("fechaInicio", histInicio);
      if (histFin) paramsFin.set("fechaFin", histFin);
      const fin = await apiGet<{ items: OrdenProduccion[]; total: number }>(
        `/api/produccion/ordenes?${paramsFin.toString()}`,
      );

      const paramsAnu = new URLSearchParams({
        page: "1",
        pageSize: "500",
        estado: "anulada",
      });
      if (histInicio) paramsAnu.set("fechaInicio", histInicio);
      if (histFin) paramsAnu.set("fechaFin", histFin);
      const anu = await apiGet<{ items: OrdenProduccion[]; total: number }>(
        `/api/produccion/ordenes?${paramsAnu.toString()}`,
      );

      const todas = [...fin.items, ...anu.items].sort(
        (a, b) =>
          new Date(b.fechaFin ?? b.fechaInicio).getTime() -
          new Date(a.fechaFin ?? a.fechaInicio).getTime(),
      );
      setHistorico(todas);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar histórico");
    } finally {
      setLoading(false);
    }
  }, [histInicio, histFin]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    if (tab === "ordenes") cargarOrdenes();
    if (tab === "recetas") cargarRecetas();
    if (tab === "historico") cargarHistorico();
  }, [tab, cargarOrdenes, cargarRecetas, cargarHistorico]);

  // ---------- Acciones ----------
  const onSelectOrden = async (orden: OrdenProduccion) => {
    setSheetOrden(orden);
    try {
      const full = await apiGet<OrdenProduccion>(
        `/api/produccion/ordenes/${orden.id}`,
      );
      setSheetOrden(full);
    } catch {
      /* usa el resumen */
    }
  };

  const onIniciar = async () => {
    if (!dlgIniciar) return;
    if (!iniBodega) {
      toast.error("Selecciona una bodega");
      return;
    }
    try {
      const r = await apiPost<{
        ok: boolean;
        orden: OrdenProduccion;
        salidasRegistradas: number;
      }>(`/api/produccion/ordenes/${dlgIniciar.id}/iniciar`, {
        bodegaId: iniBodega,
      });
      toast.success(
        `Orden ${r.orden.numero} iniciada — salidas registradas: ${r.salidasRegistradas}`,
      );
      setSheetOrden(r.orden);
      setDlgIniciar(null);
      cargarOrdenes();
    } catch (e: any) {
      toast.error(e.message ?? "Error al iniciar orden");
    }
  };

  const onFinalizar = async () => {
    if (!dlgFinalizar) return;
    if (!finBodega) {
      toast.error("Selecciona una bodega");
      return;
    }
    if (finCantidad <= 0) {
      toast.error("La cantidad producida debe ser > 0");
      return;
    }
    try {
      const r = await apiPost<{
        ok: boolean;
        orden: OrdenProduccion;
        asientoContable: { comprobanteId: string; numero: string } | null;
        asientoError?: string;
      }>(`/api/produccion/ordenes/${dlgFinalizar.id}/finalizar`, {
        cantidadProducida: finCantidad,
        bodegaId: finBodega,
      });
      if (r.asientoContable) {
        toast.success(
          `Orden ${r.orden.numero} finalizada — Asiento ${r.asientoContable.numero}`,
        );
      } else if (r.asientoError) {
        toast.warning(
          `Orden finalizada, pero el asiento falló: ${r.asientoError}`,
        );
      } else {
        toast.success(`Orden ${r.orden.numero} finalizada`);
      }
      setSheetOrden(r.orden);
      setDlgFinalizar(null);
      cargarOrdenes();
    } catch (e: any) {
      toast.error(e.message ?? "Error al finalizar orden");
    }
  };

  const onAnular = async () => {
    if (!dlgAnular) return;
    if (dlgAnular.estado === "en_proceso" && !anuBodega) {
      toast.error("Selecciona una bodega para reversar las salidas");
      return;
    }
    try {
      const r = await apiPost<{
        ok: boolean;
        orden: OrdenProduccion;
        reversion: { reversados: number; totalCosto: number };
      }>(`/api/produccion/ordenes/${dlgAnular.id}/anular`, {
        bodegaId: anuBodega || undefined,
      });
      toast.success(
        `Orden ${r.orden.numero} anulada — reversiones: ${r.reversion.reversados}`,
      );
      setSheetOrden(r.orden);
      setDlgAnular(null);
      setAnuBodega("");
      cargarOrdenes();
    } catch (e: any) {
      toast.error(e.message ?? "Error al anular orden");
    }
  };

  const onCalcularCosto = async () => {
    if (!sheetReceta) return;
    try {
      const params = new URLSearchParams({
        cantidad: String(calcCantidad || 1),
      });
      if (calcBodega) params.set("bodegaId", calcBodega);
      const r = await apiGet<any>(
        `/api/produccion/recetas/${sheetReceta.id}/calcular-costo?${params.toString()}`,
      );
      setCalcResultado(r);
    } catch (e: any) {
      toast.error(e.message ?? "Error al calcular costo");
    }
  };

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Factory className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Costos y Órdenes de Producción
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Transformación / manufactura (Hermes §5.7) — recetas, órdenes y
            costos de producción.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (tab === "ordenes") cargarOrdenes();
              if (tab === "recetas") cargarRecetas();
              if (tab === "historico") cargarHistorico();
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </Button>
          {tab === "ordenes" && (
            <Button size="sm" onClick={() => setDlgNueva(true)}>
              <Plus className="w-4 h-4" />
              Nueva orden
            </Button>
          )}
          {tab === "recetas" && (
            <Button size="sm" onClick={() => setDlgRecetaNew(true)}>
              <Plus className="w-4 h-4" />
              Nueva receta
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="ordenes">Órdenes</TabsTrigger>
          <TabsTrigger value="nueva">Nueva orden</TabsTrigger>
          <TabsTrigger value="recetas">Recetas</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ============= TAB ÓRDENES ============= */}
        <TabsContent value="ordenes" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <Input
                    placeholder="Buscar por número u observaciones…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && cargarOrdenes()}
                    className="pl-8"
                  />
                </div>
                <Select
                  value={estadoFiltro || "ALL"}
                  onValueChange={(v) => setEstadoFiltro(v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-1" />
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="borrador">Borrador</SelectItem>
                    <SelectItem value="en_proceso">En proceso</SelectItem>
                    <SelectItem value="finalizada">Finalizada</SelectItem>
                    <SelectItem value="anulada">Anulada</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={cargarOrdenes}>
                  <Filter className="w-4 h-4" />
                  Aplicar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : ordenes.length === 0 ? (
                <div className="p-8 text-center text-neutral-500">
                  <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No hay órdenes de producción. Crea una en la pestaña
                  &ldquo;Nueva orden&rdquo;.
                </div>
              ) : (
                <div className="max-h-[calc(100vh-280px)] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Inicio</TableHead>
                        <TableHead>Fin</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Costo total</TableHead>
                        <TableHead className="text-right">Costo unit.</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordenes.map((o) => {
                        const est = getEstado(o.estado);
                        return (
                          <TableRow
                            key={o.id}
                            className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                            onClick={() => onSelectOrden(o)}
                          >
                            <TableCell className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              {o.numero}
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtFecha(o.fechaInicio)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtFecha(o.fechaFin)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {o.productoResultante
                                ? o.productoResultante.nombre
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              <div className="flex flex-col items-end">
                                <span>{o.cantidadProducir}</span>
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                  / {o.cantidadProducida}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium">
                              {formatCurrency(o.costoTotal)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatCurrency(o.costoUnitario)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] gap-1 ${est.color}`}
                              >
                                <est.Icon className="w-3 h-3" />
                                {est.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <ChevronRight className="w-4 h-4 text-neutral-400" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <SheetOrdenDetalle
            orden={sheetOrden}
            onClose={() => setSheetOrden(null)}
            onIniciar={(o) => {
              setDlgIniciar(o);
              setIniBodega(bodegas[0]?.id ?? "");
            }}
            onFinalizar={(o) => {
              setDlgFinalizar(o);
              setFinCantidad(o.cantidadProducir);
              setFinBodega(bodegas[0]?.id ?? "");
            }}
            onAnular={(o) => {
              setDlgAnular(o);
              setAnuBodega(bodegas[0]?.id ?? "");
            }}
          />
        </TabsContent>

        {/* ============= TAB NUEVA ORDEN ============= */}
        <TabsContent value="nueva" className="space-y-3">
          <FormNuevaOrden
            productos={productos}
            recetas={recetas}
            bodegas={bodegas}
            onSaved={(o) => {
              toast.success(`Orden ${o.numero} creada`);
              setDlgNueva(false);
              setTab("ordenes");
              cargarOrdenes();
            }}
            onError={(m) => toast.error(m)}
          />
        </TabsContent>

        {/* ============= TAB RECETAS ============= */}
        <TabsContent value="recetas" className="space-y-3">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : recetas.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-neutral-500">
                <Beaker className="w-10 h-10 mx-auto mb-2 opacity-50" />
                No hay recetas. Crea una con &ldquo;Nueva receta&rdquo;.
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recetas.map((r) => (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:ring-2 hover:ring-emerald-500/40 transition-all"
                  onClick={() => {
                    setSheetReceta(r);
                    setCalcCantidad(1);
                    setCalcResultado(null);
                  }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                          <Beaker className="w-4 h-4" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">{r.nombre}</CardTitle>
                          <CardDescription className="text-[11px]">
                            {r.producto?.nombre ?? "—"}
                          </CardDescription>
                        </div>
                      </div>
                      {r.activa ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Inactiva
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs space-y-1">
                    {r.descripcion && (
                      <p className="text-neutral-600 dark:text-neutral-400 line-clamp-2">
                        {r.descripcion}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-neutral-500">Rendimiento</span>
                      <span className="font-mono font-semibold">
                        {r.rendimiento}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Ingredientes</span>
                      <span className="font-mono font-semibold">
                        {r.ingredientes.length}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Sheet receta */}
          <Sheet
            open={!!sheetReceta}
            onOpenChange={(v) => !v && setSheetReceta(null)}
          >
            <SheetContent
              side="right"
              className="w-full sm:max-w-lg overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Beaker className="w-4 h-4 text-emerald-600" />
                  {sheetReceta?.nombre}
                </SheetTitle>
                <SheetDescription>
                  {sheetReceta?.producto?.nombre} · rendimiento{" "}
                  {sheetReceta?.rendimiento}
                </SheetDescription>
              </SheetHeader>
              {sheetReceta && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDlgReceta(sheetReceta);
                        setDlgRecetaNew(false);
                      }}
                    >
                      Editar
                    </Button>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-1">
                      Ingredientes
                    </h4>
                    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
                          <TableRow>
                            <TableHead className="text-xs">Desc.</TableHead>
                            <TableHead className="text-right text-xs">
                              Cant.
                            </TableHead>
                            <TableHead className="text-right text-xs">
                              Costo U.
                            </TableHead>
                            <TableHead className="text-right text-xs">
                              Subtotal
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sheetReceta.ingredientes.map((ing, i) => (
                            <TableRow key={ing.id ?? i}>
                              <TableCell className="text-xs">
                                <div className="font-medium">
                                  {ing.descripcion}
                                </div>
                                {ing.producto && (
                                  <div className="text-[10px] text-neutral-500">
                                    {ing.producto.codigo} · {ing.producto.nombre}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono">
                                {ing.cantidad}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {formatCurrency(ing.costoUnitario)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">
                                {formatCurrency(ing.subtotal)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {sheetReceta.ingredientes.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="text-center text-xs text-neutral-500 py-3"
                              >
                                Sin ingredientes
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-3">
                    <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase flex items-center gap-1">
                      <Coins className="w-3 h-3" /> Calcular costo
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Cantidad a producir</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={calcCantidad}
                          onChange={(e) =>
                            setCalcCantidad(parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Bodega (stock)</Label>
                        <Select
                          value={calcBodega}
                          onValueChange={setCalcBodega}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Bodega" />
                          </SelectTrigger>
                          <SelectContent>
                            {bodegas.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={onCalcularCosto}
                    >
                      <Coins className="w-4 h-4" /> Calcular costo estimado
                    </Button>

                    {calcResultado && (
                      <div className="space-y-2">
                        <div className="rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-2 max-h-60 overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">
                                  Ingrediente
                                </TableHead>
                                <TableHead className="text-right text-xs">
                                  Req.
                                </TableHead>
                                <TableHead className="text-right text-xs">
                                  Disp.
                                </TableHead>
                                <TableHead className="text-right text-xs">
                                  Subt.
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {calcResultado.ingredientes.map(
                                (ing: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs">
                                      {ing.descripcion}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-mono">
                                      {ing.cantidadRequerida}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-mono">
                                      {ing.stockActual !== null &&
                                      ing.stockActual !== undefined
                                        ? ing.stockActual
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-right text-xs">
                                      {formatCurrency(ing.subtotal)}
                                    </TableCell>
                                  </TableRow>
                                ),
                              )}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded bg-emerald-100 dark:bg-emerald-950/40 p-2">
                            <div className="text-emerald-700 dark:text-emerald-300">
                              Costo total
                            </div>
                            <div className="font-bold text-sm">
                              {formatCurrency(calcResultado.totalCosto)}
                            </div>
                          </div>
                          <div className="rounded bg-emerald-100 dark:bg-emerald-950/40 p-2">
                            <div className="text-emerald-700 dark:text-emerald-300">
                              Costo unitario
                            </div>
                            <div className="font-bold text-sm">
                              {formatCurrency(calcResultado.costoUnitario)}
                            </div>
                          </div>
                        </div>
                        {calcResultado.verificacionStock && (
                          <div
                            className={`text-xs rounded p-2 ${
                              calcResultado.verificacionStock.todoDisponible
                                ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                : "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
                            }`}
                          >
                            {calcResultado.verificacionStock.todoDisponible
                              ? "✓ Stock suficiente para todos los ingredientes"
                              : "✗ Stock insuficiente en algunos ingredientes"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* ============= TAB HISTÓRICO ============= */}
        <TabsContent value="historico" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileBarChart className="w-4 h-4 text-emerald-600" />
                Histórico de producción
              </CardTitle>
              <CardDescription className="text-xs">
                Órdenes finalizadas y anuladas con KPIs del período.
              </CardDescription>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <div>
                  <Label className="text-[11px] text-neutral-500">
                    Desde
                  </Label>
                  <Input
                    type="date"
                    value={histInicio}
                    onChange={(e) => setHistInicio(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-neutral-500">Hasta</Label>
                  <Input
                    type="date"
                    value={histFin}
                    onChange={(e) => setHistFin(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <Button size="sm" onClick={cargarHistorico}>
                  <Filter className="w-4 h-4" />
                  Aplicar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Total órdenes"
                  value={String(historico.length)}
                  Icon={ListChecks}
                />
                <KpiCard
                  label="Unidades producidas"
                  value={String(
                    historico
                      .filter((o) => o.estado === "finalizada")
                      .reduce((s, o) => s + (o.cantidadProducida || 0), 0),
                  )}
                  Icon={Boxes}
                />
                <KpiCard
                  label="Costo total producido"
                  value={formatCurrency(
                    historico
                      .filter((o) => o.estado === "finalizada")
                      .reduce((s, o) => s + (o.costoTotal || 0), 0),
                  )}
                  Icon={Coins}
                  highlight
                />
                <KpiCard
                  label="Órdenes anuladas"
                  value={String(
                    historico.filter((o) => o.estado === "anulada").length,
                  )}
                  Icon={Ban}
                />
              </div>

              <div className="max-h-[calc(100vh-420px)] overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                {loading ? (
                  <div className="p-4 space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : historico.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-500">
                    No hay órdenes en el período seleccionado.
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900">
                      <TableRow>
                        <TableHead className="text-xs">Número</TableHead>
                        <TableHead className="text-xs">Fecha fin</TableHead>
                        <TableHead className="text-xs">Producto</TableHead>
                        <TableHead className="text-right text-xs">
                          Cant. prod.
                        </TableHead>
                        <TableHead className="text-right text-xs">
                          Costo total
                        </TableHead>
                        <TableHead className="text-right text-xs">
                          Costo unit.
                        </TableHead>
                        <TableHead className="text-xs">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((o) => {
                        const est = getEstado(o.estado);
                        return (
                          <TableRow
                            key={o.id}
                            className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                            onClick={() => onSelectOrden(o)}
                          >
                            <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                              {o.numero}
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtFecha(o.fechaFin)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {o.productoResultante?.nombre ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {o.cantidadProducida}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium">
                              {formatCurrency(o.costoTotal)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatCurrency(o.costoUnitario)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] gap-1 ${est.color}`}
                              >
                                <est.Icon className="w-3 h-3" />
                                {est.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============= DIÁLOGOS ============= */}
      <DialogNuevaOrden
        open={dlgNueva}
        onClose={() => setDlgNueva(false)}
        productos={productos}
        recetas={recetas}
        bodegas={bodegas}
        onSaved={(o) => {
          toast.success(`Orden ${o.numero} creada`);
          setDlgNueva(false);
          setTab("ordenes");
          cargarOrdenes();
        }}
        onError={(m) => toast.error(m)}
      />

      <DialogReceta
        open={dlgRecetaNew || !!dlgReceta}
        receta={dlgReceta}
        productos={productos}
        onClose={() => {
          setDlgReceta(null);
          setDlgRecetaNew(false);
        }}
        onSaved={() => {
          toast.success("Receta guardada");
          setDlgReceta(null);
          setDlgRecetaNew(false);
          cargarRecetas();
        }}
        onError={(m) => toast.error(m)}
      />

      {/* Iniciar */}
      <Dialog
        open={!!dlgIniciar}
        onOpenChange={(v) => !v && setDlgIniciar(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-teal-600" />
              Iniciar orden {dlgIniciar?.numero}
            </DialogTitle>
            <DialogDescription>
              Se cambiará el estado a <b>en_proceso</b> y se registrarán las
              salidas de materias primas de los detalles de la orden. Se
              validará que haya stock suficiente en la bodega.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Bodega de salida</Label>
              <Select value={iniBodega} onValueChange={setIniBodega}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona bodega" />
                </SelectTrigger>
                <SelectContent>
                  {bodegas.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgIniciar(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={onIniciar}
            >
              <PlayCircle className="w-4 h-4" />
              Iniciar producción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalizar */}
      <Dialog
        open={!!dlgFinalizar}
        onOpenChange={(v) => !v && setDlgFinalizar(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StopCircle className="w-4 h-4 text-emerald-600" />
              Finalizar orden {dlgFinalizar?.numero}
            </DialogTitle>
            <DialogDescription>
              Se registrará la <b>entrada del producto terminado</b> a la
              bodega seleccionada y se generará el <b>asiento contable</b> de
              producción (débito 150505 / créditos 150505 + 2335 + 7205).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cantidad producida</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={finCantidad}
                onChange={(e) =>
                  setFinCantidad(parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <Label className="text-xs">Bodega de entrada del producto</Label>
              <Select value={finBodega} onValueChange={setFinBodega}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona bodega" />
                </SelectTrigger>
                <SelectContent>
                  {bodegas.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {dlgFinalizar && (
              <div className="text-xs rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Costo total</span>
                  <span className="font-medium">
                    {formatCurrency(dlgFinalizar.costoTotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Costo unit. estimado</span>
                  <span className="font-medium">
                    {formatCurrency(
                      finCantidad > 0
                        ? dlgFinalizar.costoTotal / finCantidad
                        : 0,
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgFinalizar(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={onFinalizar}
            >
              <CheckCircle2 className="w-4 h-4" />
              Finalizar producción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anular */}
      <AlertDialog
        open={!!dlgAnular}
        onOpenChange={(v) => !v && setDlgAnular(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-600" />
              Anular orden {dlgAnular?.numero}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dlgAnular?.estado === "en_proceso"
                ? "Se reversarán las salidas de materias primas registradas (movimiento de entrada por cada salida). Esta acción no se puede deshacer."
                : "La orden pasará a estado ANULADA. Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dlgAnular?.estado === "en_proceso" && (
            <div>
              <Label className="text-xs">
                Bodega para reversar salidas
              </Label>
              <Select value={anuBodega} onValueChange={setAnuBodega}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona bodega" />
                </SelectTrigger>
                <SelectContent>
                  {bodegas.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={onAnular}
            >
              <Ban className="w-4 h-4" />
              Anular orden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Subcomponente: Sheet detalle de orden
// ============================================================
function SheetOrdenDetalle({
  orden,
  onClose,
  onIniciar,
  onFinalizar,
  onAnular,
}: {
  orden: OrdenProduccion | null;
  onClose: () => void;
  onIniciar: (o: OrdenProduccion) => void;
  onFinalizar: (o: OrdenProduccion) => void;
  onAnular: (o: OrdenProduccion) => void;
}) {
  if (!orden) return null;
  const est = getEstado(orden.estado);
  const totalMP = orden.costoMateriaPrima || 0;
  const totalMO = orden.costoManoObra || 0;
  const totalCI = orden.costoIndirectos || 0;
  const total = orden.costoTotal || 0;

  const detallesMP = (orden.detalles || []).filter(
    (d) => d.tipo === "materia_prima",
  );
  const detallesMO = (orden.detalles || []).filter(
    (d) => d.tipo === "mano_obra",
  );
  const detallesCI = (orden.detalles || []).filter(
    (d) => d.tipo === "costo_indirecto",
  );

  return (
    <Sheet open={!!orden} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Factory className="w-4 h-4 text-emerald-600" />
            Orden {orden.numero}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] gap-1 ${est.color}`}>
              <est.Icon className="w-3 h-3" />
              {est.label}
            </Badge>
            <span>Inicio {fmtFechaHora(orden.fechaInicio)}</span>
            {orden.fechaFin && (
              <span>· Fin {fmtFechaHora(orden.fechaFin)}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* KPIs orden */}
          <div className="grid grid-cols-3 gap-2">
            <CardDetalle
              title="Materia prima"
              value={formatCurrency(totalMP)}
              color="amber"
            />
            <CardDetalle
              title="Mano de obra"
              value={formatCurrency(totalMO)}
              color="teal"
            />
            <CardDetalle
              title="Costos indirectos"
              value={formatCurrency(totalCI)}
              color="violet"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <CardDetalle
              title="A producir"
              value={String(orden.cantidadProducir)}
              color="emerald"
            />
            <CardDetalle
              title="Producida"
              value={String(orden.cantidadProducida)}
              color="emerald"
            />
            <CardDetalle
              title="Costo unitario"
              value={formatCurrency(orden.costoUnitario)}
              color="emerald"
              highlight
            />
          </div>

          <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Costo total
            </div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(total)}
            </div>
          </div>

          {/* Detalles */}
          <SeccionDetalles
            title="Materias primas"
            color="amber"
            detalles={detallesMP}
          />
          <SeccionDetalles
            title="Mano de obra"
            color="teal"
            detalles={detallesMO}
          />
          <SeccionDetalles
            title="Costos indirectos"
            color="violet"
            detalles={detallesCI}
          />

          {/* Comprobante contable */}
          {orden.comprobante && (
            <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs">
              <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Asiento contable
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <div>
                  <span className="text-neutral-500">Comprobante:</span>{" "}
                  <span className="font-mono font-semibold">
                    {orden.comprobante.numero}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Fecha:</span>{" "}
                  {fmtFecha(orden.comprobante.fecha)}
                </div>
                <div>
                  <span className="text-neutral-500">Débitos:</span>{" "}
                  {formatCurrency(orden.comprobante.totalDebito)}
                </div>
                <div>
                  <span className="text-neutral-500">Créditos:</span>{" "}
                  {formatCurrency(orden.comprobante.totalCredito)}
                </div>
              </div>
            </div>
          )}

          {orden.observaciones && (
            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 text-xs">
              <div className="font-semibold mb-1">Observaciones</div>
              <p className="text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                {orden.observaciones}
              </p>
            </div>
          )}
        </div>

        {/* Acciones */}
        <SheetFooter className="flex-row flex-wrap gap-2 border-t border-neutral-200 dark:border-neutral-800">
          {orden.estado === "borrador" && (
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => onIniciar(orden)}
            >
              <PlayCircle className="w-4 h-4" />
              Iniciar
            </Button>
          )}
          {orden.estado === "en_proceso" && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onFinalizar(orden)}
            >
              <StopCircle className="w-4 h-4" />
              Finalizar
            </Button>
          )}
          {(orden.estado === "borrador" || orden.estado === "en_proceso") && (
            <Button
              size="sm"
              variant="outline"
              className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              onClick={() => onAnular(orden)}
            >
              <Ban className="w-4 h-4" />
              Anular
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SeccionDetalles({
  title,
  color,
  detalles,
}: {
  title: string;
  color: "amber" | "teal" | "violet";
  detalles: DetalleOrden[];
}) {
  const colorClass =
    color === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : color === "teal"
        ? "text-teal-700 dark:text-teal-300"
        : "text-violet-700 dark:text-violet-300";
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase mb-1 ${colorClass}`}>
        {title} ({detalles.length})
      </h4>
      {detalles.length === 0 ? (
        <div className="text-[11px] text-neutral-500 italic">
          Sin detalles de este tipo
        </div>
      ) : (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <Table>
            <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
              <TableRow>
                <TableHead className="text-xs">Descripción</TableHead>
                <TableHead className="text-right text-xs">Cant.</TableHead>
                <TableHead className="text-right text-xs">Costo U.</TableHead>
                <TableHead className="text-right text-xs">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalles.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs">
                    <div className="font-medium">{d.descripcion}</div>
                    {d.producto && (
                      <div className="text-[10px] text-neutral-500">
                        {d.producto.codigo} · {d.producto.nombre}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {d.cantidad}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {formatCurrency(d.costoUnitario)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    {formatCurrency(d.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CardDetalle({
  title,
  value,
  color,
  highlight,
}: {
  title: string;
  value: string;
  color: "amber" | "teal" | "violet" | "emerald";
  highlight?: boolean;
}) {
  const colorClass = {
    amber:
      "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300",
    teal:
      "border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300",
    violet:
      "border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300",
    emerald:
      "border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300",
  }[color];
  return (
    <div
      className={`rounded-md border p-2 ${colorClass} ${
        highlight ? "ring-1 ring-emerald-400/40" : ""
      }`}
    >
      <div className="text-[10px] uppercase opacity-80">{title}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

// ============================================================
// Subcomponente: KPI Card (histórico)
// ============================================================
function KpiCard({
  label,
  value,
  Icon,
  highlight,
}: {
  label: string;
  value: string;
  Icon: any;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight
          ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
          : ""
      }
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center ${
              highlight
                ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase text-neutral-500 truncate">
              {label}
            </div>
            <div
              className={`text-sm font-bold truncate ${
                highlight ? "text-emerald-700 dark:text-emerald-300" : ""
              }`}
            >
              {value}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Subcomponente: FormNuevaOrden (inline tab)
// ============================================================
interface DetalleEditable {
  tipo: "materia_prima" | "mano_obra" | "costo_indirecto";
  productoId?: string;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
}

function FormNuevaOrden({
  productos,
  recetas,
  bodegas,
  onSaved,
  onError,
}: {
  productos: Producto[];
  recetas: Receta[];
  bodegas: Bodega[];
  onSaved: (o: OrdenProduccion) => void;
  onError: (m: string) => void;
}) {
  const [productoResultanteId, setProductoResultanteId] = useState("");
  const [cantidadProducir, setCantidadProducir] = useState(1);
  const [recetaId, setRecetaId] = useState<string>("");
  const [modo, setModo] = useState<"receta" | "manual">("manual");
  const [observaciones, setObservaciones] = useState("");
  const [detalles, setDetalles] = useState<DetalleEditable[]>([]);
  const [bodegaStock, setBodegaStock] = useState<string>("");
  const [verificacion, setVerificacion] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cargar detalles de receta al seleccionar
  useEffect(() => {
    if (modo !== "receta" || !recetaId) {
      return;
    }
    const r = recetas.find((x) => x.id === recetaId);
    if (!r) return;
    // Heredar producto resultante
    if (!productoResultanteId) setProductoResultanteId(r.productoId);
    // Cargar ingredientes como detalles materia_prima
    setDetalles(
      r.ingredientes.map((ing) => ({
        tipo: "materia_prima" as const,
        productoId: ing.productoId ?? undefined,
        descripcion: ing.descripcion,
        cantidad: Number((ing.cantidad * cantidadProducir).toFixed(4)),
        costoUnitario: ing.costoUnitario,
      })),
    );
  }, [recetaId, modo, recetas, cantidadProducir, productoResultanteId]);

  // Recalcular cantidades de ingredientes al cambiar cantidadProducir (modo receta)
  useEffect(() => {
    if (modo !== "receta" || !recetaId) return;
    const r = recetas.find((x) => x.id === recetaId);
    if (!r) return;
    setDetalles((prev) =>
      prev.map((d, i) => {
        const ing = r.ingredientes[i];
        if (!ing) return d;
        return {
          ...d,
          cantidad: Number((ing.cantidad * cantidadProducir).toFixed(4)),
        };
      }),
    );
  }, [cantidadProducir, modo, recetaId, recetas]);

  const totales = useMemo(() => {
    let mp = 0,
      mo = 0,
      ci = 0;
    for (const d of detalles) {
      const sub = Number((d.cantidad * d.costoUnitario).toFixed(2));
      if (d.tipo === "materia_prima") mp += sub;
      else if (d.tipo === "mano_obra") mo += sub;
      else ci += sub;
    }
    const total = mp + mo + ci;
    const unit = cantidadProducir > 0 ? total / cantidadProducir : 0;
    return { mp, mo, ci, total, unit };
  }, [detalles, cantidadProducir]);

  const addDetalle = () => {
    setDetalles((p) => [
      ...p,
      {
        tipo: "materia_prima",
        descripcion: "",
        cantidad: 1,
        costoUnitario: 0,
      },
    ]);
  };

  const updateDetalle = (idx: number, patch: Partial<DetalleEditable>) => {
    setDetalles((p) =>
      p.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  };

  const removeDetalle = (idx: number) => {
    setDetalles((p) => p.filter((_, i) => i !== idx));
  };

  const verificarStock = async () => {
    if (!bodegaStock) {
      onError("Selecciona una bodega para verificar stock");
      return;
    }
    if (modo === "receta" && recetaId) {
      try {
        setVerifying(true);
        const r = await apiGet<any>(
          `/api/produccion/recetas/${recetaId}/calcular-costo?cantidad=${cantidadProducir}&bodegaId=${bodegaStock}`,
        );
        setVerificacion(r);
      } catch (e: any) {
        onError(e.message);
      } finally {
        setVerifying(false);
      }
    } else {
      // Verificar a mano cada materia_prima
      const mps = detalles.filter(
        (d) => d.tipo === "materia_prima" && d.productoId,
      );
      if (!mps.length) {
        setVerificacion({
          ingredientes: [],
          totalCosto: totales.total,
          todoDisponible: true,
        });
        return;
      }
      try {
        setVerifying(true);
        const saldos = await apiGet<any[]>(
          `/api/inventario?op=saldos`,
        );
        const smap = new Map(
          saldos
            .filter((s: any) => s.bodegaId === bodegaStock)
            .map((s: any) => [s.productoId, s.cantidad]),
        );
        const ingredientes = mps.map((d) => ({
          descripcion: d.descripcion,
          productoId: d.productoId,
          cantidadRequerida: d.cantidad,
          stockActual: d.productoId ? smap.get(d.productoId) ?? 0 : 0,
          disponible: d.productoId
            ? (smap.get(d.productoId) ?? 0) >= d.cantidad
            : false,
        }));
        const todoDisponible = ingredientes.every((x) => x.disponible);
        setVerificacion({
          ingredientes,
          totalCosto: totales.total,
          todoDisponible,
        });
      } catch (e: any) {
        onError(e.message);
      } finally {
        setVerifying(false);
      }
    }
  };

  const guardar = async () => {
    if (!productoResultanteId) {
      onError("Selecciona el producto resultante");
      return;
    }
    if (cantidadProducir <= 0) {
      onError("La cantidad a producir debe ser > 0");
      return;
    }
    if (detalles.length === 0) {
      onError(
        "Agrega al menos un detalle (materia prima, mano de obra o costo indirecto)",
      );
      return;
    }
    for (const d of detalles) {
      if (!d.descripcion.trim()) {
        onError("Todos los detalles deben tener descripción");
        return;
      }
      if (d.cantidad <= 0) {
        onError("Las cantidades deben ser > 0");
        return;
      }
    }
    try {
      setSaving(true);
      const payload: any = {
        productoResultanteId,
        cantidadProducir,
        observaciones: observaciones || undefined,
        detalles: detalles.map((d) => ({
          tipo: d.tipo,
          productoId: d.productoId || undefined,
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          costoUnitario: d.costoUnitario,
        })),
      };
      if (modo === "receta" && recetaId) payload.recetaId = recetaId;
      const r = await apiPost<OrdenProduccion>(
        `/api/produccion/ordenes`,
        payload,
      );
      onSaved(r);
      // reset
      setProductoResultanteId("");
      setCantidadProducir(1);
      setRecetaId("");
      setObservaciones("");
      setDetalles([]);
      setVerificacion(null);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-600" />
          Nueva orden de producción
        </CardTitle>
        <CardDescription className="text-xs">
          Se generará un número <code>PROD-2026-NNNNNN</code> y estado inicial{" "}
          <b>borrador</b>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cabecera */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Producto resultante</Label>
            <Select
              value={productoResultanteId}
              onValueChange={setProductoResultanteId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Producto terminado" />
              </SelectTrigger>
              <SelectContent>
                {productos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.codigo} · {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cantidad a producir</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={cantidadProducir}
              onChange={(e) =>
                setCantidadProducir(parseFloat(e.target.value) || 0)
              }
            />
          </div>
        </div>

        {/* Modo */}
        <div>
          <Label className="text-xs">Modo de captura</Label>
          <div className="flex items-center gap-2 mt-1">
            <Button
              size="sm"
              variant={modo === "manual" ? "default" : "outline"}
              onClick={() => {
                setModo("manual");
                setRecetaId("");
              }}
            >
              Manual
            </Button>
            <Button
              size="sm"
              variant={modo === "receta" ? "default" : "outline"}
              onClick={() => setModo("receta")}
            >
              Desde receta
            </Button>
            {modo === "receta" && (
              <Select value={recetaId} onValueChange={setRecetaId}>
                <SelectTrigger className="flex-1 min-w-[200px]">
                  <SelectValue placeholder="Selecciona receta" />
                </SelectTrigger>
                <SelectContent>
                  {recetas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre} — {r.producto?.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Detalles */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">Detalles ({detalles.length})</Label>
            <Button size="sm" variant="outline" onClick={addDetalle}>
              <Plus className="w-4 h-4" />
              Agregar detalle
            </Button>
          </div>
          {detalles.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-center text-xs text-neutral-500">
              Sin detalles. Agrega materias primas, mano de obra o costos
              indirectos.
            </div>
          ) : (
            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
              <Table>
                <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
                  <TableRow>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Producto</TableHead>
                    <TableHead className="text-xs">Descripción</TableHead>
                    <TableHead className="text-right text-xs">Cant.</TableHead>
                    <TableHead className="text-right text-xs">
                      Costo U.
                    </TableHead>
                    <TableHead className="text-right text-xs">Subt.</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalles.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Select
                          value={d.tipo}
                          onValueChange={(v) =>
                            updateDetalle(i, { tipo: v as any })
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="materia_prima">
                              Materia prima
                            </SelectItem>
                            <SelectItem value="mano_obra">
                              Mano de obra
                            </SelectItem>
                            <SelectItem value="costo_indirecto">
                              Costo indirecto
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {d.tipo === "materia_prima" ? (
                          <Select
                            value={d.productoId || ""}
                            onValueChange={(v) =>
                              updateDetalle(i, {
                                productoId: v,
                                descripcion:
                                  productos.find((p) => p.id === v)?.nombre ??
                                  d.descripcion,
                              })
                            }
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue placeholder="Producto" />
                            </SelectTrigger>
                            <SelectContent>
                              {productos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.codigo} · {p.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={d.descripcion}
                          onChange={(e) =>
                            updateDetalle(i, { descripcion: e.target.value })
                          }
                          className="w-[180px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={d.cantidad}
                          onChange={(e) =>
                            updateDetalle(i, {
                              cantidad: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-[90px] text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={d.costoUnitario}
                          onChange={(e) =>
                            updateDetalle(i, {
                              costoUnitario: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-[110px] text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {formatCurrency(d.cantidad * d.costoUnitario)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 h-8 w-8 p-0"
                          onClick={() => removeDetalle(i)}
                        >
                          ×
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-2">
            <div className="text-amber-700 dark:text-amber-300 uppercase text-[10px]">
              Materia prima
            </div>
            <div className="font-bold">{formatCurrency(totales.mp)}</div>
          </div>
          <div className="rounded border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 p-2">
            <div className="text-teal-700 dark:text-teal-300 uppercase text-[10px]">
              Mano de obra
            </div>
            <div className="font-bold">{formatCurrency(totales.mo)}</div>
          </div>
          <div className="rounded border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-2">
            <div className="text-violet-700 dark:text-violet-300 uppercase text-[10px]">
              Costos indirectos
            </div>
            <div className="font-bold">{formatCurrency(totales.ci)}</div>
          </div>
          <div className="rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-2">
            <div className="text-emerald-700 dark:text-emerald-300 uppercase text-[10px]">
              Total
            </div>
            <div className="font-bold text-sm">
              {formatCurrency(totales.total)}
            </div>
          </div>
          <div className="rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-2">
            <div className="text-emerald-700 dark:text-emerald-300 uppercase text-[10px]">
              Costo unitario
            </div>
            <div className="font-bold text-sm">
              {formatCurrency(totales.unit)}
            </div>
          </div>
        </div>

        {/* Verificar stock */}
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <PackageOpen className="w-4 h-4 text-emerald-600" />
              <Label className="text-xs font-semibold">Verificar stock</Label>
            </div>
            <div className="flex items-center gap-2">
              <Select value={bodegaStock} onValueChange={setBodegaStock}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Bodega" />
                </SelectTrigger>
                <SelectContent>
                  {bodegas.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={verificarStock}
                disabled={verifying}
              >
                {verifying ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ListChecks className="w-4 h-4" />
                )}
                Verificar
              </Button>
            </div>
          </div>
          {verificacion && (
            <div
              className={`text-xs rounded p-2 ${
                verificacion.todoDisponible
                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
              } flex items-center gap-1`}
            >
              {verificacion.todoDisponible ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              {verificacion.todoDisponible
                ? "Stock suficiente para producir esta orden"
                : "Stock insuficiente para algunos ingredientes"}
            </div>
          )}
        </div>

        {/* Observaciones */}
        <div>
          <Label className="text-xs">Observaciones</Label>
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            placeholder="Notas sobre la orden…"
          />
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-3">
          <Button onClick={guardar} disabled={saving}>
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Crear orden
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Subcomponente: DialogNuevaOrden (modal wrapper)
// ============================================================
function DialogNuevaOrden({
  open,
  onClose,
  productos,
  recetas,
  bodegas,
  onSaved,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  productos: Producto[];
  recetas: Receta[];
  bodegas: Bodega[];
  onSaved: (o: OrdenProduccion) => void;
  onError: (m: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva orden de producción</DialogTitle>
          <DialogDescription>
            Completa los detalles de la transformación.
          </DialogDescription>
        </DialogHeader>
        <FormNuevaOrden
          productos={productos}
          recetas={recetas}
          bodegas={bodegas}
          onSaved={onSaved}
          onError={onError}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Subcomponente: DialogReceta
// ============================================================
function DialogReceta({
  open,
  receta,
  productos,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  receta: Receta | null;
  productos: Producto[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const isEdit = !!receta;
  const [productoId, setProductoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [rendimiento, setRendimiento] = useState(1);
  const [activa, setActiva] = useState(true);
  const [ingredientes, setIngredientes] = useState<
    {
      productoId?: string;
      descripcion: string;
      cantidad: number;
      costoUnitario: number;
    }[]
  >([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (receta) {
      setProductoId(receta.productoId);
      setNombre(receta.nombre);
      setDescripcion(receta.descripcion || "");
      setRendimiento(receta.rendimiento);
      setActiva(receta.activa);
      setIngredientes(
        receta.ingredientes.map((ing) => ({
          productoId: ing.productoId ?? undefined,
          descripcion: ing.descripcion,
          cantidad: ing.cantidad,
          costoUnitario: ing.costoUnitario,
        })),
      );
    } else {
      setProductoId("");
      setNombre("");
      setDescripcion("");
      setRendimiento(1);
      setActiva(true);
      setIngredientes([]);
    }
  }, [receta, open]);

  const addIng = () => {
    setIngredientes((p) => [
      ...p,
      { descripcion: "", cantidad: 1, costoUnitario: 0 },
    ]);
  };
  const updateIng = (i: number, patch: any) => {
    setIngredientes((p) =>
      p.map((x, j) => (i === j ? { ...x, ...patch } : x)),
    );
  };
  const removeIng = (i: number) => {
    setIngredientes((p) => p.filter((_, j) => j !== i));
  };

  const totalCosto = ingredientes.reduce(
    (s, x) => s + x.cantidad * x.costoUnitario,
    0,
  );

  const guardar = async () => {
    if (!productoId) {
      onError("Selecciona un producto");
      return;
    }
    if (!nombre.trim()) {
      onError("El nombre es obligatorio");
      return;
    }
    for (const ing of ingredientes) {
      if (!ing.descripcion.trim()) {
        onError("Todos los ingredientes deben tener descripción");
        return;
      }
    }
    try {
      setSaving(true);
      const payload: any = {
        productoId,
        nombre,
        descripcion: descripcion || undefined,
        rendimiento,
        activa,
        ingredientes: ingredientes.map((x) => ({
          productoId: x.productoId || null,
          descripcion: x.descripcion,
          cantidad: x.cantidad,
          costoUnitario: x.costoUnitario,
        })),
      };
      if (isEdit && receta) {
        await apiPost(`/api/produccion/recetas/${receta.id}`, payload, "PUT");
      } else {
        await apiPost(`/api/produccion/recetas`, payload, "POST");
      }
      onSaved();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="w-4 h-4 text-emerald-600" />
            {isEdit ? "Editar receta" : "Nueva receta"}
          </DialogTitle>
          <DialogDescription>
            Define los ingredientes y costos para producir una unidad del
            producto terminado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Producto terminado</Label>
              <Select value={productoId} onValueChange={setProductoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} · {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nombre de la receta</Label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Pan de molde estándar"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Rendimiento (1 u → N u)</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={rendimiento}
                onChange={(e) =>
                  setRendimiento(parseFloat(e.target.value) || 1)
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={activa} onCheckedChange={setActiva} />
              <Label className="text-xs">Activa</Label>
            </div>
          </div>

          {/* Ingredientes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">
                Ingredientes ({ingredientes.length})
              </Label>
              <Button size="sm" variant="outline" onClick={addIng}>
                <Plus className="w-4 h-4" />
                Agregar ingrediente
              </Button>
            </div>
            {ingredientes.length === 0 ? (
              <div className="rounded border border-dashed border-neutral-300 dark:border-neutral-700 p-3 text-center text-xs text-neutral-500">
                Sin ingredientes. Agrega materias primas con sus cantidades por
                unidad.
              </div>
            ) : (
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
                    <TableRow>
                      <TableHead className="text-xs">Producto</TableHead>
                      <TableHead className="text-xs">Descripción</TableHead>
                      <TableHead className="text-right text-xs">
                        Cant.
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        Costo U.
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        Subt.
                      </TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ingredientes.map((ing, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Select
                            value={ing.productoId || ""}
                            onValueChange={(v) =>
                              updateIng(i, {
                                productoId: v,
                                descripcion:
                                  productos.find((p) => p.id === v)?.nombre ??
                                  ing.descripcion,
                              })
                            }
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue placeholder="Producto" />
                            </SelectTrigger>
                            <SelectContent>
                              {productos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.codigo} · {p.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={ing.descripcion}
                            onChange={(e) =>
                              updateIng(i, { descripcion: e.target.value })
                            }
                            className="w-[160px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={ing.cantidad}
                            onChange={(e) =>
                              updateIng(i, {
                                cantidad: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-[80px] text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={ing.costoUnitario}
                            onChange={(e) =>
                              updateIng(i, {
                                costoUnitario:
                                  parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-[100px] text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {formatCurrency(ing.cantidad * ing.costoUnitario)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 h-8 w-8 p-0"
                            onClick={() => removeIng(i)}
                          >
                            ×
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {ingredientes.length > 0 && (
              <div className="mt-2 text-right text-xs">
                <span className="text-neutral-500">
                  Costo total por unidad:
                </span>{" "}
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(totalCosto)}
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Guardar receta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
