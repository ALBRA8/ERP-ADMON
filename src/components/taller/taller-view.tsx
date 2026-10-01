"use client";

// ============================================================
// ERP Marsella — Vista Taller / Servicio Técnico (Hermes §5.18)
// Tabs: Órdenes | Mis órdenes | Histórico
// Acento emerald/teal, dark mode, responsive mobile-first.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Wrench,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ClipboardList,
  CheckCircle2,
  Ban,
  FileBarChart,
  UserCog,
  CircleDollarSign,
  Activity,
  PlayCircle,
  StopCircle,
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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

const ESTADO_OST: Record<
  string,
  { label: string; color: string; Icon: any }
> = {
  ingresado: {
    label: "Ingresado",
    color:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
    Icon: ClipboardList,
  },
  diagnostico: {
    label: "Diagnóstico",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    Icon: Activity,
  },
  en_reparacion: {
    label: "En reparación",
    color:
      "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
    Icon: PlayCircle,
  },
  listo: {
    label: "Listo",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  entregado: {
    label: "Entregado",
    color:
      "bg-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800",
    Icon: CheckCircle2,
  },
  anulado: {
    label: "Anulado",
    color:
      "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    Icon: Ban,
  },
};

function getEstado(estado: string) {
  return (
    ESTADO_OST[estado] ?? {
      label: estado,
      color:
        "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
      Icon: ClipboardList,
    }
  );
}

// ---------- Tipos ----------
interface Tercero {
  id: string;
  nombre: string;
  numeroDocumento: string;
  telefono?: string | null;
}

interface DetalleServicio {
  id: string;
  tipo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  createdAt: string;
}

interface OrdenServicio {
  id: string;
  numero: string;
  terceroId?: string | null;
  tercero?: Tercero | null;
  tecnicoAsignadoId?: string | null;
  tecnico?: Tercero | null;
  fechaIngreso: string;
  fechaEntrega?: string | null;
  estado: string;
  equipo: string;
  marca?: string | null;
  modelo?: string | null;
  serial?: string | null;
  problemaReportado: string;
  diagnostico?: string | null;
  observaciones?: string | null;
  valorRepuestos: number;
  valorManoObra: number;
  valorTotal: number;
  facturaId?: string | null;
  detalleServicioTecnicos?: DetalleServicio[];
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
export function TallerView() {
  const [tab, setTab] = useState("ordenes");
  const [loading, setLoading] = useState(false);

  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("");
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>("");

  const [historico, setHistorico] = useState<OrdenServicio[]>([]);
  const [totalHistorico, setTotalHistorico] = useState(0);

  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [tecnicos, setTecnicos] = useState<Tercero[]>([]);

  // Diálogos
  const [dlgOrden, setDlgOrden] = useState(false);
  const [dlgDiagnostico, setDlgDiagnostico] = useState(false);
  const [dlgDetalle, setDlgDetalle] = useState(false);
  const [dlgEntregar, setDlgEntregar] = useState(false);

  // Sheet
  const [sheetOrden, setSheetOrden] = useState<OrdenServicio | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargarOrdenes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (q) params.set("q", q);
      if (estadoFiltro && estadoFiltro !== "ALL")
        params.set("estado", estadoFiltro);
      if (tecnicoFiltro && tecnicoFiltro !== "ALL")
        params.set("tecnicoId", tecnicoFiltro);
      const data = await apiGet<{ items: OrdenServicio[]; total: number }>(
        `/api/taller/ordenes?${params.toString()}`,
      );
      setOrdenes(data.items);
      setTotal(data.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar órdenes");
    } finally {
      setLoading(false);
    }
  }, [q, estadoFiltro, tecnicoFiltro]);

  const cargarHistorico = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      params.set("estado", "entregado");
      const entregadas = await apiGet<{ items: OrdenServicio[]; total: number }>(
        `/api/taller/ordenes?${params.toString()}`,
      );
      const params2 = new URLSearchParams({ page: "1", pageSize: "200" });
      params2.set("estado", "anulado");
      const anuladas = await apiGet<{ items: OrdenServicio[]; total: number }>(
        `/api/taller/ordenes?${params2.toString()}`,
      );
      const todas = [...entregadas.items, ...anuladas.items].sort(
        (a, b) =>
          new Date(b.fechaIngreso).getTime() -
          new Date(a.fechaIngreso).getTime(),
      );
      setHistorico(todas);
      setTotalHistorico(entregadas.total + anuladas.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar histórico");
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarTerceros = useCallback(async () => {
    try {
      const data = await apiGet<{ items: Tercero[] }>(
        `/api/terceros?pageSize=500`,
      );
      setTerceros(data.items);
      // Filtrar empleados como técnicos potenciales
      setTecnicos(
        data.items.filter(
          (t: any) => t.tipo === "empleado" || t.tipo === "todos",
        ),
      );
    } catch {
      /* opcional */
    }
  }, []);

  useEffect(() => {
    cargarOrdenes();
    cargarTerceros();
  }, [cargarOrdenes, cargarTerceros]);

  useEffect(() => {
    if (tab === "historico") cargarHistorico();
  }, [tab, cargarHistorico]);

  // Cargar detalle al abrir sheet
  const abrirSheet = async (o: OrdenServicio) => {
    setSheetOrden(o);
    setLoadingDetalle(true);
    try {
      const full = await apiGet<OrdenServicio>(`/api/taller/ordenes/${o.id}`);
      setSheetOrden(full);
    } catch (e: any) {
      // mantén el resumen
    } finally {
      setLoadingDetalle(false);
    }
  };

  // Acciones de estado
  const accionEstado = async (
    accion:
      | "diagnostico"
      | "iniciar"
      | "finalizar"
      | "anular",
    body?: any,
  ) => {
    if (!sheetOrden) return;
    try {
      const map = {
        diagnostico: "diagnostico",
        iniciar: "iniciar-reparacion",
        finalizar: "finalizar",
        anular: "anular",
      };
      await apiPost(
        `/api/taller/ordenes/${sheetOrden.id}/${map[accion]}`,
        body ?? {},
      );
      toast.success(`Acción "${accion}" ejecutada`);
      await abrirSheet(sheetOrden);
      cargarOrdenes();
    } catch (e: any) {
      toast.error(e.message ?? `Error en ${accion}`);
    }
  };

  // Total facturado en histórico
  const totalFacturado = historico
    .filter((o) => o.estado === "entregado")
    .reduce((s, o) => s + (o.valorTotal || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Taller / Servicio Técnico
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Recepción, diagnóstico, reparación y entrega de equipos
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cargarOrdenes();
            cargarTerceros();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="ordenes">Órdenes</TabsTrigger>
          <TabsTrigger value="mis">Mis órdenes</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ---------- TAB 1: ÓRDENES ---------- */}
        <TabsContent value="ordenes" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Órdenes de servicio</CardTitle>
                  <CardDescription>
                    {total} orden(es) registrada(s)
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-neutral-400" />
                    <Input
                      placeholder="Buscar por #/equipo…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="pl-8 w-44"
                    />
                  </div>
                  <Select
                    value={estadoFiltro || "ALL"}
                    onValueChange={(v) => setEstadoFiltro(v === "ALL" ? "" : v)}
                  >
                    <SelectTrigger className="w-40">
                      <Filter className="w-3.5 h-3.5 mr-1 text-neutral-400" />
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="ingresado">Ingresado</SelectItem>
                      <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                      <SelectItem value="en_reparacion">En reparación</SelectItem>
                      <SelectItem value="listo">Listo</SelectItem>
                      <SelectItem value="entregado">Entregado</SelectItem>
                      <SelectItem value="anulado">Anulado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => setDlgOrden(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Nueva orden
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <TablaOrdenes
                  ordenes={ordenes}
                  onClick={abrirSheet}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- TAB 2: MIS ÓRDENES ---------- */}
        <TabsContent value="mis" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Órdenes por técnico
                  </CardTitle>
                  <CardDescription>
                    Filtrar órdenes por técnico asignado
                  </CardDescription>
                </div>
                <Select
                  value={tecnicoFiltro || "ALL"}
                  onValueChange={(v) =>
                    setTecnicoFiltro(v === "ALL" ? "" : v)
                  }
                >
                  <SelectTrigger className="w-60">
                    <SelectValue placeholder="Seleccionar técnico" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    {tecnicos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <TablaOrdenes
                  ordenes={ordenes.filter(
                    (o) => !tecnicoFiltro || o.tecnicoAsignadoId === tecnicoFiltro,
                  )}
                  onClick={abrirSheet}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- TAB 3: HISTÓRICO ---------- */}
        <TabsContent value="historico" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileBarChart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Histórico de órdenes
              </CardTitle>
              <CardDescription>
                {totalHistorico} órdenes entregadas/anuladas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3">
                  <div className="text-xs text-neutral-500">Total facturado</div>
                  <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(totalFacturado)}
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                  <div className="text-xs text-neutral-500">
                    Entregadas / Anuladas
                  </div>
                  <div className="text-2xl font-bold">
                    {
                      historico.filter((o) => o.estado === "entregado")
                        .length
                    }
                    {" / "}
                    {
                      historico.filter((o) => o.estado === "anulado").length
                    }
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <TablaOrdenes
                  ordenes={historico}
                  onClick={abrirSheet}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------- DIALOGOS Y SHEET ---------- */}
      <DialogNuevaOrden
        open={dlgOrden}
        onOpenChange={(o) => {
          setDlgOrden(o);
          if (!o) cargarOrdenes();
        }}
        terceros={terceros}
      />
      <DialogDiagnostico
        open={dlgDiagnostico}
        onOpenChange={setDlgDiagnostico}
        orden={sheetOrden}
        tecnicos={tecnicos}
        onSaved={async () => {
          setDlgDiagnostico(false);
          if (sheetOrden) {
            await accionEstado("diagnostico", undefined);
          }
        }}
        // Nota: en este patrón se invoca onSaved desde el diálogo; el botón
        // principal "Guardar y diagnosticar" del sheet lo llama directamente
      />
      <DialogAgregarDetalle
        open={dlgDetalle}
        onOpenChange={setDlgDetalle}
        orden={sheetOrden}
        onSaved={async () => {
          setDlgDetalle(false);
          if (sheetOrden) await abrirSheet(sheetOrden);
        }}
      />
      <DialogEntregar
        open={dlgEntregar}
        onOpenChange={setDlgEntregar}
        orden={sheetOrden}
        onSaved={async (generarFactura) => {
          setDlgEntregar(false);
          if (!sheetOrden) return;
          try {
            const res = await apiPost<{ ok: boolean; factura?: any }>(
              `/api/taller/ordenes/${sheetOrden.id}/entregar`,
              { generarFactura },
            );
            toast.success(
              `Orden entregada${res.factura ? " con factura generada" : ""}`,
            );
            await abrirSheet(sheetOrden);
            cargarOrdenes();
          } catch (e: any) {
            toast.error(e.message ?? "Error al entregar");
          }
        }}
      />
      <SheetOrden
        orden={sheetOrden}
        loading={loadingDetalle}
        onOpenChange={(o) => !o && setSheetOrden(null)}
        onDiagnostico={() => setDlgDiagnostico(true)}
        onAgregarDetalle={() => setDlgDetalle(true)}
        onIniciar={() => accionEstado("iniciar")}
        onFinalizar={() => accionEstado("finalizar")}
        onEntregar={() => setDlgEntregar(true)}
        onAnular={() => accionEstado("anular")}
      />
    </div>
  );
}

