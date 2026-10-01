"use client";

// ============================================================
// ERP Marsella — Vista de Presupuesto
// Tabs: Rubros | CDP | CRP | Modificaciones | Ejecución
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Plus,
  RefreshCw,
  Save,
  FileCheck2,
  FileText,
  GitBranch,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Scale,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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

// ---------- Tipos ----------
interface Tercero {
  id: string;
  nombre: string;
  nombreComercial?: string | null;
  numeroDocumento: string;
}

interface RubroPresupuestal {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  nivel: number;
  cuentaPadreId?: string | null;
  vigencia: number;
  apropiacionInicial: number;
  children?: RubroPresupuestal[];
  cuentaPadre?: RubroPresupuestal | null;
}

interface CDP {
  id: string;
  numero: string;
  fecha: string;
  rubroId: string;
  rubro?: RubroPresupuestal | null;
  valor: number;
  concepto?: string | null;
  terceroId?: string | null;
  tercero?: Tercero | null;
  estado: string;
  saldo: number;
}

interface CRP {
  id: string;
  numero: string;
  cdpId: string;
  cdp?: CDP | null;
  fecha: string;
  valor: number;
  concepto?: string | null;
  terceroId?: string | null;
  tercero?: Tercero | null;
  estado: string;
  saldo: number;
}

interface Modificacion {
  id: string;
  numero: string;
  fecha: string;
  tipo: string;
  rubroOrigenId?: string | null;
  rubroDestinoId?: string | null;
  rubroOrigen?: RubroPresupuestal | null;
  rubroDestino?: RubroPresupuestal | null;
  valor: number;
  motivo?: string | null;
  estado: string;
}

interface EjecucionItem {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  nivel: number;
  apropiacionInicial: number;
  cdpTotal: number;
  crpTotal: number;
  obligado: number;
  pagado: number;
  saldo: number;
  porcentajeEjecucion: number;
}

interface EjecucionTotales {
  apropiacionInicial: number;
  cdpTotal: number;
  crpTotal: number;
  obligado: number;
  pagado: number;
  saldo: number;
}

// ---------- Badges ----------
const tipoRubroBadge = (t: string) => {
  if (t === "ingreso")
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
  if (t === "gasto")
    return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
  return "";
};

const tipoModifBadge = (t: string) => {
  const map: Record<string, string> = {
    adicion: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    reduccion: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    traslado: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  };
  return map[t] ?? "";
};

