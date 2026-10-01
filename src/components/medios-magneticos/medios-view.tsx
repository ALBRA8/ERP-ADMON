"use client";

// ============================================================
// ERP Marsella — Vista de Medios Magnéticos DIAN
// Tabs: Generar medio | Medios generados (con Sheet de detalle)
// Formatos: 1007 | 2276 | 2277 | 1647 | 2238
// Acciones: Generar, Ver detalle, Descargar TXT, Descargar XLSX, Eliminar
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Database,
  FileSpreadsheet,
  FileText,
  Trash2,
  RefreshCw,
  Eye,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  FileBarChart,
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

// ---------- Tipos ----------
type FormatoDIAN = "1007" | "2276" | "2277" | "1647" | "2238";

const FORMATOS: { value: FormatoDIAN; label: string; descripcion: string }[] = [
  {
    value: "1007",
    label: "1007 — Certificados de retención practicados",
    descripcion:
      "Retenciones en la fuente practicadas a terceros (Comprobantes de Egreso y Recibos de Caja del año).",
  },
  {
    value: "2276",
    label: "2276 — Retenciones que le practicaron",
    descripcion:
      "Retenciones en la fuente que le practicaron a la empresa (Facturas de Compra con totalRetenciones).",
  },
  {
    value: "2277",
    label: "2277 — Conceptos de IVA",
    descripcion:
      "Resumen IVA generado (Facturas de Venta) vs IVA descontable (Facturas de Compra).",
  },
  {
    value: "1647",
    label: "1647 — Ingresos brutos",
    descripcion: "Facturas de Venta del año agrupadas por tercero.",
  },
  {
    value: "2238",
    label: "2238 — Egresos pagados",
    descripcion: "Comprobantes de Egreso + Facturas de Compra del año por tercero.",
  },
];

interface MedioMagnetico {
  id: string;
  anio: number;
  formato: string;
  nombre: string;
  estado: string;
  fechaGeneracion: string | null;
  totalRegistros: number;
  createdAt: string;
  totalRetenido?: number;
  totalPago?: number;
  totalDetalles?: number;
}

interface DetalleMedio {
  id: string;
  tipoDocExpedida: string | null;
  nitTercero: string;
  razonSocial: string;
  concepto: string;
  valorPago: number;
  baseRetencion: number;
  porcentaje: number;
  valorRetenido: number;
  ciudad: string | null;
}

// ---------- Badges ----------
function formatoBadge(formato: string) {
  const colors: Record<string, string> = {
    "1007":
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    "2276":
      "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
    "2277":
      "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
    "1647":
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    "2238":
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <Badge variant="outline" className={colors[formato] ?? ""}>
      {formato}
    </Badge>
  );
}