// ============================================================
// Tabla reutilizable de órdenes
// ============================================================
function TablaOrdenes({
  ordenes,
  onClick,
}: {
  ordenes: OrdenServicio[];
  onClick: (o: OrdenServicio) => void;
}) {
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-white dark:bg-neutral-900">
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Ingreso</TableHead>
            <TableHead>Tercero</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead>Marca/Modelo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Valor total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-neutral-500 py-8">
                No hay órdenes para mostrar
              </TableCell>
            </TableRow>
          ) : (
            ordenes.map((o) => {
              const est = getEstado(o.estado);
              return (
                <TableRow
                  key={o.id}
                  onClick={() => onClick(o)}
                  className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                >
                  <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                    {o.numero}
                  </TableCell>
                  <TableCell>{fmtFecha(o.fechaIngreso)}</TableCell>
                  <TableCell>{o.tercero?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-sm">{o.equipo}</TableCell>
                  <TableCell className="text-xs">
                    {o.marca ?? "—"}
                    {o.modelo ? ` / ${o.modelo}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={est.color}>
                      <est.Icon className="w-3 h-3 mr-1" />
                      {est.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(o.valorTotal || 0)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================
// Dialog Nueva Orden
// ============================================================
function DialogNuevaOrden({
  open,
  onOpenChange,
  terceros,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  terceros: Tercero[];
}) {
  const [terceroId, setTerceroId] = useState("");
  const [equipo, setEquipo] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [serial, setSerial] = useState("");
  const [problemaReportado, setProblemaReportado] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!equipo || !problemaReportado) {
      toast.error("Equipo y problema reportado son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost<OrdenServicio>("/api/taller/ordenes", {
        terceroId: terceroId || undefined,
        equipo,
        marca: marca || undefined,
        modelo: modelo || undefined,
        serial: serial || undefined,
        problemaReportado,
        observaciones: observaciones || undefined,
      });
      toast.success(`Orden ${res.numero} creada`);
      setTerceroId("");
      setEquipo("");
      setMarca("");
      setModelo("");
      setSerial("");
      setProblemaReportado("");
      setObservaciones("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear orden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva orden de servicio</DialogTitle>
          <DialogDescription>
            Recepción de equipo para diagnóstico/reparación
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Cliente (tercero)</Label>
            <Select value={terceroId} onValueChange={setTerceroId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tercero" />
              </SelectTrigger>
              <SelectContent>
                {terceros.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre} · {t.numeroDocumento}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Equipo *</Label>
            <Input
              value={equipo}
              onChange={(e) => setEquipo(e.target.value)}
              placeholder="Ej: Nevera, Lavadora, Televisor…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Marca</Label>
            <Input value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Serial / N° inventario</Label>
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Problema reportado *</Label>
            <Textarea
              rows={3}
              value={problemaReportado}
              onChange={(e) => setProblemaReportado(e.target.value)}
              placeholder="Descripción del problema según el cliente…"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear orden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Diagnóstico (envía POST /diagnostico)
// ============================================================
function DialogDiagnostico({
  open,
  onOpenChange,
  orden,
  tecnicos,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orden: OrdenServicio | null;
  tecnicos: Tercero[];
  onSaved: () => void;
}) {
  const [diagnostico, setDiagnostico] = useState("");
  const [tecnicoAsignadoId, setTecnicoAsignadoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && orden) {
      setDiagnostico(orden.diagnostico ?? "");
      setTecnicoAsignadoId(orden.tecnicoAsignadoId ?? "");
      setObservaciones(orden.observaciones ?? "");
    }
  }, [open, orden]);

  async function guardar() {
    if (!orden) return;
    if (!diagnostico) {
      toast.error("El diagnóstico es obligatorio");
      return;
    }
    setSaving(true);
    try {
      await apiPost(`/api/taller/ordenes/${orden.id}/diagnostico`, {
        diagnostico,
        tecnicoAsignadoId: tecnicoAsignadoId || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success("Diagnóstico guardado");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar diagnóstico");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Diagnóstico — {orden?.numero}
          </DialogTitle>
          <DialogDescription>
            Registrar diagnóstico y asignar técnico
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Diagnóstico *</Label>
            <Textarea
              rows={4}
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              placeholder="Causa raíz identificada, piezas a reemplazar…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Técnico asignado</Label>
            <Select
              value={tecnicoAsignadoId}
              onValueChange={setTecnicoAsignadoId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar técnico" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Guardar y diagnosticar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Agregar Detalle (repuesto / mano_obra / insumo)
// ============================================================
function DialogAgregarDetalle({
  open,
  onOpenChange,
  orden,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orden: OrdenServicio | null;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState("repuesto");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioUnitario, setPrecioUnitario] = useState("0");
  const [saving, setSaving] = useState(false);

  const cant = parseFloat(cantidad) || 0;
  const prec = parseFloat(precioUnitario) || 0;
  const subtotal = cant * prec;

  async function guardar() {
    if (!orden) return;
    if (!descripcion) {
      toast.error("Descripción obligatoria");
      return;
    }
    setSaving(true);
    try {
      await apiPost(`/api/taller/ordenes/${orden.id}/agregar-detalle`, {
        tipo,
        descripcion,
        cantidad: parseFloat(cantidad),
        precioUnitario: parseFloat(precioUnitario),
      });
      toast.success("Detalle agregado");
      setDescripcion("");
      setCantidad("1");
      setPrecioUnitario("0");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al agregar detalle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Agregar detalle
          </DialogTitle>
          <DialogDescription>Orden {orden?.numero}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="repuesto">Repuesto</SelectItem>
                <SelectItem value="mano_obra">Mano de obra</SelectItem>
                <SelectItem value="insumo">Insumo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción *</Label>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Precio unitario</Label>
              <Input
                type="number"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-2 flex items-center justify-between text-sm">
            <span className="text-neutral-600 dark:text-neutral-400">Subtotal</span>
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(subtotal)}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Agregando…" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Entregar (con checkbox "Generar factura")
// ============================================================
function DialogEntregar({
  open,
  onOpenChange,
  orden,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orden: OrdenServicio | null;
  onSaved: (generarFactura: boolean) => void;
}) {
  const [generarFactura, setGenerarFactura] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Entregar orden
          </DialogTitle>
          <DialogDescription>
            Orden {orden?.numero} · Total {formatCurrency(orden?.valorTotal || 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer p-3 rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
            <input
              type="checkbox"
              className="w-4 h-4 accent-emerald-600"
              checked={generarFactura}
              onChange={(e) => setGenerarFactura(e.target.checked)}
            />
            <div>
              <div className="font-medium">Generar factura</div>
              <div className="text-xs text-neutral-500">
                Crea una FacturaVenta con los detalles de la orden
              </div>
            </div>
          </label>
          {!generarFactura && (
            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Ban className="w-3.5 h-3.5" />
              La orden quedará entregada sin factura asociada.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSaved(generarFactura)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Entregar orden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Sheet Orden (detalle + acciones de estado)
// ============================================================
function SheetOrden({
  orden,
  loading,
  onOpenChange,
  onDiagnostico,
  onAgregarDetalle,
  onIniciar,
  onFinalizar,
  onEntregar,
  onAnular,
}: {
  orden: OrdenServicio | null;
  loading: boolean;
  onOpenChange: (o: boolean) => void;
  onDiagnostico: () => void;
  onAgregarDetalle: () => void;
  onIniciar: () => void;
  onFinalizar: () => void;
  onEntregar: () => void;
  onAnular: () => void;
}) {
  if (!orden) return null;
  const est = getEstado(orden.estado);
  const detalles = orden.detalleServicioTecnicos ?? [];

  return (
    <Sheet open={!!orden} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            {orden.numero}
          </SheetTitle>
          <SheetDescription>
            Ingreso {fmtFechaHora(orden.fechaIngreso)} · Entrega{" "}
            {orden.fechaEntrega ? fmtFechaHora(orden.fechaEntrega) : "—"}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          {/* Estado */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={est.color}>
              <est.Icon className="w-3 h-3 mr-1" />
              {est.label}
            </Badge>
            {orden.facturaId && (
              <Badge
                variant="outline"
                className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
              >
                Facturada
              </Badge>
            )}
          </div>

          {/* Cliente y equipo */}
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm">Cliente y equipo</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 py-2">
              <div className="flex justify-between">
                <span className="text-neutral-500">Cliente</span>
                <span>{orden.tercero?.nombre ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Documento</span>
                <span>{orden.tercero?.numeroDocumento ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Teléfono</span>
                <span>{orden.tercero?.telefono ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Equipo</span>
                <span className="font-medium">{orden.equipo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Marca</span>
                <span>{orden.marca ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Modelo</span>
                <span>{orden.modelo ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Serial</span>
                <span className="font-mono text-xs">{orden.serial ?? "—"}</span>
              </div>
              {orden.tecnico && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Técnico</span>
                  <span>{orden.tecnico.nombre}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Problema y diagnóstico */}
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Problema y diagnóstico</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={onDiagnostico}
                disabled={orden.estado === "entregado" || orden.estado === "anulado"}
              >
                {orden.diagnostico ? "Editar diagnóstico" : "Diagnosticar"}
              </Button>
            </CardHeader>
            <CardContent className="text-sm space-y-2 py-2">
              <div>
                <div className="text-xs text-neutral-500 mb-0.5">Problema reportado</div>
                <div className="whitespace-pre-wrap">{orden.problemaReportado}</div>
              </div>
              {orden.diagnostico && (
                <div>
                  <div className="text-xs text-neutral-500 mb-0.5">Diagnóstico técnico</div>
                  <div className="whitespace-pre-wrap text-emerald-800 dark:text-emerald-200">
                    {orden.diagnostico}
                  </div>
                </div>
              )}
              {orden.observaciones && (
                <div>
                  <div className="text-xs text-neutral-500 mb-0.5">Observaciones</div>
                  <div className="whitespace-pre-wrap">{orden.observaciones}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detalles */}
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <CircleDollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Detalles ({detalles.length})
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={onAgregarDetalle}
                disabled={
                  orden.estado === "entregado" || orden.estado === "anulado"
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
              </Button>
            </CardHeader>
            <CardContent className="py-2">
              {detalles.length === 0 ? (
                <div className="text-center text-neutral-500 py-3 text-sm">
                  Sin detalles registrados
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900">
                      <TableRow>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Descripción</TableHead>
                        <TableHead className="text-xs text-right">Cant.</TableHead>
                        <TableHead className="text-xs text-right">Precio</TableHead>
                        <TableHead className="text-xs text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalles.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-xs">
                            <Badge
                              variant="outline"
                              className={
                                d.tipo === "repuesto"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                                  : d.tipo === "mano_obra"
                                    ? "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300 border-teal-200 dark:border-teal-900"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                              }
                            >
                              {d.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{d.descripcion}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{d.cantidad}</TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {formatCurrency(d.precioUnitario)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-semibold">
                            {formatCurrency(d.subtotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
                  <div className="text-xs text-neutral-500">Repuestos</div>
                  <div className="font-mono">
                    {formatCurrency(orden.valorRepuestos)}
                  </div>
                </div>
                <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
                  <div className="text-xs text-neutral-500">Mano de obra</div>
                  <div className="font-mono">
                    {formatCurrency(orden.valorManoObra)}
                  </div>
                </div>
                <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-2">
                  <div className="text-xs text-neutral-500">Total</div>
                  <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(orden.valorTotal)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Acciones de estado */}
          {orden.estado !== "entregado" && orden.estado !== "anulado" && (
            <div className="grid grid-cols-2 gap-2">
              {orden.estado === "ingresado" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDiagnostico}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                >
                  <Activity className="w-4 h-4 mr-1" /> Diagnosticar
                </Button>
              )}
              {orden.estado === "diagnostico" && (
                <Button
                  size="sm"
                  onClick={onIniciar}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <PlayCircle className="w-4 h-4 mr-1" /> Iniciar reparación
                </Button>
              )}
              {orden.estado === "en_reparacion" && (
                <Button
                  size="sm"
                  onClick={onFinalizar}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <StopCircle className="w-4 h-4 mr-1" /> Finalizar
                </Button>
              )}
              {orden.estado === "listo" && (
                <Button
                  size="sm"
                  onClick={onEntregar}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white col-span-2"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Entregar al cliente
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onAnular}
                className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/30"
              >
                <Ban className="w-4 h-4 mr-1" /> Anular
              </Button>
            </div>
          )}
        </div>
        <SheetFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