// ============================================================
// Componente principal
// ============================================================
export function PresupuestoView() {
  const [tab, setTab] = useState<string>("rubros");

  const [vigencia, setVigencia] = useState<number>(new Date().getFullYear());

  const [rubros, setRubros] = useState<RubroPresupuestal[]>([]);
  const [cdps, setCdps] = useState<CDP[]>([]);
  const [crps, setCrps] = useState<CRP[]>([]);
  const [modifs, setModifs] = useState<Modificacion[]>([]);
  const [ejecucion, setEjecucion] = useState<EjecucionItem[]>([]);
  const [totales, setTotales] = useState<EjecucionTotales | null>(null);

  const [loadingRubros, setLoadingRubros] = useState(false);
  const [loadingCdps, setLoadingCdps] = useState(false);
  const [loadingCrps, setLoadingCrps] = useState(false);
  const [loadingModifs, setLoadingModifs] = useState(false);
  const [loadingEjec, setLoadingEjec] = useState(false);

  const [nuevoRubroOpen, setNuevoRubroOpen] = useState(false);
  const [nuevoCdpOpen, setNuevoCdpOpen] = useState(false);
  const [nuevoCrpOpen, setNuevoCrpOpen] = useState(false);
  const [nuevaModifOpen, setNuevaModifOpen] = useState(false);

  // ---------- Carga ----------
  const cargarRubros = useCallback(async () => {
    setLoadingRubros(true);
    try {
      const r = await fetch(`/api/presupuesto/rubros?vigencia=${vigencia}`, {
        cache: "no-store",
      });
      const d = await r.json();
      setRubros(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar los rubros");
    } finally {
      setLoadingRubros(false);
    }
  }, [vigencia]);

  const cargarCdps = useCallback(async () => {
    setLoadingCdps(true);
    try {
      const r = await fetch("/api/presupuesto/cdp?pageSize=500", {
        cache: "no-store",
      });
      const d = await r.json();
      setCdps(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar los CDP");
    } finally {
      setLoadingCdps(false);
    }
  }, []);

  const cargarCrps = useCallback(async () => {
    setLoadingCrps(true);
    try {
      const r = await fetch("/api/presupuesto/crp?pageSize=500", {
        cache: "no-store",
      });
      const d = await r.json();
      setCrps(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar los CRP");
    } finally {
      setLoadingCrps(false);
    }
  }, []);

  const cargarModifs = useCallback(async () => {
    setLoadingModifs(true);
    try {
      const r = await fetch("/api/presupuesto/modificaciones?pageSize=500", {
        cache: "no-store",
      });
      const d = await r.json();
      setModifs(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar las modificaciones");
    } finally {
      setLoadingModifs(false);
    }
  }, []);

  const cargarEjecucion = useCallback(async () => {
    setLoadingEjec(true);
    try {
      const r = await fetch(`/api/presupuesto/ejecucion?vigencia=${vigencia}`, {
        cache: "no-store",
      });
      const d = await r.json();
      setEjecucion(d.items ?? []);
      setTotales(d.totales ?? null);
    } catch {
      toast.error("No se pudo cargar la ejecución");
    } finally {
      setLoadingEjec(false);
    }
  }, [vigencia]);

  useEffect(() => {
    cargarRubros();
    cargarCdps();
  }, [cargarRubros, cargarCdps]);

  useEffect(() => {
    if (tab === "crp" && crps.length === 0) cargarCrps();
    if (tab === "modificaciones" && modifs.length === 0) cargarModifs();
    if (tab === "ejecucion") cargarEjecucion();
  }, [tab, cargarCrps, cargarModifs, cargarEjecucion, crps.length, modifs.length]);

  // ---------- Árbol ----------
  const arbol = useMemo(() => {
    const byParent = new Map<string, RubroPresupuestal[]>();
    const roots: RubroPresupuestal[] = [];
    for (const r of rubros) {
      if (!r.cuentaPadreId) {
        roots.push(r);
      } else {
        const arr = byParent.get(r.cuentaPadreId) ?? [];
        arr.push(r);
        byParent.set(r.cuentaPadreId, arr);
      }
    }
    const build = (r: RubroPresupuestal): RubroPresupuestal => ({
      ...r,
      children: (byParent.get(r.id) ?? []).map(build),
    });
    return roots.map(build);
  }, [rubros]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <PieChart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
              Presupuesto
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Rubros, CDP, CRP, modificaciones y ejecución presupuestal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={vigencia}
            onChange={(e) => setVigencia(parseInt(e.target.value, 10) || new Date().getFullYear())}
            className="w-28"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cargarRubros();
              cargarCdps();
              cargarCrps();
              cargarModifs();
              cargarEjecucion();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="rubros" className="gap-1.5">
            <Scale className="h-4 w-4" />
            <span className="hidden sm:inline">Rubros</span>
          </TabsTrigger>
          <TabsTrigger value="cdp" className="gap-1.5">
            <FileCheck2 className="h-4 w-4" />
            <span className="hidden sm:inline">CDP</span>
          </TabsTrigger>
          <TabsTrigger value="crp" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">CRP</span>
          </TabsTrigger>
          <TabsTrigger value="modificaciones" className="gap-1.5">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Modific.</span>
          </TabsTrigger>
          <TabsTrigger value="ejecucion" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Ejecución</span>
          </TabsTrigger>
        </TabsList>

        {/* Rubros */}
        <TabsContent value="rubros" className="mt-4">
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Rubros presupuestales</CardTitle>
                  <CardDescription>
                    Vigencia {vigencia} — árbol jerárquico por cuenta padre
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setNuevoRubroOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo rubro
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRubros ? (
                <SkeletonList />
              ) : arbol.length === 0 ? (
                <EmptyState
                  icon={<Scale className="h-8 w-8" />}
                  title="Sin rubros"
                  desc={`No hay rubros presupuestales para la vigencia ${vigencia}.`}
                />
              ) : (
                <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
                  <div className="grid grid-cols-12 px-3 py-2 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    <div className="col-span-5">Rubro</div>
                    <div className="col-span-2 text-center">Tipo</div>
                    <div className="col-span-2 text-center">Nivel</div>
                    <div className="col-span-3 text-right">Apropiación</div>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {arbol.map((r) => (
                      <RubroTreeNode key={r.id} rubro={r} depth={0} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CDP */}
        <TabsContent value="cdp" className="mt-4">
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Certificados de Disponibilidad Presupuestal</CardTitle>
                  <CardDescription>
                    Reserva de apropiación para futuras compromisos
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setNuevoCdpOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo CDP
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingCdps ? (
                <SkeletonList />
              ) : cdps.length === 0 ? (
                <EmptyState
                  icon={<FileCheck2 className="h-8 w-8" />}
                  title="Sin CDP"
                  desc="Crea el primer certificado de disponibilidad presupuestal."
                />
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Rubro</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cdps.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono">{c.numero}</TableCell>
                          <TableCell>{fmtFecha(c.fecha)}</TableCell>
                          <TableCell>
                            <div className="font-mono text-xs">
                              {c.rubro?.codigo ?? "—"}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {c.rubro?.nombre ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(c.valor)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(c.saldo)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {c.estado}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CRP */}
        <TabsContent value="crp" className="mt-4">
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Compromisos Presupuestales</CardTitle>
                  <CardDescription>
                    CRP asociados a un CDP padre
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setNuevoCrpOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo CRP
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingCrps ? (
                <SkeletonList />
              ) : crps.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title="Sin CRP"
                  desc="Crea el primer compromiso presupuestal sobre un CDP vigente."
                />
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>CDP</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {crps.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono">{c.numero}</TableCell>
                          <TableCell>
                            <div className="font-mono text-xs">
                              {c.cdp?.numero ?? "—"}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {c.cdp?.rubro?.codigo ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell>{fmtFecha(c.fecha)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(c.valor)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {c.concepto ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{c.estado}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Modificaciones */}
        <TabsContent value="modificaciones" className="mt-4">
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Modificaciones presupuestales</CardTitle>
                  <CardDescription>
                    Adiciones, reducciones y traslados
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setNuevaModifOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva modificación
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingModifs ? (
                <SkeletonList />
              ) : modifs.length === 0 ? (
                <EmptyState
                  icon={<GitBranch className="h-8 w-8" />}
                  title="Sin modificaciones"
                  desc="Crea la primera modificación presupuestal (adición, reducción o traslado)."
                />
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Origen</TableHead>
                        <TableHead>Destino</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modifs.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono">{m.numero}</TableCell>
                          <TableCell>{fmtFecha(m.fecha)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={tipoModifBadge(m.tipo)}>
                              {m.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {m.rubroOrigen?.codigo ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {m.rubroDestino?.codigo ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(m.valor)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {m.motivo ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ejecución */}
        <TabsContent value="ejecucion" className="mt-4">
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-3">
              <div>
                <CardTitle>Ejecución presupuestal</CardTitle>
                <CardDescription>
                  Vigencia {vigencia} — apropiación, CDPs, CRPs, obligado, pagado y saldo disponible
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEjec ? (
                <SkeletonList />
              ) : ejecucion.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp className="h-8 w-8" />}
                  title="Sin datos de ejecución"
                  desc={`No hay rubros para la vigencia ${vigencia}.`}
                />
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Rubro</TableHead>
                        <TableHead className="text-right">Apropiación</TableHead>
                        <TableHead className="text-right">CDPs</TableHead>
                        <TableHead className="text-right">CRPs</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">% Ejec.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ejecucion.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <div className="font-mono text-xs">{e.codigo}</div>
                            <div className="text-xs text-neutral-500 truncate max-w-[260px]">
                              {e.nombre}
                            </div>
                            <Badge variant="outline" className={`mt-1 ${tipoRubroBadge(e.tipo)}`}>
                              {e.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(e.apropiacionInicial)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(e.cdpTotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(e.crpTotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(e.saldo)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-600"
                                  style={{ width: `${Math.min(100, e.porcentajeEjecucion)}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono">
                                {e.porcentajeEjecucion.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    {totales && (
                      <TableFooter>
                        <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/20 font-semibold">
                          <TableCell>TOTALES</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(totales.apropiacionInicial)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(totales.cdpTotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(totales.crpTotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(totales.saldo)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo nuevo rubro */}
      <DialogNuevoRubro
        open={nuevoRubroOpen}
        onOpenChange={setNuevoRubroOpen}
        rubrosPadre={rubros}
        vigencia={vigencia}
        onSaved={() => {
          setNuevoRubroOpen(false);
          cargarRubros();
        }}
      />

      {/* Diálogo nuevo CDP */}
      <DialogNuevoCDP
        open={nuevoCdpOpen}
        onOpenChange={setNuevoCdpOpen}
        rubros={rubros}
        onSaved={() => {
          setNuevoCdpOpen(false);
          cargarCdps();
        }}
      />

      {/* Diálogo nuevo CRP */}
      <DialogNuevoCRP
        open={nuevoCrpOpen}
        onOpenChange={setNuevoCrpOpen}
        cdps={cdps.filter((c) => c.estado === "vigente" && c.saldo > 0)}
        onSaved={() => {
          setNuevoCrpOpen(false);
          cargarCrps();
          cargarCdps();
        }}
      />

      {/* Diálogo nueva modificación */}
      <DialogNuevaModif
        open={nuevaModifOpen}
        onOpenChange={setNuevaModifOpen}
        rubros={rubros}
        onSaved={() => {
          setNuevaModifOpen(false);
          cargarModifs();
          cargarRubros();
        }}
      />
    </div>
  );
}

// ============================================================
// Subcomponentes
// ============================================================
function RubroTreeNode({
  rubro,
  depth,
}: {
  rubro: RubroPresupuestal;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = rubro.children && rubro.children.length > 0;
  return (
    <div>
      <div
        className="grid grid-cols-12 px-3 py-2 items-center border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/80 dark:hover:bg-neutral-900/40"
        style={{ paddingLeft: `${12 + depth * 18}px` }}
      >
        <div className="col-span-5 flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          <span className="font-mono text-xs text-neutral-500">{rubro.codigo}</span>
          <span className="truncate text-sm">{rubro.nombre}</span>
        </div>
        <div className="col-span-2 text-center">
          <Badge variant="outline" className={tipoRubroBadge(rubro.tipo)}>
            {rubro.tipo}
          </Badge>
        </div>
        <div className="col-span-2 text-center text-xs text-neutral-500">
          Nivel {rubro.nivel}
        </div>
        <div className="col-span-3 text-right font-mono">
          {fmtCOP(rubro.apropiacionInicial)}
        </div>
      </div>
      {hasChildren && open && (
        <div>
          {rubro.children!.map((c) => (
            <RubroTreeNode key={c.id} rubro={c} depth={depth + 1} />
          ))}
        </div>
      )}
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
// Diálogos
// ============================================================
function DialogNuevoRubro({
  open,
  onOpenChange,
  rubrosPadre,
  vigencia,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rubrosPadre: RubroPresupuestal[];
  vigencia: number;
  onSaved: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"ingreso" | "gasto">("gasto");
  const [cuentaPadreId, setCuentaPadreId] = useState<string>("");
  const [apropiacion, setApropiacion] = useState<string>("0");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!codigo || !nombre) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/presupuesto/rubros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          nombre,
          tipo,
          cuentaPadreId: cuentaPadreId || null,
          vigencia,
          apropiacionInicial: parseFloat(apropiacion) || 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al crear rubro");
        return;
      }
      toast.success("Rubro creado");
      setCodigo("");
      setNombre("");
      setApropiacion("0");
      setCuentaPadreId("");
      onSaved();
    } catch {
      toast.error("Error al crear rubro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo rubro presupuestal</DialogTitle>
          <DialogDescription>
            Vigencia {vigencia}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>Código *</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="2.1.01.01" />
          </div>
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Sueldos y salarios" />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "ingreso" | "gasto")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ingreso">Ingreso</SelectItem>
                <SelectItem value="gasto">Gasto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Apropiación inicial</Label>
            <Input
              type="number"
              value={apropiacion}
              onChange={(e) => setApropiacion(e.target.value)}
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Rubro padre</Label>
            <Select value={cuentaPadreId} onValueChange={setCuentaPadreId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin padre (rubro raíz)" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {rubrosPadre.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.codigo} — {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Guardando…" : "Crear rubro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogNuevoCDP({
  open,
  onOpenChange,
  rubros,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rubros: RubroPresupuestal[];
  onSaved: () => void;
}) {
  const [rubroId, setRubroId] = useState("");
  const [valor, setValor] = useState("");
  const [concepto, setConcepto] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!rubroId || !valor) {
      toast.error("Rubro y valor son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/presupuesto/cdp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubroId,
          valor: parseFloat(valor),
          concepto: concepto || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al crear CDP");
        return;
      }
      toast.success(`CDP creado: ${d.numero}`);
      setRubroId("");
      setValor("");
      setConcepto("");
      onSaved();
    } catch {
      toast.error("Error al crear CDP");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo CDP</DialogTitle>
          <DialogDescription>
            Certificado de Disponibilidad Presupuestal
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2">
          <div className="space-y-2">
            <Label>Rubro *</Label>
            <Select value={rubroId} onValueChange={setRubroId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione rubro" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {rubros.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.codigo} — {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Valor *</Label>
            <Input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="5000000"
            />
          </div>
          <div className="space-y-2">
            <Label>Concepto</Label>
            <Textarea
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
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
            {saving ? "Guardando…" : "Crear CDP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogNuevoCRP({
  open,
  onOpenChange,
  cdps,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cdps: CDP[];
  onSaved: () => void;
}) {
  const [cdpId, setCdpId] = useState("");
  const [valor, setValor] = useState("");
  const [concepto, setConcepto] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedCdp = cdps.find((c) => c.id === cdpId);

  const submit = async () => {
    if (!cdpId || !valor) {
      toast.error("CDP y valor son obligatorios");
      return;
    }
    if (selectedCdp && parseFloat(valor) > selectedCdp.saldo + 0.005) {
      toast.error(
        `Saldo del CDP insuficiente. Disponible: ${fmtCOP(selectedCdp.saldo)}`,
      );
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/presupuesto/crp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cdpId,
          valor: parseFloat(valor),
          concepto: concepto || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al crear CRP");
        return;
      }
      toast.success(`CRP creado: ${d.numero}`);
      setCdpId("");
      setValor("");
      setConcepto("");
      onSaved();
    } catch {
      toast.error("Error al crear CRP");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo CRP</DialogTitle>
          <DialogDescription>
            Compromiso Presupuestal — descuenta el saldo del CDP padre
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2">
          <div className="space-y-2">
            <Label>CDP *</Label>
            <Select value={cdpId} onValueChange={setCdpId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione CDP vigente" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {cdps.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numero} — saldo {fmtCOP(c.saldo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCdp && (
              <div className="text-xs text-neutral-500">
                Saldo disponible: {fmtCOP(selectedCdp.saldo)} · Rubro{" "}
                {selectedCdp.rubro?.codigo}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Valor *</Label>
            <Input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="1000000"
            />
          </div>
          <div className="space-y-2">
            <Label>Concepto</Label>
            <Textarea
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
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
            {saving ? "Guardando…" : "Crear CRP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogNuevaModif({
  open,
  onOpenChange,
  rubros,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rubros: RubroPresupuestal[];
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"adicion" | "reduccion" | "traslado">("adicion");
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!valor) {
      toast.error("Valor es obligatorio");
      return;
    }
    if (tipo === "reduccion" && !origenId) {
      toast.error("Reducción requiere rubro origen");
      return;
    }
    if (tipo === "adicion" && !destinoId) {
      toast.error("Adición requiere rubro destino");
      return;
    }
    if (tipo === "traslado" && (!origenId || !destinoId)) {
      toast.error("Traslado requiere origen y destino");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/presupuesto/modificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          rubroOrigenId: origenId || null,
          rubroDestinoId: destinoId || null,
          valor: parseFloat(valor),
          motivo: motivo || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al crear modificación");
        return;
      }
      toast.success(`Modificación creada: ${d.numero}`);
      setOrigenId("");
      setDestinoId("");
      setValor("");
      setMotivo("");
      onSaved();
    } catch {
      toast.error("Error al crear modificación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva modificación presupuestal</DialogTitle>
          <DialogDescription>
            Adición (aumenta apropiación), reducción (disminuye), traslado
            (pasa de un rubro a otro)
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2 col-span-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adicion">Adición</SelectItem>
                <SelectItem value="reduccion">Reducción</SelectItem>
                <SelectItem value="traslado">Traslado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(tipo === "reduccion" || tipo === "traslado") && (
            <div className="space-y-2">
              <Label>Rubro origen *</Label>
              <Select value={origenId} onValueChange={setOrigenId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione origen" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {rubros.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.codigo} — {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(tipo === "adicion" || tipo === "traslado") && (
            <div className="space-y-2">
              <Label>Rubro destino *</Label>
              <Select value={destinoId} onValueChange={setDestinoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione destino" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {rubros.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.codigo} — {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {tipo === "traslado" && (
            <div className="col-span-2 flex items-center justify-center my-1 text-emerald-600">
              <ArrowRight className="h-5 w-5" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Valor *</Label>
            <Input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="1000000"
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Motivo</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
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
            {saving ? "Guardando…" : "Crear modificación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
