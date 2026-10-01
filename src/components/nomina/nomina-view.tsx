"use client";

// ============================================================
// ERP Marsella — Vista de Nómina y Nómina Electrónica DIAN (CUNE)
// 5 tabs: Liquidaciones | Nueva nómina | Detalle (Sheet) |
//         Conceptos | Empleados
// Cálculos de devengos, deducciones, aportes patronales,
// provisiones, retención en la fuente, XML UBL 2.1 y CUNE.
// Acento emerald/teal, dark mode, responsive.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  UserCog,
  Wallet,
  Plus,
  RefreshCw,
  Search,
  Save,
  FileText,
  FileCheck,
  FileX,
  Eye,
  Loader2,
  ChevronDown,
  ChevronRight,
  Hash,
  Calculator,
  Settings2,
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Fingerprint,
  Code2,
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
interface Empleado {
  id: string;
  nombre: string;
  tipoDocumento: string;
  numeroDocumento: string;
  cargo?: string | null;
  salario?: number | null;
  fechaIngreso?: string | Date | null;
  epsId?: string | null;
  afpId?: string | null;
  arl?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  ciudad?: { nombre?: string } | null;
  activo?: boolean;
}

interface ConceptoNomina {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string; // devengo | deduccion | aporte_patronal | provision
  formula?: string | null;
  cuentaContableDebito?: string | null;
  cuentaContableCredito?: string | null;
  basePorDefecto: string;
  porcentaje: number;
  activo: boolean;
}

interface NominaItem {
  id: string;
  numero: string;
  tipo: string;
  periodoInicio: string;
  periodoFin: string;
  fechaPago: string;
  estado: string;
  estadoDIAN: string;
  cune?: string | null;
  totalDevengos: number;
  totalDeducciones: number;
  totalAportesPatronales: number;
  totalProvisiones: number;
  netoAPagar: number;
  empleadosCount: number;
}

interface ConceptoLinea {
  codigo: string;
  nombre: string;
  valor: number;
}

interface DetalleNominaItem {
  id: string;
  terceroId: string;
  salarioBasico: number;
  diasLaborados: number;
  ibc: number;
  devengos: string | null;
  deducciones: string | null;
  aportesPatronales: string | null;
  provisiones: string | null;
  totalDevengado: number;
  totalDeducciones: number;
  netoAPagar: number;
  cuneEmpleado?: string | null;
  xmlEmpleado?: string | null;
  tercero?: Empleado | null;
}

interface NominaDetalle extends NominaItem {
  detalles: DetalleNominaItem[];
  comprobante?: any | null;
}

interface CentroCosto {
  id: string;
  codigo: string;
  nombre: string;
}

// ---------- Constantes de UI ----------
const TIPOS_NOMINA: { value: string; label: string }[] = [
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "vacaciones", label: "Vacaciones" },
  { value: "liquidacion_final", label: "Liquidación final" },
];

