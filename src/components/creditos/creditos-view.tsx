"use client";

// ============================================================
// ERP Marsella — Vista de Créditos y Financiación
// Tabs: Créditos | Solicitudes | Simulador
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HandCoins,
  Plus,
  RefreshCw,
  Search,
  Save,
  Calculator,
  CheckCircle2,
  XCircle,
  Clock,
  Wallet,
  CalendarClock,
  ArrowRight,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  calcularAmortizacion,
  type CuotaAmortizacion,
  type SistemaAmortizacion,
} from "@/lib/credito";

// ---------- Helpers ----------
const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

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

const fmtPct = (n: number) =>
  `${(Number.isFinite(n) ? n * 100 : 0).toFixed(2)}%`;

// ---------- Tipos ----------
interface Tercero {
  id: string;
  nombre: string;
  nombreComercial?: string | null;
  numeroDocumento: string;
  tipo: string;
}

interface CuotaCredito {
  id: string;
  numero: number;
  fechaVencimiento: string;
  capital: number;
  interes: number;
  totalCuota: number;
  saldoCapital: number;
  estado: string;
  fechaPago?: string | null;
  comprobanteEgresoId?: string | null;
}

interface Credito {
  id: string;
  terceroId?: string | null;
  tercero?: Tercero | null;
  montoPrincipal: number;
  tasaInteres: number;
  plazoMeses: number;
  cuotaN: number;
  fechaInicio: string;
  fechaFin?: string | null;
  saldoCapital: number;
  estado: string;
  createdAt: string;
  cuotas: CuotaCredito[];
}

interface SolicitudCredito {
  id: string;
  terceroId?: string | null;
  tercero?: Tercero | null;
  montoSolicitado: number;
  tasaInteres: number;
  plazoMeses: number;
  cuotaN: number;
  destino?: string | null;
  estado: string;
  createdAt: string;
  observaciones?: string | null;
}

// ---------- Badges ----------
const estadoCreditoBadge = (e: string) => {
  const map: Record<string, string> = {
    vigente:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    pagado:
      "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
    en_mora:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    anulado:
      "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800/50 dark:text-neutral-400 dark:border-neutral-700",
  };
  return map[e] ?? "";
};

const estadoSolicitudBadge = (e: string) => {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    pendiente: {
      cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      icon: <Clock className="h-3 w-3" />,
    },
    aprobada: {
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    rechazada: {
      cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      icon: <XCircle className="h-3 w-3" />,
    },
    anulada: {
      cls: "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800/50 dark:text-neutral-400 dark:border-neutral-700",
      icon: <XCircle className="h-3 w-3" />,
    },
  };
  return map[e] ?? map.pendiente;
};