function estadoBadge(estado: string) {
  const colors: Record<string, string> = {
    generado:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    borrador:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    enviado:
      "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  };
  return (
    <Badge variant="outline" className={colors[estado] ?? ""}>
      {estado}
    </Badge>
  );
}

function conceptoBadge(concepto: string) {
  const colors: Record<string, string> = {
    RETEFUENTE:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    RETEIVA:
      "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
    RETEICA:
      "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
    IVA_GENERADO:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    IVA_DEDUCTIBLE:
      "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
    INGRESO:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    EGRESO:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <Badge variant="outline" className={colors[concepto] ?? ""}>
      {concepto}
    </Badge>
  );
}

const currentYear = () => new Date().getFullYear();

// ============================================================
// Componente principal
// ============================================================
export function MediosView() {
  const [tab, setTab] = useState<string>("generar");

  // Formulario
  const [anio, setAnio] = useState<string>(String(currentYear()));
  const [formato, setFormato] = useState<FormatoDIAN>("1007");
  const [nombre, setNombre] = useState<string>("");
  const [generando, setGenerando] = useState(false);

  // Listado
  const [medios, setMedios] = useState<MedioMagnetico[]>([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [filtroAnio, setFiltroAnio] = useState<string>("");
  const [filtroFormato, setFiltroFormato] = useState<string>("");

  // Sheet detalle
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleMedio, setDetalleMedio] = useState<MedioMagnetico | null>(null);
  const [detalleRegistros, setDetalleRegistros] = useState<DetalleMedio[]>([]);
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [detalleTotal, setDetalleTotal] = useState(0);
  const [detallePage, setDetallePage] = useState(1);
  const [detalleTotalRetenido, setDetalleTotalRetenido] = useState(0);
  const [detalleTotalPago, setDetalleTotalPago] = useState(0);
  const [detalleTotalBase, setDetalleTotalBase] = useState(0);
  const detallePageSize = 100;

  // ---------- Carga de medios ----------
  const cargarMedios = useCallback(async () => {
    setLoadingMedios(true);
    try {
      const params = new URLSearchParams();
      if (filtroAnio) params.set("anio", filtroAnio);
      if (filtroFormato) params.set("formato", filtroFormato);
      params.set("pageSize", "200");
      const r = await fetch(
        `/api/medios-magneticos?${params.toString()}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMedios(d.items ?? []);
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron cargar los medios magnéticos");
    } finally {
      setLoadingMedios(false);
    }
  }, [filtroAnio, filtroFormato]);

  useEffect(() => {
    cargarMedios();
  }, [cargarMedios]);

  // ---------- Generar ----------
  const generar = async () => {
    setGenerando(true);
    try {
      const anioNum = parseInt(anio, 10);
      if (!Number.isFinite(anioNum) || anioNum < 2010 || anioNum > 2100) {
        toast.error("Año inválido (2010-2100)");
        return;
      }
      const r = await fetch("/api/medios-magneticos/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anio: anioNum,
          formato,
          nombre: nombre || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error || "Error generando medio");
      }
      toast.success(
        `Medio ${formato} ${anioNum} generado — ${d.totalRegistros} registros, ${fmtCOP(d.totalRetenido)} retenido`,
      );
      setNombre("");
      setTab("listado");
      cargarMedios();
    } catch (e: any) {
      toast.error(e?.message || "Error al generar medio magnético");
    } finally {
      setGenerando(false);
    }
  };

  // ---------- Eliminar ----------
  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar este medio magnético y todos sus registros?")) return;
    try {
      const r = await fetch(`/api/medios-magneticos/${id}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error eliminando");
      toast.success("Medio eliminado");
      cargarMedios();
      if (detalleMedio?.id === id) {
        setDetalleOpen(false);
        setDetalleMedio(null);
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar");
    }
  };

  // ---------- Descargar TXT/XLSX ----------
  const descargarArchivo = async (id: string, tipo: "txt" | "xlsx") => {
    try {
      const r = await fetch(`/api/medios-magneticos/${id}/${tipo}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Error descargando archivo");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disp = r.headers.get("Content-Disposition") || "";
      const m = disp.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `medio-${id}.${tipo}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Descarga .${tipo} iniciada`);
    } catch (e: any) {
      toast.error(e?.message || "Error al descargar");
    }
  };

  // ---------- Abrir detalle ----------
  const abrirDetalle = async (medio: MedioMagnetico) => {
    setDetalleMedio(medio);
    setDetalleOpen(true);
    setDetallePage(1);
    await cargarDetalle(medio.id, 1);
  };

  const cargarDetalle = async (id: string, page: number) => {
    setDetalleCargando(true);
    try {
      const r = await fetch(
        `/api/medios-magneticos/${id}?page=${page}&pageSize=${detallePageSize}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error cargando detalle");
      setDetalleRegistros(d.registros ?? []);
      setDetalleTotal(d.total ?? 0);
      setDetallePage(page);
      setDetalleTotalRetenido(d.totalRetenido ?? 0);
      setDetalleTotalPago(d.totalPago ?? 0);
      setDetalleTotalBase(d.totalBase ?? 0);
    } catch (e: any) {
      toast.error(e?.message || "Error al cargar detalle");
    } finally {
      setDetalleCargando(false);
    }
  };

  const totalPaginasDetalle = Math.max(
    1,
    Math.ceil(detalleTotal / detallePageSize),
  );

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Database className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Medios Magnéticos DIAN
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Generación de formatos 1007 · 2276 · 2277 · 1647 · 2238 para envío a la DIAN
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={cargarMedios}
          disabled={loadingMedios}
        >
          <RefreshCw className={`h-4 w-4 ${loadingMedios ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="generar" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Generar medio
          </TabsTrigger>
          <TabsTrigger value="listado" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Medios generados
            {medios.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {medios.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: Generar ===== */}
        <TabsContent value="generar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Generar medio magnético
              </CardTitle>
              <CardDescription>
                Seleccione el año gravable y el formato DIAN. El sistema
                consultará todos los documentos del periodo y construirá los
                registros en estructura DIAN válida.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="anio">Año gravable</Label>
                  <Input
                    id="anio"
                    type="number"
                    value={anio}
                    onChange={(e) => setAnio(e.target.value)}
                    min={2010}
                    max={2100}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="formato">Formato DIAN</Label>
                  <Select
                    value={formato}
                    onValueChange={(v) => setFormato(v as FormatoDIAN)}
                  >
                    <SelectTrigger id="formato">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATOS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre (opcional)</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={`Ej: Certificados de retención ${anio}`}
                />
              </div>

              {/* Descripción del formato */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Formato {formato}</AlertTitle>
                <AlertDescription>
                  {FORMATOS.find((f) => f.value === formato)?.descripcion}
                </AlertDescription>
              </Alert>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={generar}
                  disabled={generando}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {generando ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generando ? "Generando..." : "Generar medio"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAnio(String(currentYear()));
                    setFormato("1007");
                    setNombre("");
                  }}
                  disabled={generando}
                >
                  Reiniciar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: Listado ===== */}
        <TabsContent value="listado" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Medios generados
              </CardTitle>
              <CardDescription>
                Filtre por año o formato. Use las acciones para ver detalle,
                descargar TXT (DIAN) o XLSX (contador), o eliminar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  type="number"
                  placeholder="Año (vacío = todos)"
                  value={filtroAnio}
                  onChange={(e) => setFiltroAnio(e.target.value)}
                />
                <Select
                  value={filtroFormato || "todos"}
                  onValueChange={(v) =>
                    setFiltroFormato(v === "todos" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Formato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los formatos</SelectItem>
                    {FORMATOS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={cargarMedios}
                  disabled={loadingMedios}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadingMedios ? "animate-spin" : ""}`}
                  />
                  Filtrar
                </Button>
              </div>

              {/* Tabla */}
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 max-h-[600px] overflow-y-auto custom-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                    <TableRow>
                      <TableHead>Año</TableHead>
                      <TableHead>Formato</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Registros</TableHead>
                      <TableHead className="text-right">Total retenido</TableHead>
                      <TableHead className="text-right">Total pago</TableHead>
                      <TableHead>Fecha generación</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingMedios ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={9}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : medios.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-neutral-500 py-8">
                          No hay medios magnéticos generados. Vaya a la pestaña
                          &ldquo;Generar medio&rdquo; para crear uno.
                        </TableCell>
                      </TableRow>
                    ) : (
                      medios.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.anio}</TableCell>
                          <TableCell>{formatoBadge(m.formato)}</TableCell>
                          <TableCell className="max-w-[280px] truncate" title={m.nombre}>
                            {m.nombre}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {m.totalDetalles ?? m.totalRegistros}
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-300">
                            {fmtCOP(m.totalRetenido ?? 0)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtCOP(m.totalPago ?? 0)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {fmtFecha(m.fechaGeneracion)}
                          </TableCell>
                          <TableCell>{estadoBadge(m.estado)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Ver detalle"
                                onClick={() => abrirDetalle(m)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Descargar TXT"
                                onClick={() => descargarArchivo(m.id, "txt")}
                              >
                                <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Descargar XLSX"
                                onClick={() => descargarArchivo(m.id, "xlsx")}
                              >
                                <FileSpreadsheet className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Eliminar"
                                onClick={() => eliminar(m.id)}
                              >
                                <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Sheet de Detalle ===== */}
      <Sheet open={detalleOpen} onOpenChange={setDetalleOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {detalleMedio && formatoBadge(detalleMedio.formato)}
              Detalle medio magnético
            </SheetTitle>
            <SheetDescription>
              {detalleMedio?.nombre} · {detalleMedio?.anio} ·{" "}
              {detalleMedio?.totalRegistros} registros
            </SheetDescription>
          </SheetHeader>

          {detalleMedio && (
            <div className="px-4 pb-4 space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                  <div className="text-[10px] uppercase text-emerald-700 dark:text-emerald-300">
                    Total registros
                  </div>
                  <div className="text-lg font-bold">
                    {detalleMedio.totalRegistros}
                  </div>
                </div>
                <div className="rounded-md border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 p-3">
                  <div className="text-[10px] uppercase text-teal-700 dark:text-teal-300">
                    Total retenido
                  </div>
                  <div className="text-lg font-bold">
                    {fmtCOP(detalleTotalRetenido)}
                  </div>
                </div>
                <div className="rounded-md border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 p-3">
                  <div className="text-[10px] uppercase text-cyan-700 dark:text-cyan-300">
                    Total pago/base
                  </div>
                  <div className="text-lg font-bold">
                    {fmtCOP(detalleTotalPago)}
                  </div>
                </div>
              </div>

              {/* Paginación */}
              {detalleTotal > detallePageSize && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Página {detallePage} de {totalPaginasDetalle} · {detalleTotal} registros
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={detallePage <= 1 || detalleCargando}
                      onClick={() =>
                        cargarDetalle(detalleMedio.id, detallePage - 1)
                      }
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        detallePage >= totalPaginasDetalle || detalleCargando
                      }
                      onClick={() =>
                        cargarDetalle(detalleMedio.id, detallePage + 1)
                      }
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}

              {/* Tabla de registros */}
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 max-h-[50vh] overflow-y-auto custom-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                    <TableRow>
                      <TableHead>NIT</TableHead>
                      <TableHead>Razón Social</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Valor Pago</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Retenido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalleCargando ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : detalleRegistros.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-neutral-500 py-6"
                        >
                          Sin registros
                        </TableCell>
                      </TableRow>
                    ) : (
                      detalleRegistros.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            {r.nitTercero}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate" title={r.razonSocial}>
                            {r.razonSocial}
                          </TableCell>
                          <TableCell>{conceptoBadge(r.concepto)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtCOP(r.valorPago)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtCOP(r.baseRetencion)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {r.porcentaje.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-700 dark:text-emerald-300">
                            {fmtCOP(r.valorRetenido)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {detalleRegistros.length > 0 && (
                    <TableFooter className="sticky bottom-0 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow>
                        <TableCell colSpan={3} className="font-bold">
                          Totales
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtCOP(detalleTotalPago)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtCOP(detalleTotalBase)}
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-300">
                          {fmtCOP(detalleTotalRetenido)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>

              {/* Botones de descarga */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => descargarArchivo(detalleMedio.id, "txt")}
                >
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Descargar TXT
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => descargarArchivo(detalleMedio.id, "xlsx")}
                >
                  <FileSpreadsheet className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Descargar XLSX
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  onClick={() => eliminar(detalleMedio.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              </div>

              <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                El archivo TXT está separado por <code className="px-1 bg-neutral-100 dark:bg-neutral-800 rounded">|</code> con encabezado, detalles y línea de totales.
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