const TIPOS_CONCEPTO: Record<string, { label: string; color: string }> = {
  devengo: { label: "Devengo", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900" },
  deduccion: { label: "Deducción", color: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900" },
  aporte_patronal: { label: "Aporte patronal", color: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900" },
  provision: { label: "Provisión", color: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900" },
};

const estadoBadge = (estado: string) => {
  const map: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
    borrador: { label: "Borrador", color: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800", Icon: Clock },
    causada: { label: "Causada", color: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900", Icon: FileCheck },
    pagada: { label: "Pagada", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900", Icon: CheckCircle2 },
    anulada: { label: "Anulada", color: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900", Icon: XCircle },
  };
  const e = map[estado] ?? map.borrador;
  const Icon = e.Icon;
  return (
    <Badge variant="outline" className={`border ${e.color} gap-1`}>
      <Icon className="h-3 w-3" /> {e.label}
    </Badge>
  );
};

const tipoLabel = (t: string) =>
  TIPOS_NOMINA.find((x) => x.value === t)?.label ?? t;

// ============================================================
// Componente principal
// ============================================================
export function NominaView() {
  const [tab, setTab] = useState<string>("liquidaciones");

  // ---------- Estados de datos ----------
  const [nominas, setNominas] = useState<NominaItem[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoNomina[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);

  const [loadingNominas, setLoadingNominas] = useState(false);
  const [loadingEmpleados, setLoadingEmpleados] = useState(false);
  const [loadingConceptos, setLoadingConceptos] = useState(false);
  const [loadingCentros, setLoadingCentros] = useState(false);

  // Sheet de detalle
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalle, setDetalle] = useState<NominaDetalle | null>(null);

  // Diálogo para ver XML / CUNE
  const [xmlDialogOpen, setXmlDialogOpen] = useState(false);
  const [xmlDialogContent, setXmlDialogContent] = useState<{ titulo: string; contenido: string }>({ titulo: "", contenido: "" });

  // Búsqueda
  const [searchNominas, setSearchNominas] = useState("");
  const [searchEmpleados, setSearchEmpleados] = useState("");

  // Form "nueva nómina"
  const [formTipo, setFormTipo] = useState("mensual");
  const [formPeriodoInicio, setFormPeriodoInicio] = useState("");
  const [formPeriodoFin, setFormPeriodoFin] = useState("");
  const [formFechaPago, setFormFechaPago] = useState("");
  const [formCentroCostoId, setFormCentroCostoId] = useState<string>("");
  const [formEmpleadosIds, setFormEmpleadosIds] = useState<string[]>([]);
  const [generando, setGenerando] = useState(false);

  // Acciones (causar / pagar / anular) en curso
  const [actioningId, setActioningId] = useState<string | null>(null);

  // ---------- Cargas ----------
  const cargarNominas = useCallback(async () => {
    setLoadingNominas(true);
    try {
      const r = await fetch(
        `/api/nomina?q=${encodeURIComponent(searchNominas)}&pageSize=200`,
        { cache: "no-store" },
      );
      const d = await r.json();
      setNominas(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar la lista de nóminas");
    } finally {
      setLoadingNominas(false);
    }
  }, [searchNominas]);

  const cargarEmpleados = useCallback(async () => {
    setLoadingEmpleados(true);
    try {
      const r = await fetch(
        `/api/terceros?tipo=empleado&pageSize=200&q=${encodeURIComponent(searchEmpleados)}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      setEmpleados(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar la lista de empleados");
    } finally {
      setLoadingEmpleados(false);
    }
  }, [searchEmpleados]);

  const cargarConceptos = useCallback(async () => {
    setLoadingConceptos(true);
    try {
      const r = await fetch("/api/nomina/conceptos", { cache: "no-store" });
      const d = await r.json();
      setConceptos(d ?? []);
    } catch {
      toast.error("No se pudieron cargar los conceptos de nómina");
    } finally {
      setLoadingConceptos(false);
    }
  }, []);

  const cargarCentros = useCallback(async () => {
    setLoadingCentros(true);
    try {
      const r = await fetch("/api/empresas?op=resoluciones", { cache: "no-store" });
      // fallback: lista simple por endpoint centros-costo (no existe, usamos contabilidad centros)
      const r2 = await fetch("/api/contabilidad?op=centros-costo", {
        cache: "no-store",
      }).catch(() => null);
      if (r2 && r2.ok) {
        const d = await r2.json();
        setCentrosCosto(d.items ?? d ?? []);
      } else {
        setCentrosCosto([]);
      }
    } catch {
      setCentrosCosto([]);
    } finally {
      setLoadingCentros(false);
    }
  }, []);

  // Cargar nominas en mount + cuando cambia search
  useEffect(() => {
    const t = setTimeout(() => cargarNominas(), 200);
    return () => clearTimeout(t);
  }, [cargarNominas]);

  // Cargar empleados al cambiar al tab correspondiente o al cambiar search
  useEffect(() => {
    if (tab === "empleados" || tab === "nueva") {
      const t = setTimeout(() => cargarEmpleados(), 200);
      return () => clearTimeout(t);
    }
  }, [tab, cargarEmpleados]);

  // Cargar conceptos al cambiar al tab
  useEffect(() => {
    if (tab === "conceptos") cargarConceptos();
  }, [tab, cargarConceptos]);

  // Cargar centros en mount
  useEffect(() => {
    cargarCentros();
  }, [cargarCentros]);

  // ---------- Acciones ----------
  const abrirDetalle = async (id: string) => {
    setDetalleOpen(true);
    setDetalleLoading(true);
    setDetalle(null);
    try {
      const r = await fetch(`/api/nomina/${id}`, { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setDetalle(d);
      else toast.error(d.error ?? "Error al cargar el detalle");
    } catch {
      toast.error("Error al cargar el detalle");
    } finally {
      setDetalleLoading(false);
    }
  };

  const toggleEmpleado = (id: string) => {
    setFormEmpleadosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const seleccionarTodos = () => {
    if (formEmpleadosIds.length === empleados.length) {
      setFormEmpleadosIds([]);
    } else {
      setFormEmpleadosIds(empleados.map((e) => e.id));
    }
  };

  const generarNomina = async () => {
    if (!formPeriodoInicio || !formPeriodoFin || !formFechaPago) {
      toast.error("Complete período y fecha de pago");
      return;
    }
    if (formEmpleadosIds.length === 0) {
      toast.error("Seleccione al menos un empleado");
      return;
    }
    setGenerando(true);
    try {
      const r = await fetch("/api/nomina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: formTipo,
          periodoInicio: formPeriodoInicio,
          periodoFin: formPeriodoFin,
          fechaPago: formFechaPago,
          centroCostoId: formCentroCostoId || undefined,
          empleadosIds: formEmpleadosIds,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        toast.success(`Nómina ${d.numero} generada`, {
          description: `Neto a pagar: ${fmtCOP(d.netoAPagar)}`,
        });
        // Reset form
        setFormEmpleadosIds([]);
        setFormPeriodoInicio("");
        setFormPeriodoFin("");
        setFormFechaPago("");
        setFormCentroCostoId("");
        setFormTipo("mensual");
        setTab("liquidaciones");
        cargarNominas();
      } else {
        toast.error(d.error ?? "Error al generar la nómina");
      }
    } catch {
      toast.error("Error al generar la nómina");
    } finally {
      setGenerando(false);
    }
  };

  const ejecutarAccion = async (
    nomina: NominaItem,
    accion: "causar" | "pagar" | "anular",
  ) => {
    setActioningId(nomina.id);
    try {
      const r = await fetch(`/api/nomina/${nomina.id}/${accion}`, {
        method: "POST",
      });
      const d = await r.json();
      if (r.ok) {
        toast.success(`Nómina ${accion}: ${nomina.numero}`, {
          description:
            accion === "pagar" && d.egreso
              ? `Egreso ${d.egreso.numero} por ${fmtCOP(d.egreso.valorTotal)}`
              : undefined,
        });
        cargarNominas();
        if (detalleOpen && detalle?.id === nomina.id) {
          abrirDetalle(nomina.id);
        }
      } else {
        toast.error(d.error ?? `Error al ${accion} la nómina`);
      }
    } catch {
      toast.error(`Error al ${accion} la nómina`);
    } finally {
      setActioningId(null);
    }
  };

  // ---------- Render ----------
  return (
    <Card className="border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <CardHeader className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Wallet className="h-5 w-5" />
              Nómina y Nómina Electrónica DIAN
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Liquidación de salarios, devengos, deducciones, aportes patronales, provisiones y CUNE.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cargarNominas();
              cargarEmpleados();
              cargarConceptos();
            }}
          >
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6">
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="h-auto flex-wrap bg-neutral-100 dark:bg-neutral-800/60">
            <TabsTrigger value="liquidaciones" className="gap-1.5">
              <FileText className="h-4 w-4" /> Liquidaciones
            </TabsTrigger>
            <TabsTrigger value="nueva" className="gap-1.5">
              <Plus className="h-4 w-4" /> Nueva nómina
            </TabsTrigger>
            <TabsTrigger value="conceptos" className="gap-1.5">
              <Calculator className="h-4 w-4" /> Conceptos
            </TabsTrigger>
            <TabsTrigger value="empleados" className="gap-1.5">
              <UserCog className="h-4 w-4" /> Empleados
            </TabsTrigger>
          </TabsList>

          {/* ============== TAB: LIQUIDACIONES ============== */}
          <TabsContent value="liquidaciones">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    placeholder="Buscar por número o tipo..."
                    value={searchNominas}
                    onChange={(e) => setSearchNominas(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab("nueva")}
                >
                  <Plus className="h-4 w-4" /> Nueva
                </Button>
              </div>

              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[140px]">Número</TableHead>
                        <TableHead className="min-w-[100px]">Tipo</TableHead>
                        <TableHead className="min-w-[100px]">Período</TableHead>
                        <TableHead className="min-w-[100px]">Fecha pago</TableHead>
                        <TableHead className="text-center"># Empl.</TableHead>
                        <TableHead className="text-right min-w-[120px]">Devengos</TableHead>
                        <TableHead className="text-right min-w-[120px]">Neto</TableHead>
                        <TableHead className="text-center min-w-[110px]">Estado</TableHead>
                        <TableHead className="text-center min-w-[170px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingNominas ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((__, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : nominas.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="text-center text-neutral-500 py-10"
                          >
                            <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            No hay nóminas registradas.
                          </TableCell>
                        </TableRow>
                      ) : (
                        nominas.map((n) => (
                          <TableRow
                            key={n.id}
                            className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 cursor-pointer"
                            onClick={() => abrirDetalle(n.id)}
                          >
                            <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                              {n.numero}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-neutral-100 dark:bg-neutral-800/60">
                                {tipoLabel(n.tipo)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-neutral-600 dark:text-neutral-400">
                              {fmtFecha(n.periodoInicio)} → {fmtFecha(n.periodoFin)}
                            </TableCell>
                            <TableCell className="text-xs">{fmtFecha(n.fechaPago)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="font-mono bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
                                {n.empleadosCount}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {fmtCOP(n.totalDevengos)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                              {fmtCOP(n.netoAPagar)}
                            </TableCell>
                            <TableCell className="text-center">{estadoBadge(n.estado)}</TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  title="Ver detalle"
                                  onClick={() => abrirDetalle(n.id)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {n.estado === "borrador" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                                    disabled={actioningId === n.id}
                                    onClick={() => ejecutarAccion(n, "causar")}
                                    title="Causar"
                                  >
                                    {actioningId === n.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <FileCheck className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {n.estado === "causada" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                                    disabled={actioningId === n.id}
                                    onClick={() => ejecutarAccion(n, "pagar")}
                                    title="Pagar"
                                  >
                                    {actioningId === n.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Wallet className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {(n.estado === "borrador" || n.estado === "causada") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900"
                                    disabled={actioningId === n.id}
                                    onClick={() => ejecutarAccion(n, "anular")}
                                    title="Anular"
                                  >
                                    <FileX className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                    {!loadingNominas && nominas.length > 0 && (
                  <TableFooter className="bg-neutral-50 dark:bg-neutral-900 sticky bottom-0">
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="font-semibold text-right">
                        Totales:
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                        {fmtCOP(nominas.reduce((a, n) => a + n.totalDevengos, 0))}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                        {fmtCOP(nominas.reduce((a, n) => a + n.netoAPagar, 0))}
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableFooter>
                )}
                  </Table>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ============== TAB: NUEVA NÓMINA ============== */}
          <TabsContent value="nueva">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Columna izquierda: configuración */}
              <Card className="lg:col-span-1 border-neutral-200 dark:border-neutral-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Parámetros
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de nómina</Label>
                    <Select value={formTipo} onValueChange={setFormTipo}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_NOMINA.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Período inicio</Label>
                      <Input
                        type="date"
                        value={formPeriodoInicio}
                        onChange={(e) => setFormPeriodoInicio(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Período fin</Label>
                      <Input
                        type="date"
                        value={formPeriodoFin}
                        onChange={(e) => setFormPeriodoFin(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fecha de pago</Label>
                    <Input
                      type="date"
                      value={formFechaPago}
                      onChange={(e) => setFormFechaPago(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Centro de costo</Label>
                    <Select
                      value={formCentroCostoId}
                      onValueChange={setFormCentroCostoId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sin centro de costo" />
                      </SelectTrigger>
                      <SelectContent>
                        {centrosCosto.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="font-mono text-emerald-700 dark:text-emerald-300">{c.codigo}</span>{" "}
                            {c.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Alert className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertTitle className="text-amber-800 dark:text-amber-300 text-sm">
                      Cálculo automático
                    </AlertTitle>
                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                      Al generar, el sistema calcula salario por días, aux. transporte,
                      EPS, pensión, ARL, ICBF, SENA, caja, cesantías, intereses,
                      prima, vacaciones y retención. Se genera el asiento contable
                      automático, el XML UBL y el CUNE por empleado.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              {/* Columna derecha: selección de empleados */}
              <Card className="lg:col-span-2 border-neutral-200 dark:border-neutral-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Empleados ({formEmpleadosIds.length}/{empleados.length})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Seleccione los empleados a incluir en la liquidación.
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={seleccionarTodos}>
                      {formEmpleadosIds.length === empleados.length && empleados.length > 0
                        ? "Quitar todos"
                        : "Seleccionar todos"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead className="min-w-[180px]">Empleado</TableHead>
                          <TableHead className="min-w-[120px]">Cargo</TableHead>
                          <TableHead className="text-right min-w-[120px]">Salario</TableHead>
                          <TableHead className="min-w-[100px]">EPS</TableHead>
                          <TableHead className="min-w-[100px]">AFP</TableHead>
                          <TableHead className="min-w-[100px]">ARL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingEmpleados ? (
                          Array.from({ length: 4 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 7 }).map((__, j) => (
                                <TableCell key={j}>
                                  <Skeleton className="h-5 w-full" />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : empleados.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center text-neutral-500 py-8"
                            >
                              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              No hay empleados registrados. Cree empleados desde
                              el módulo de Terceros (tipo=empleado).
                            </TableCell>
                          </TableRow>
                        ) : (
                          empleados.map((e) => {
                            const sel = formEmpleadosIds.includes(e.id);
                            return (
                              <TableRow
                                key={e.id}
                                onClick={() => toggleEmpleado(e.id)}
                                className={`cursor-pointer ${sel ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
                              >
                                <TableCell>
                                  <Checkbox checked={sel} />
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium text-sm">
                                    {e.nombre}
                                  </div>
                                  <div className="text-xs text-neutral-500 font-mono">
                                    {e.tipoDocumento} {e.numeroDocumento}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs">{e.cargo ?? "—"}</TableCell>
                                <TableCell className="text-right text-xs font-medium">
                                  {fmtCOP(e.salario ?? 0)}
                                </TableCell>
                                <TableCell className="text-xs">{e.epsId ?? "—"}</TableCell>
                                <TableCell className="text-xs">{e.afpId ?? "—"}</TableCell>
                                <TableCell className="text-xs">{e.arl ?? "—"}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="outline"
                onClick={() => {
                  setFormEmpleadosIds([]);
                  setFormPeriodoInicio("");
                  setFormPeriodoFin("");
                  setFormFechaPago("");
                  setFormCentroCostoId("");
                  setFormTipo("mensual");
                }}
              >
                Limpiar
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={generando || formEmpleadosIds.length === 0}
                onClick={generarNomina}
              >
                {generando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4 mr-1" />
                    Generar liquidación
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* ============== TAB: CONCEPTOS ============== */}
          <TabsContent value="conceptos">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold">Conceptos de nómina</h3>
                <p className="text-xs text-neutral-500">
                  Configuración de devengos, deducciones, aportes patronales y provisiones.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cargarConceptos()}
                disabled={loadingConceptos}
              >
                <RefreshCw className={`h-4 w-4 ${loadingConceptos ? "animate-spin" : ""}`} />
                Refrescar
              </Button>
            </div>

            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <div className="max-h-[65vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[160px]">Código</TableHead>
                      <TableHead className="min-w-[220px]">Nombre</TableHead>
                      <TableHead className="min-w-[140px]">Tipo</TableHead>
                      <TableHead className="min-w-[280px]">Fórmula</TableHead>
                      <TableHead className="min-w-[100px]">Cta. Débito</TableHead>
                      <TableHead className="min-w-[100px]">Cta. Crédito</TableHead>
                      <TableHead className="text-center min-w-[80px]">%</TableHead>
                      <TableHead className="text-center min-w-[80px]">Activo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingConceptos ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : conceptos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-neutral-500 py-8">
                          <Calculator className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No hay conceptos configurados. Ejecute el seed para crear los conceptos estándar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      conceptos.map((c) => {
                        const tc = TIPOS_CONCEPTO[c.tipo] ?? {
                          label: c.tipo,
                          color: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800",
                        };
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                              {c.codigo}
                            </TableCell>
                            <TableCell className="text-sm font-medium">{c.nombre}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={tc.color}>
                                {tc.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                              {c.formula ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {c.cuentaContableDebito ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {c.cuentaContableCredito ?? "—"}
                            </TableCell>
                            <TableCell className="text-center text-xs font-mono">
                              {c.porcentaje}%
                            </TableCell>
                            <TableCell className="text-center">
                              {c.activo ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 inline" />
                              ) : (
                                <XCircle className="h-4 w-4 text-neutral-400 inline" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* ============== TAB: EMPLEADOS ============== */}
          <TabsContent value="empleados">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1 max-w-md relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Buscar por nombre o documento..."
                  value={searchEmpleados}
                  onChange={(e) => setSearchEmpleados(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cargarEmpleados()}
                disabled={loadingEmpleados}
              >
                <RefreshCw className={`h-4 w-4 ${loadingEmpleados ? "animate-spin" : ""}`} />
                Refrescar
              </Button>
            </div>

            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <div className="max-h-[65vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[200px]">Empleado</TableHead>
                      <TableHead className="min-w-[150px]">Cargo</TableHead>
                      <TableHead className="text-right min-w-[130px]">Salario</TableHead>
                      <TableHead className="min-w-[110px]">Fecha ingreso</TableHead>
                      <TableHead className="min-w-[110px]">EPS</TableHead>
                      <TableHead className="min-w-[110px]">AFP</TableHead>
                      <TableHead className="min-w-[110px]">ARL</TableHead>
                      <TableHead className="text-center min-w-[80px]">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEmpleados ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : empleados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-neutral-500 py-8">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No hay empleados registrados. Cree empleados desde Terceros con tipo=empleado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      empleados.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{e.nombre}</div>
                            <div className="text-xs text-neutral-500 font-mono">
                              {e.tipoDocumento} {e.numeroDocumento}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{e.cargo ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            {fmtCOP(e.salario ?? 0)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {fmtFecha(e.fechaIngreso)}
                          </TableCell>
                          <TableCell className="text-xs">{e.epsId ?? "—"}</TableCell>
                          <TableCell className="text-xs">{e.afpId ?? "—"}</TableCell>
                          <TableCell className="text-xs">{e.arl ?? "—"}</TableCell>
                          <TableCell className="text-center">
                            {e.activo ? (
                              <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">
                                Activo
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400">
                                Inactivo
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* ============== SHEET: DETALLE DE NÓMINA ============== */}
      <Sheet open={detalleOpen} onOpenChange={setDetalleOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[80vw] lg:w-[70vw] overflow-y-auto"
        >
          <SheetHeader className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
            <SheetTitle className="text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              {detalle ? (
                <>
                  <Hash className="h-4 w-4" />
                  <span className="font-mono">{detalle.numero}</span>
                </>
              ) : (
                "Detalle de nómina"
              )}
            </SheetTitle>
            <SheetDescription>
              {detalle
                ? `${tipoLabel(detalle.tipo)} · ${fmtFecha(detalle.periodoInicio)} → ${fmtFecha(detalle.periodoFin)} · Pago ${fmtFecha(detalle.fechaPago)}`
                : "Cargando..."}
            </SheetDescription>
          </SheetHeader>

          {detalleLoading || !detalle ? (
            <div className="p-6">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KPI label="Devengos" value={fmtCOP(detalle.totalDevengos)} accent="emerald" />
                <KPI label="Deducciones" value={fmtCOP(detalle.totalDeducciones)} accent="rose" />
                <KPI label="Aportes patronales" value={fmtCOP(detalle.totalAportesPatronales)} accent="amber" />
                <KPI label="Provisiones" value={fmtCOP(detalle.totalProvisiones)} accent="teal" />
              </div>

              {/* CUNE global */}
              {detalle.cune && (
                <Alert className="border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20">
                  <Fingerprint className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <AlertTitle className="text-emerald-800 dark:text-emerald-300 text-sm">
                    CUNE Global (Nómina Electrónica DIAN)
                  </AlertTitle>
                  <AlertDescription className="text-xs font-mono break-all text-emerald-700 dark:text-emerald-400">
                    {detalle.cune}
                  </AlertDescription>
                </Alert>
              )}

              {/* Estado */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">Estado:</span>
                {estadoBadge(detalle.estado)}
                <span className="text-xs text-neutral-500 ml-2">DIAN:</span>
                <Badge variant="outline" className="bg-neutral-100 dark:bg-neutral-800/60">
                  {detalle.estadoDIAN}
                </Badge>
              </div>

              {/* Tabla de detalles por empleado */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="max-h-[50vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[180px]">Empleado</TableHead>
                        <TableHead className="text-right min-w-[100px]">Salario base</TableHead>
                        <TableHead className="text-center min-w-[60px]">Días</TableHead>
                        <TableHead className="text-right min-w-[100px]">IBC</TableHead>
                        <TableHead className="text-right min-w-[110px]">Devengado</TableHead>
                        <TableHead className="text-right min-w-[110px]">Deducciones</TableHead>
                        <TableHead className="text-right min-w-[110px]">Neto</TableHead>
                        <TableHead className="text-center min-w-[120px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.detalles.map((d) => (
                        <DetalleRow
                          key={d.id}
                          detalle={d}
                          onVerXML={(contenido, titulo) => {
                            setXmlDialogContent({ titulo, contenido });
                            setXmlDialogOpen(true);
                          }}
                        />
                      ))}
                    </TableBody>
                    <TableFooter className="bg-neutral-50 dark:bg-neutral-900 sticky bottom-0">
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="font-semibold text-right">
                          Totales ({detalle.detalles.length} empleados):
                        </TableCell>
                        <TableCell colSpan={3}></TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                          {fmtCOP(detalle.detalles.reduce((a, d) => a + d.totalDevengado, 0))}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-rose-700 dark:text-rose-300">
                          {fmtCOP(detalle.detalles.reduce((a, d) => a + d.totalDeducciones, 0))}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                          {fmtCOP(detalle.detalles.reduce((a, d) => a + d.netoAPagar, 0))}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>

              {/* Comprobante contable */}
              {detalle.comprobante && (
                <Card className="border-neutral-200 dark:border-neutral-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      Comprobante contable{" "}
                      <span className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                        {detalle.comprobante.numero}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 max-h-72 overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-[100px]">Cuenta</TableHead>
                            <TableHead className="min-w-[180px]">Nombre</TableHead>
                            <TableHead className="text-right min-w-[100px]">Débito</TableHead>
                            <TableHead className="text-right min-w-[100px]">Crédito</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detalle.comprobante.movimientos?.map((m: any) => (
                            <TableRow key={m.id}>
                              <TableCell className="font-mono text-xs">
                                {m.cuenta?.codigo ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {m.cuenta?.nombre ?? "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs text-emerald-700 dark:text-emerald-300">
                                {m.debito > 0 ? fmtCOP(m.debito) : "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs text-rose-700 dark:text-rose-300">
                                {m.credito > 0 ? fmtCOP(m.credito) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Acciones del sheet */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                {detalle.estado === "borrador" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300"
                    disabled={actioningId === detalle.id}
                    onClick={() => ejecutarAccion(detalle, "causar")}
                  >
                    {actioningId === detalle.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileCheck className="h-3.5 w-3.5" />
                    )}
                    Causar
                  </Button>
                )}
                {detalle.estado === "causada" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300"
                    disabled={actioningId === detalle.id}
                    onClick={() => ejecutarAccion(detalle, "pagar")}
                  >
                    {actioningId === detalle.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wallet className="h-3.5 w-3.5" />
                    )}
                    Pagar
                  </Button>
                )}
                {(detalle.estado === "borrador" || detalle.estado === "causada") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                    disabled={actioningId === detalle.id}
                    onClick={() => ejecutarAccion(detalle, "anular")}
                  >
                    <FileX className="h-3.5 w-3.5" />
                    Anular
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ============== DIALOG: Ver XML / CUNE ============== */}
      <Dialog open={xmlDialogOpen} onOpenChange={setXmlDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Code2 className="h-4 w-4" />
              {xmlDialogContent.titulo}
            </DialogTitle>
            <DialogDescription>
              Contenido de la nómina electrónica generada.
            </DialogDescription>
          </DialogHeader>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-neutral-50 dark:bg-neutral-950/60 p-3 rounded-md border border-neutral-200 dark:border-neutral-800 max-h-[60vh] overflow-y-auto">
            {xmlDialogContent.contenido}
          </pre>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  .writeText(xmlDialogContent.contenido)
                  .then(() => toast.success("Copiado al portapapeles"))
                  .catch(() => toast.error("No se pudo copiar"));
              }}
            >
              Copiar
            </Button>
            <Button
              variant="outline"
              onClick={() => setXmlDialogOpen(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================
// Subcomponente: KPI card
// ============================================================
function KPI({
  label,
  value,
  accent = "emerald",
}: {
  label: string;
  value: string;
  accent?: "emerald" | "rose" | "amber" | "teal" | "neutral";
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300",
    rose: "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300",
    amber: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300",
    teal: "bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-300",
    neutral: "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${colors[accent]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

// ============================================================
// Subcomponente: Fila expandible de DetalleNomina
// ============================================================
function DetalleRow({
  detalle,
  onVerXML,
}: {
  detalle: DetalleNominaItem;
  onVerXML: (contenido: string, titulo: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const devengos: ConceptoLinea[] = detalle.devengos
    ? JSON.parse(detalle.devengos)
    : [];
  const deducciones: ConceptoLinea[] = detalle.deducciones
    ? JSON.parse(detalle.deducciones)
    : [];
  const aportes: ConceptoLinea[] = detalle.aportesPatronales
    ? JSON.parse(detalle.aportesPatronales)
    : [];
  const provisiones: ConceptoLinea[] = detalle.provisiones
    ? JSON.parse(detalle.provisiones)
    : [];

  const nombre = detalle.tercero?.nombre ?? `Empleado ${detalle.terceroId.slice(-6)}`;
  const doc = detalle.tercero
    ? `${detalle.tercero.tipoDocumento} ${detalle.tercero.numeroDocumento}`
    : "—";

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
        onClick={() => setExpanded((e) => !e)}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            )}
            <div>
              <div className="font-medium text-sm">{nombre}</div>
              <div className="text-xs text-neutral-500 font-mono">{doc}</div>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right text-xs">{fmtCOP(detalle.salarioBasico)}</TableCell>
        <TableCell className="text-center text-xs font-mono">{detalle.diasLaborados}</TableCell>
        <TableCell className="text-right text-xs">{fmtCOP(detalle.ibc)}</TableCell>
        <TableCell className="text-right text-xs text-emerald-700 dark:text-emerald-300">
          {fmtCOP(detalle.totalDevengado)}
        </TableCell>
        <TableCell className="text-right text-xs text-rose-700 dark:text-rose-300">
          {fmtCOP(detalle.totalDeducciones)}
        </TableCell>
        <TableCell className="text-right text-sm font-bold text-emerald-700 dark:text-emerald-300">
          {fmtCOP(detalle.netoAPagar)}
        </TableCell>
        <TableCell className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              title="Ver XML UBL"
              onClick={(e) => {
                e.stopPropagation();
                onVerXML(detalle.xmlEmpleado ?? "", `XML UBL Nómina — ${nombre}`);
              }}
            >
              <Code2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              title="Ver CUNE"
              onClick={(e) => {
                e.stopPropagation();
                onVerXML(detalle.cuneEmpleado ?? "", `CUNE — ${nombre}`);
              }}
            >
              <Fingerprint className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-neutral-50/50 dark:bg-neutral-900/40 hover:bg-transparent">
          <TableCell colSpan={8} className="p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <DetalleBloque titulo="Devengos" items={devengos} accent="emerald" />
              <DetalleBloque titulo="Deducciones" items={deducciones} accent="rose" />
              <DetalleBloque titulo="Aportes patronales" items={aportes} accent="amber" />
              <DetalleBloque titulo="Provisiones" items={provisiones} accent="teal" />
            </div>
            {detalle.cuneEmpleado && (
              <Alert className="mt-3 border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
                <Fingerprint className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <AlertTitle className="text-emerald-800 dark:text-emerald-300 text-sm">
                  CUNE del empleado
                </AlertTitle>
                <AlertDescription className="text-xs font-mono break-all text-emerald-700 dark:text-emerald-400">
                  {detalle.cuneEmpleado}
                </AlertDescription>
              </Alert>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ============================================================
// Subcomponente: bloque de conceptos en el detalle expandido
// ============================================================
function DetalleBloque({
  titulo,
  items,
  accent,
}: {
  titulo: string;
  items: ConceptoLinea[];
  accent: "emerald" | "rose" | "amber" | "teal";
}) {
  const colors: Record<string, string> = {
    emerald: "border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/10",
    rose: "border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/10",
    amber: "border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10",
    teal: "border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/10",
  };
  const total = items.reduce((a, i) => a + i.valor, 0);
  return (
    <div className={`rounded-md border px-2 py-2 ${colors[accent]}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 opacity-80">
        {titulo}
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-xs text-neutral-500 italic">Sin conceptos</div>
        ) : (
          items.map((c) => (
            <div key={c.codigo} className="flex justify-between text-[11px]">
              <span className="text-neutral-700 dark:text-neutral-300 truncate pr-2">
                {c.nombre}
              </span>
              <span className="font-mono font-medium whitespace-nowrap">
                {fmtCOP(c.valor)}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="flex justify-between text-[11px] border-t border-current/20 pt-1 mt-1 font-semibold">
        <span>Total</span>
        <span className="font-mono">{fmtCOP(total)}</span>
      </div>
    </div>
  );
}