// ============================================================
// Componente principal
// ============================================================
export function CreditosView() {
  const [tab, setTab] = useState<string>("creditos");

  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudCredito[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [loadingCreditos, setLoadingCreditos] = useState(false);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(false);

  // Filtros
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Sheet detalle
  const [selectedCredito, setSelectedCredito] = useState<Credito | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Diálogo nueva solicitud
  const [nuevaSolOpen, setNuevaSolOpen] = useState(false);

  // ---------- Carga ----------
  const cargarCreditos = useCallback(async () => {
    setLoadingCreditos(true);
    try {
      const qs = new URLSearchParams({ pageSize: "500" });
      if (estadoFilter) qs.set("estado", estadoFilter);
      const r = await fetch(`/api/creditos?${qs.toString()}`, {
        cache: "no-store",
      });
      const d = await r.json();
      setCreditos(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar los créditos");
    } finally {
      setLoadingCreditos(false);
    }
  }, [estadoFilter]);

  const cargarSolicitudes = useCallback(async () => {
    setLoadingSolicitudes(true);
    try {
      const r = await fetch("/api/solicitudes-credito?pageSize=500", {
        cache: "no-store",
      });
      const d = await r.json();
      setSolicitudes(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar las solicitudes");
    } finally {
      setLoadingSolicitudes(false);
    }
  }, []);

  const cargarTerceros = useCallback(async () => {
    try {
      const r = await fetch("/api/terceros?pageSize=500", { cache: "no-store" });
      const d = await r.json();
      setTerceros(d.items ?? []);
    } catch {
      /* sin toast molesto */
    }
  }, []);

  useEffect(() => {
    cargarCreditos();
    cargarTerceros();
  }, [cargarCreditos, cargarTerceros]);

  useEffect(() => {
    if (tab === "solicitudes") cargarSolicitudes();
  }, [tab, cargarSolicitudes]);

  // ---------- Acciones ----------
  const openCredito = (c: Credito) => {
    setSelectedCredito(c);
    setSheetOpen(true);
  };

  const onPagarCuota = async (creditoId: string, cuotaId: string) => {
    setPayingId(cuotaId);
    try {
      const r = await fetch(`/api/creditos/${creditoId}/pagar-cuota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuotaId }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al pagar cuota");
        return;
      }
      toast.success(`Cuota pagada. Comprobante ${d.comprobanteEgreso?.numero ?? ""}`);

      // Refrescar crédito seleccionado
      if (selectedCredito?.id === creditoId) {
        const r2 = await fetch(`/api/creditos/${creditoId}`, {
          cache: "no-store",
        });
        const d2 = await r2.json();
        if (r2.ok) {
          setSelectedCredito(d2);
        }
      }
      cargarCreditos();
    } catch (e) {
      toast.error("Error al pagar cuota");
    } finally {
      setPayingId(null);
    }
  };

  const onAprobarSolicitud = async (
    sol: SolicitudCredito,
    crearCredito: boolean,
  ) => {
    try {
      const r = await fetch("/api/solicitudes-credito", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sol.id,
          estado: "aprobada",
          crearCredito,
          fechaInicio: new Date().toISOString(),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al aprobar solicitud");
        return;
      }
      toast.success(
        crearCredito && d.credito
          ? "Solicitud aprobada y crédito creado"
          : "Solicitud aprobada",
      );
      cargarSolicitudes();
      cargarCreditos();
    } catch {
      toast.error("Error al aprobar solicitud");
    }
  };

  const onRechazarSolicitud = async (sol: SolicitudCredito) => {
    try {
      const r = await fetch("/api/solicitudes-credito", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sol.id, estado: "rechazada" }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al rechazar solicitud");
        return;
      }
      toast.success("Solicitud rechazada");
      cargarSolicitudes();
    } catch {
      toast.error("Error al rechazar solicitud");
    }
  };

  // ---------- Filtrado de créditos ----------
  const creditosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creditos;
    return creditos.filter((c) => {
      const nombre = c.tercero?.nombreComercial ?? c.tercero?.nombre ?? "";
      return (
        nombre.toLowerCase().includes(q) ||
        c.tercero?.numeroDocumento?.toLowerCase().includes(q)
      );
    });
  }, [creditos, search]);

  // ---------- Resumen KPIs ----------
  const resumen = useMemo(() => {
    const vigentes = creditos.filter((c) => c.estado === "vigente");
    const capitalVigente = vigentes.reduce(
      (a, c) => a + c.saldoCapital,
      0,
    );
    const solicitudesPendientes = solicitudes.filter(
      (s) => s.estado === "pendiente",
    ).length;
    const totalAprobado = creditos.reduce(
      (a, c) => a + c.montoPrincipal,
      0,
    );
    return {
      capitalVigente,
      vigentes: vigentes.length,
      solicitudesPendientes,
      totalAprobado,
    };
  }, [creditos, solicitudes]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <HandCoins className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
              Créditos y Financiación
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Simulador (French/Alemán/Americano), solicitudes y pago de cuotas
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cargarCreditos();
            cargarSolicitudes();
            cargarTerceros();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Capital vigente"
          value={fmtCOP(resumen.capitalVigente)}
          sub={`${resumen.vigentes} créditos`}
          icon={<Wallet className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Total originado"
          value={fmtCOP(resumen.totalAprobado)}
          icon={<HandCoins className="h-4 w-4" />}
          tone="teal"
        />
        <KpiCard
          label="Solicitudes pendientes"
          value={String(resumen.solicitudesPendientes)}
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
        />
        <KpiCard
          label="Créditos totales"
          value={String(creditos.length)}
          icon={<Calculator className="h-4 w-4" />}
          tone="emerald"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="creditos" className="gap-1.5">
            <HandCoins className="h-4 w-4" />
            <span className="hidden sm:inline">Créditos</span>
          </TabsTrigger>
          <TabsTrigger value="solicitudes" className="gap-1.5">
            <CalendarClock className="h-4 w-4" />
            <span className="hidden sm:inline">Solicitudes</span>
          </TabsTrigger>
          <TabsTrigger value="simulador" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Simulador</span>
          </TabsTrigger>
        </TabsList>

        {/* Créditos */}
        <TabsContent value="creditos" className="mt-4">
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Créditos vigentes</CardTitle>
                  <CardDescription>
                    Lista de créditos — click en una fila para ver la tabla de
                    amortización y pagar cuotas
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Buscar tercero…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="sm:w-56"
                  />
                  <Select
                    value={estadoFilter || "all"}
                    onValueChange={(v) =>
                      setEstadoFilter(v === "all" ? "" : v)
                    }
                  >
                    <SelectTrigger className="sm:w-44">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="vigente">Vigente</SelectItem>
                      <SelectItem value="pagado">Pagado</SelectItem>
                      <SelectItem value="en_mora">En mora</SelectItem>
                      <SelectItem value="anulado">Anulado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingCreditos ? (
                <SkeletonList />
              ) : creditosFiltrados.length === 0 ? (
                <EmptyState
                  icon={<HandCoins className="h-8 w-8" />}
                  title="No hay créditos"
                  desc="Crea una solicitud o usa el simulador para originar el primer crédito."
                />
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Tercero</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                        <TableHead className="text-right">Tasa EA</TableHead>
                        <TableHead className="text-right">Plazo</TableHead>
                        <TableHead className="text-right">Saldo capital</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Fecha fin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creditosFiltrados.map((c) => (
                        <TableRow
                          key={c.id}
                          onClick={() => openCredito(c)}
                          className="cursor-pointer hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20"
                        >
                          <TableCell>
                            <div className="font-medium">
                              {c.tercero?.nombreComercial ?? c.tercero?.nombre ?? "—"}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {c.tercero?.numeroDocumento ?? "Sin tercero"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(c.montoPrincipal)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtPct(c.tasaInteres)}
                          </TableCell>
                          <TableCell className="text-right">
                            {c.plazoMeses}m / {c.cuotaN} cuotas
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(c.saldoCapital)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={estadoCreditoBadge(c.estado)}
                            >
                              {c.estado}
                            </Badge>
                          </TableCell>
                          <TableCell>{fmtFecha(c.fechaFin)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Solicitudes */}
        <TabsContent value="solicitudes" className="mt-4">
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Solicitudes de crédito</CardTitle>
                  <CardDescription>
                    Aprueba, rechaza o anula solicitudes pendientes
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setNuevaSolOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva solicitud
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSolicitudes ? (
                <SkeletonList />
              ) : solicitudes.length === 0 ? (
                <EmptyState
                  icon={<CalendarClock className="h-8 w-8" />}
                  title="Sin solicitudes"
                  desc="Crea la primera solicitud de crédito."
                />
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Tercero</TableHead>
                        <TableHead className="text-right">Solicitado</TableHead>
                        <TableHead className="text-right">Tasa EA</TableHead>
                        <TableHead className="text-right">Cuotas</TableHead>
                        <TableHead>Destino</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {solicitudes.map((s) => {
                        const e = estadoSolicitudBadge(s.estado);
                        return (
                          <TableRow key={s.id}>
                            <TableCell>
                              <div className="font-medium">
                                {s.tercero?.nombreComercial ?? s.tercero?.nombre ?? "—"}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {fmtFecha(s.createdAt)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmtCOP(s.montoSolicitado)}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtPct(s.tasaInteres)}
                            </TableCell>
                            <TableCell className="text-right">
                              {s.cuotaN} cuotas
                              <span className="block text-xs text-neutral-500">
                                {s.plazoMeses}m
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {s.destino ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={e.cls + " gap-1"}>
                                {e.icon}
                                {s.estado}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {s.estado === "pendiente" && (
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => onAprobarSolicitud(s, true)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Aprobar y crear
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => onAprobarSolicitud(s, false)}
                                  >
                                    Solo aprobar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-rose-600 hover:text-rose-700"
                                    onClick={() => onRechazarSolicitud(s)}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
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
        </TabsContent>

        {/* Simulador */}
        <TabsContent value="simulador" className="mt-4">
          <SimuladorCredito
            terceros={terceros}
            onCreado={() => {
              setTab("creditos");
              cargarCreditos();
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Sheet detalle de crédito */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-emerald-600" />
              Crédito{" "}
              {selectedCredito?.tercero?.nombreComercial ??
                selectedCredito?.tercero?.nombre ??
                "sin tercero"}
            </SheetTitle>
            <SheetDescription>
              Tabla de amortización completa — click "Pagar" en cuotas
              pendientes
            </SheetDescription>
          </SheetHeader>

          {selectedCredito && (
            <div className="px-4 pb-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Monto principal" value={fmtCOP(selectedCredito.montoPrincipal)} />
                <InfoRow label="Tasa EA" value={fmtPct(selectedCredito.tasaInteres)} />
                <InfoRow label="Plazo" value={`${selectedCredito.plazoMeses} meses`} />
                <InfoRow label="Cuotas" value={String(selectedCredito.cuotaN)} />
                <InfoRow label="Fecha inicio" value={fmtFecha(selectedCredito.fechaInicio)} />
                <InfoRow label="Fecha fin" value={fmtFecha(selectedCredito.fechaFin)} />
                <InfoRow label="Saldo capital" value={fmtCOP(selectedCredito.saldoCapital)} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">Estado</span>
                  <Badge variant="outline" className={estadoCreditoBadge(selectedCredito.estado)}>
                    {selectedCredito.estado}
                  </Badge>
                </div>
              </div>

              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="max-h-[55vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead className="text-right">Capital</TableHead>
                        <TableHead className="text-right">Interés</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCredito.cuotas.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono">{q.numero}</TableCell>
                          <TableCell>{fmtFecha(q.fechaVencimiento)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(q.capital)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                            {fmtCOP(q.interes)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(q.totalCuota)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(q.saldoCapital)}
                          </TableCell>
                          <TableCell className="text-right">
                            {q.estado === "pagada" ? (
                              <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                                Pagada
                              </Badge>
                            ) : q.estado === "en_mora" ? (
                              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                                En mora
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                Pendiente
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Cuotas pendientes con botón pagar */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Pago rápido de cuotas pendientes</h4>
                <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCredito.cuotas
                        .filter((q) => q.estado === "pendiente")
                        .slice(0, 8)
                        .map((q) => (
                          <TableRow key={q.id}>
                            <TableCell className="font-mono">{q.numero}</TableCell>
                            <TableCell>{fmtFecha(q.fechaVencimiento)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {fmtCOP(q.totalCuota)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="h-7 bg-emerald-600 hover:bg-emerald-700"
                                disabled={payingId === q.id}
                                onClick={() =>
                                  onPagarCuota(selectedCredito.id, q.id)
                                }
                              >
                                {payingId === q.id ? "Pagando…" : "Pagar"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      {selectedCredito.cuotas.filter((q) => q.estado === "pendiente").length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-neutral-500 py-3">
                            Todas las cuotas están pagadas ✓
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Diálogo nueva solicitud */}
      <DialogNuevaSolicitud
        open={nuevaSolOpen}
        onOpenChange={setNuevaSolOpen}
        terceros={terceros}
        onSaved={() => {
          cargarSolicitudes();
          setNuevaSolOpen(false);
        }}
      />
    </div>
  );
}

// ============================================================
// Subcomponentes
// ============================================================
function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "emerald" | "teal" | "amber";
}) {
  const toneCls =
    tone === "emerald"
      ? "from-emerald-500 to-teal-600"
      : tone === "teal"
        ? "from-teal-500 to-cyan-600"
        : "from-amber-500 to-orange-600";
  return (
    <Card className="border-neutral-200 dark:border-neutral-800">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`rounded-lg bg-gradient-to-br ${toneCls} p-2 text-white`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {label}
          </div>
          <div className="text-lg font-semibold truncate">{value}</div>
          {sub && (
            <div className="text-xs text-neutral-400 truncate">{sub}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-neutral-200 dark:border-neutral-800 pb-1.5">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4 text-neutral-400 mb-3">
        {icon}
      </div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-neutral-500 max-w-md mt-1">{desc}</p>
    </div>
  );
}

// ============================================================
// Diálogo nueva solicitud
// ============================================================
function DialogNuevaSolicitud({
  open,
  onOpenChange,
  terceros,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  terceros: Tercero[];
  onSaved: () => void;
}) {
  const [terceroId, setTerceroId] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [tasa, setTasa] = useState<string>("0.20");
  const [plazo, setPlazo] = useState<string>("12");
  const [cuotas, setCuotas] = useState<string>("12");
  const [destino, setDestino] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!monto || !tasa || !plazo || !cuotas) {
      toast.error("Complete los campos requeridos");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/solicitudes-credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terceroId: terceroId || null,
          montoSolicitado: parseFloat(monto),
          tasaInteres: parseFloat(tasa),
          plazoMeses: parseInt(plazo, 10),
          cuotaN: parseInt(cuotas, 10),
          destino: destino || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al crear solicitud");
        return;
      }
      toast.success("Solicitud creada");
      onSaved();
      // reset
      setTerceroId("");
      setMonto("");
      setTasa("0.20");
      setPlazo("12");
      setCuotas("12");
      setDestino("");
    } catch {
      toast.error("Error al crear solicitud");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva solicitud de crédito</DialogTitle>
          <DialogDescription>
            El solicitante llena el formulario; el comité de crédito aprueba
            desde la lista.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Tercero</Label>
            <Select value={terceroId} onValueChange={setTerceroId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin tercero (libre)" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {terceros.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombreComercial ?? t.nombre} — {t.numeroDocumento}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Monto solicitado (COP) *</Label>
            <Input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="10000000"
            />
          </div>
          <div className="space-y-2">
            <Label>Tasa EA (decimal) *</Label>
            <Input
              type="number"
              step="0.01"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              placeholder="0.20"
            />
            <p className="text-xs text-neutral-500">
              0.20 = 20% efectivo anual
            </p>
          </div>
          <div className="space-y-2">
            <Label>Plazo (meses) *</Label>
            <Input
              type="number"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
              placeholder="12"
            />
          </div>
          <div className="space-y-2">
            <Label>Número de cuotas *</Label>
            <Input
              type="number"
              value={cuotas}
              onChange={(e) => setCuotas(e.target.value)}
              placeholder="12"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Destino</Label>
            <Textarea
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="Capital de trabajo, compra de maquinaria, refacción de vehículo…"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Guardando…" : "Crear solicitud"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Simulador (computa amortización en cliente sin persistir)
// ============================================================
function SimuladorCredito({
  terceros,
  onCreado,
}: {
  terceros: Tercero[];
  onCreado: () => void;
}) {
  const [monto, setMonto] = useState<string>("10000000");
  const [tasa, setTasa] = useState<string>("0.20");
  const [plazo, setPlazo] = useState<string>("12");
  const [fecha, setFecha] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [sistema, setSistema] = useState<SistemaAmortizacion>("french");
  const [terceroId, setTerceroId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const cuotas: CuotaAmortizacion[] = useMemo(() => {
    const m = parseFloat(monto);
    const t = parseFloat(tasa);
    const p = parseInt(plazo, 10);
    if (!Number.isFinite(m) || m <= 0) return [];
    if (!Number.isFinite(t) || t < 0) return [];
    if (!Number.isFinite(p) || p <= 0) return [];
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return [];
    return calcularAmortizacion(sistema, m, t, p, d);
  }, [monto, tasa, plazo, fecha, sistema]);

  const totalInteres = cuotas.reduce((a, c) => a + c.interes, 0);
  const totalPagado = cuotas.reduce((a, c) => a + c.totalCuota, 0);
  const cuotaFija =
    sistema === "french" && cuotas.length > 0 ? cuotas[0].totalCuota : 0;

  const crear = async () => {
    const m = parseFloat(monto);
    const t = parseFloat(tasa);
    const p = parseInt(plazo, 10);
    if (!(m > 0) || !(p > 0)) {
      toast.error("Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/creditos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terceroId: terceroId || null,
          montoPrincipal: m,
          tasaInteres: t,
          plazoMeses: p,
          cuotaN: p,
          fechaInicio: new Date(fecha).toISOString(),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al crear crédito");
        return;
      }
      toast.success("Crédito creado con cuotas");
      onCreado();
    } catch {
      toast.error("Error al crear crédito");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-neutral-200 dark:border-neutral-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-emerald-600" />
          Simulador de amortización
        </CardTitle>
        <CardDescription>
          Calcula la tabla de amortización sin persistir. Cuando estés conforme,
          crea el crédito.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Monto (COP)</Label>
            <Input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tasa EA (decimal)</Label>
            <Input
              type="number"
              step="0.01"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Plazo (meses)</Label>
            <Input
              type="number"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Fecha inicio</Label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Sistema</Label>
            <Select value={sistema} onValueChange={(v) => setSistema(v as SistemaAmortizacion)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="french">Francés (cuota fija)</SelectItem>
                <SelectItem value="alemana">Alemán (capital fijo)</SelectItem>
                <SelectItem value="americana">Americano (capital al final)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tercero (opcional)</Label>
            <Select value={terceroId} onValueChange={setTerceroId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin tercero" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {terceros.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombreComercial ?? t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <ResumenBox
            label="Cuota fija"
            value={cuotaFija > 0 ? fmtCOP(cuotaFija) : "—"}
          />
          <ResumenBox label="Total interés" value={fmtCOP(totalInteres)} tone="amber" />
          <ResumenBox label="Total a pagar" value={fmtCOP(totalPagado)} tone="teal" />
          <ResumenBox label="N° cuotas" value={String(cuotas.length)} />
        </div>

        {/* Botón crear */}
        <div className="flex justify-end mt-4">
          <Button
            onClick={crear}
            disabled={saving || cuotas.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Creando…" : "Crear crédito"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {/* Tabla */}
        <div className="mt-4 rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Capital</TableHead>
                  <TableHead className="text-right">Interés</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuotas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-neutral-500 py-4">
                      Ingrese valores válidos para ver la tabla
                    </TableCell>
                  </TableRow>
                ) : (
                  cuotas.map((c) => (
                    <TableRow key={c.numero}>
                      <TableCell className="font-mono">{c.numero}</TableCell>
                      <TableCell>{fmtFecha(c.fechaVencimiento)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtCOP(c.capital)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                        {fmtCOP(c.interes)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtCOP(c.totalCuota)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtCOP(c.saldoCapital)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {cuotas.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/20">
                    <TableCell colSpan={2} className="font-semibold">
                      Totales
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtCOP(cuotas.reduce((a, c) => a + c.capital, 0))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtCOP(totalInteres)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {fmtCOP(totalPagado)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResumenBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "teal";
}) {
  const cls =
    tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "teal"
        ? "text-teal-700 dark:text-teal-400"
        : "";
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
