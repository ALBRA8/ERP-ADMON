"use client";

// ============================================================
// ERP Marsella — Vista de Estados Financieros NIIF (IFRS)
//
// Generación y persistencia de:
//   • ESF — Estado de Situación Financiera (Balance General NIIF)
//   • EER — Estado de Resultado Integral
//   • ECP — Estado de Cambios en el Patrimonio
//   • EFE — Estado de Flujos de Efectivo (método indirecto)
//   • Reportes NIIF guardados (ver JSON, descargar PDF, eliminar)
//
// Backend:
//   GET  /api/niif/esf?fechaFin=...
//   GET  /api/niif/eer?fechaInicio=...&fechaFin=...
//   GET  /api/niif/ecp?fechaInicio=...&fechaFin=...
//   GET  /api/niif/efe?fechaInicio=...&fechaFin=...
//   POST /api/niif/guardar
//   GET  /api/niif/reportes
//   GET  /api/niif/reportes/[id]
//   GET  /api/niif/reportes/[id]/pdf
//   DELETE /api/niif/reportes/[id]
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Landmark,
  Calculator,
  TrendingUp,
  Wallet,
  Save,
  FileText,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileBarChart,
  ArrowRight,
  ArrowDownCircle,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ---------- Helpers ----------
const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

const fmtFecha = (s: string | Date | null | undefined): string => {
  if (!s) return "—";
  const d = typeof s === "string" ? new Date(s) : s;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

const todayISO = (): string => new Date().toISOString().slice(0, 10);
const startOfYearISO = (): string => `${new Date().getFullYear()}-01-01`;

// ---------- Tipos ----------

interface SaldoLine {
  codigo: string;
  nombre: string;
  saldo: number;
}

interface ESFSection {
  lineas: SaldoLine[];
  total: number;
}

interface ESFData {
  fechaFin: string;
  activo: {
    corriente: ESFSection;
    no_corriente: ESFSection;
    inventarios: ESFSection;
    clientes: ESFSection;
    efectivo: ESFSection;
    total: number;
  };
  pasivo: {
    corriente: ESFSection;
    no_corriente: ESFSection;
    total: number;
  };
  patrimonio: ESFSection & { utilidadPeriodo: number };
  totalActivo: number;
  totalPasivoPatrimonio: number;
  diferencia: number;
}

interface EERData {
  fechaInicio: string;
  fechaFin: string;
  ingresos: SaldoLine[];
  costosVenta: SaldoLine[];
  gastosAdmin: SaldoLine[];
  costosProduccion: SaldoLine[];
  otrosIngresos: SaldoLine[];
  otrosGastos: SaldoLine[];
  totalIngresos: number;
  totalCostosVenta: number;
  totalGastosAdmin: number;
  totalCostosProduccion: number;
  totalOtrosIngresos: number;
  totalOtrosGastos: number;
  utilidadBruta: number;
  utilidadOperativa: number;
  utilidadAntesImpuestos: number;
  impuestoRenta: number;
  utilidadNeta: number;
}

interface ECPMov {
  concepto: string;
  categoria: string;
  monto: number;
}
interface ECPData {
  fechaInicio: string;
  fechaFin: string;
  saldoInicialPatrimonio: number;
  aumentos: ECPMov[];
  reducciones: ECPMov[];
  utilidadNetaPeriodo: number;
  dividendos: number;
  saldoFinalPatrimonio: number;
}

interface EFELine {
  concepto: string;
  monto: number;
}
interface EFEData {
  fechaInicio: string;
  fechaFin: string;
  utilidadNeta: number;
  ajustesNoCaja: EFELine[];
  flujosOperacion: EFELine[];
  flujosInversion: EFELine[];
  flujosFinanciacion: EFELine[];
  totalOperacion: number;
  totalInversion: number;
  totalFinanciacion: number;
  aumentoNetoEfectivo: number;
  saldoInicial: number;
  saldoFinal: number;
}

interface ReporteGuardado {
  id: string;
  tipo: string;
  periodo: string;
  fechaInicio: string;
  fechaFin: string;
  json_data: any;
  archivo?: string | null;
  createdAt: string;
  totalRegistros?: number;
}

// ============================================================
// Componente principal
// ============================================================

export function NiifView() {
  const [tab, setTab] = useState("esf");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Estados Financieros NIIF
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Generación de estados financieros conforme a Normas Internacionales
            de Información Financiera (IFRS / NIC 1).
          </p>
        </div>
        <Badge
          variant="outline"
          className="self-start md:self-auto border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
        >
          IFRS · NIC 1 · NIC 7
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
          <TabsTrigger value="esf" className="text-xs md:text-sm">
            <Calculator className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Situación Financiera</span>
            <span className="md:hidden">ESF</span>
          </TabsTrigger>
          <TabsTrigger value="eer" className="text-xs md:text-sm">
            <TrendingUp className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Resultado Integral</span>
            <span className="md:hidden">EER</span>
          </TabsTrigger>
          <TabsTrigger value="ecp" className="text-xs md:text-sm">
            <Wallet className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Cambios Patrimonio</span>
            <span className="md:hidden">ECP</span>
          </TabsTrigger>
          <TabsTrigger value="efe" className="text-xs md:text-sm">
            <ArrowDownCircle className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Flujos Efectivo</span>
            <span className="md:hidden">EFE</span>
          </TabsTrigger>
          <TabsTrigger value="guardados" className="text-xs md:text-sm">
            <FileBarChart className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Reportes Guardados</span>
            <span className="md:hidden">Guardados</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="esf" className="mt-4">
          <ESFTab />
        </TabsContent>
        <TabsContent value="eer" className="mt-4">
          <EERTab />
        </TabsContent>
        <TabsContent value="ecp" className="mt-4">
          <ECPTab />
        </TabsContent>
        <TabsContent value="efe" className="mt-4">
          <EFETab />
        </TabsContent>
        <TabsContent value="guardados" className="mt-4">
          <GuardadosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Sub-tabla reutilizable: lista de cuentas con saldos
// ============================================================

function TablaSaldos({
  lineas,
  tituloTotal,
  total,
  indent = false,
}: {
  lineas: SaldoLine[];
  tituloTotal: string;
  total: number;
  indent?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="max-h-80 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        <Table>
          {lineas.length > 0 && (
            <TableHeader>
              <TableRow className="bg-neutral-50 dark:bg-neutral-900">
                <TableHead className="w-20">Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right w-40">Saldo</TableHead>
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {lineas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-neutral-400 text-xs italic py-3">
                  Sin partidas para este rubro.
                </TableCell>
              </TableRow>
            ) : (
              lineas.map((l, i) => (
                <TableRow key={`${l.codigo}-${i}`}>
                  <TableCell className="font-mono text-xs">
                    {l.codigo}
                  </TableCell>
                  <TableCell
                    className={`text-sm ${indent ? "pl-4" : ""}`}
                  >
                    {l.nombre}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {fmtCOP(l.saldo)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {lineas.length > 0 && (
            <TableFooter>
              <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/20 font-semibold">
                <TableCell colSpan={2} className="text-right text-sm">
                  {tituloTotal}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {fmtCOP(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

// ============================================================
// Helpers para guardar y descargar PDF (comunes)
// ============================================================

async function guardarReporte(
  tipo: string,
  periodo: string,
  fechaInicio: string,
  fechaFin: string,
  json_data: any,
): Promise<void> {
  const r = await fetch("/api/niif/guardar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, periodo, fechaInicio, fechaFin, json_data }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Error guardando reporte");
}

function descargarPDF(reporteId: string) {
  window.open(`/api/niif/reportes/${reporteId}/pdf?download=1`, "_blank", "noopener,noreferrer");
}

// ============================================================
// TAB: Estado de Situación Financiera (ESF)
// ============================================================

function ESFTab() {
  const [fechaFin, setFechaFin] = useState(todayISO());
  const [data, setData] = useState<ESFData | null>(null);
  const [loading, setLoading] = useState(false);

  const generar = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const r = await fetch(`/api/niif/esf?fechaFin=${encodeURIComponent(fechaFin)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error generando ESF");
      setData(d as ESFData);
      toast.success("Estado de Situación Financiera generado", {
        description: `Al ${fmtFecha(d.fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo generar el ESF", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [fechaFin]);

  const guardar = useCallback(async () => {
    if (!data) return;
    try {
      await guardarReporte(
        "ESF",
        "anual",
        `${new Date(data.fechaFin).getFullYear()}-01-01`,
        fechaFin,
        data,
      );
      toast.success("Reporte guardado", {
        description: `ESF al ${fmtFecha(data.fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo guardar el reporte", { description: e?.message });
    }
  }, [data, fechaFin]);

  // Descargar PDF: primero guardamos el reporte y luego descargamos su PDF
  const [pdfLoading, setPdfLoading] = useState(false);
  const descargarPDFESF = useCallback(async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      const r = await fetch("/api/niif/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "ESF",
          periodo: "anual",
          fechaInicio: `${new Date(data.fechaFin).getFullYear()}-01-01`,
          fechaFin,
          json_data: data,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error guardando reporte");
      descargarPDF(d.id);
    } catch (e: any) {
      toast.error("No se pudo descargar el PDF", { description: e?.message });
    } finally {
      setPdfLoading(false);
    }
  }, [data, fechaFin]);

  const cuadra = data && Math.abs(data.diferencia) < 1;

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <Calculator className="w-5 h-5" />
          Estado de Situación Financiera
        </CardTitle>
        <CardDescription>
          Balance General bajo NIIF (NIC 1) — muestra Activo, Pasivo y
          Patrimonio con clasificación corriente / no corriente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="esf-fecha-fin">Fecha de corte</Label>
            <Input
              id="esf-fecha-fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              max={todayISO()}
            />
          </div>
          <Button
            onClick={generar}
            disabled={loading || !fechaFin}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Generar ESF
          </Button>
        </div>

        {data && (
          <>
            <div className="flex flex-col md:flex-row gap-3">
              <Button
                onClick={guardar}
                variant="outline"
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar reporte
              </Button>
              <Button
                onClick={descargarPDFESF}
                variant="outline"
                disabled={pdfLoading}
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Descargar PDF
              </Button>
              <div className="flex-1" />
              <Badge
                variant="outline"
                className={
                  cuadra
                    ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                }
              >
                {cuadra ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                ) : (
                  <AlertCircle className="w-3 h-3 mr-1" />
                )}
                Diferencia: {fmtCOP(data.diferencia)} ({cuadra ? "Cuadra" : "No cuadra"})
              </Badge>
            </div>

            {/* ACTIVO */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-emerald-700 dark:text-emerald-300 border-b pb-1 border-emerald-500/20">
                Activo
              </h3>
              <TablaSaldos
                lineas={data.activo.efectivo.lineas}
                tituloTotal="Subtotal efectivo y equivalentes"
                total={data.activo.efectivo.total}
                indent
              />
              <TablaSaldos
                lineas={data.activo.clientes.lineas}
                tituloTotal="Subtotal clientes"
                total={data.activo.clientes.total}
                indent
              />
              <TablaSaldos
                lineas={data.activo.inventarios.lineas}
                tituloTotal="Subtotal inventarios"
                total={data.activo.inventarios.total}
                indent
              />
              <TablaSaldos
                lineas={data.activo.corriente.lineas}
                tituloTotal="Subtotal activo corriente (otros)"
                total={data.activo.corriente.total}
                indent
              />
              <TablaSaldos
                lineas={data.activo.no_corriente.lineas}
                tituloTotal="Subtotal activo no corriente"
                total={data.activo.no_corriente.total}
                indent
              />
              <div className="flex justify-end">
                <div className="bg-emerald-100 dark:bg-emerald-950/40 px-4 py-2 rounded-md font-bold text-emerald-800 dark:text-emerald-200">
                  TOTAL ACTIVO: {fmtCOP(data.totalActivo)}
                </div>
              </div>
            </div>

            {/* PASIVO */}
            <div className="space-y-3 pt-3">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-emerald-700 dark:text-emerald-300 border-b pb-1 border-emerald-500/20">
                Pasivo
              </h3>
              <TablaSaldos
                lineas={data.pasivo.corriente.lineas}
                tituloTotal="Subtotal pasivo corriente"
                total={data.pasivo.corriente.total}
                indent
              />
              <TablaSaldos
                lineas={data.pasivo.no_corriente.lineas}
                tituloTotal="Subtotal pasivo no corriente"
                total={data.pasivo.no_corriente.total}
                indent
              />
              <div className="flex justify-end">
                <div className="bg-amber-50 dark:bg-amber-950/40 px-4 py-2 rounded-md font-bold text-amber-800 dark:text-amber-200">
                  TOTAL PASIVO: {fmtCOP(data.pasivo.total)}
                </div>
              </div>
            </div>

            {/* PATRIMONIO */}
            <div className="space-y-3 pt-3">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-emerald-700 dark:text-emerald-300 border-b pb-1 border-emerald-500/20">
                Patrimonio
              </h3>
              <TablaSaldos
                lineas={data.patrimonio.lineas}
                tituloTotal="Subtotal patrimonio (cuentas clase 3)"
                total={data.patrimonio.total}
                indent
              />
              <div className="flex justify-end">
                <div className="flex flex-col items-end gap-1">
                  <div className="text-xs text-neutral-500">
                    Utilidad del período: {fmtCOP(data.patrimonio.utilidadPeriodo)}
                  </div>
                  <div className="bg-emerald-100 dark:bg-emerald-950/40 px-4 py-2 rounded-md font-bold text-emerald-800 dark:text-emerald-200">
                    TOTAL PATRIMONIO:{" "}
                    {fmtCOP(
                      data.totalPasivoPatrimonio - data.pasivo.total,
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* TOTALES */}
            <div className="border-t-2 border-emerald-500/30 pt-3 mt-3">
              <div className="flex flex-col md:flex-row md:justify-between gap-2">
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  Total Activo = Total Pasivo + Patrimonio
                </div>
                <div className="flex gap-3">
                  <span className="font-bold">
                    Activo: {fmtCOP(data.totalActivo)}
                  </span>
                  <ArrowRight className="w-4 h-4 text-neutral-400 self-center" />
                  <span className="font-bold">
                    Pasivo+Patrimonio: {fmtCOP(data.totalPasivoPatrimonio)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// TAB: Estado de Resultado Integral (EER)
// ============================================================

function EERTab() {
  const [fechaInicio, setFechaInicio] = useState(startOfYearISO());
  const [fechaFin, setFechaFin] = useState(todayISO());
  const [data, setData] = useState<EERData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const generar = useCallback(async () => {
    if (!fechaInicio || !fechaFin) return;
    setLoading(true);
    setData(null);
    try {
      const r = await fetch(
        `/api/niif/eer?fechaInicio=${encodeURIComponent(fechaInicio)}&fechaFin=${encodeURIComponent(fechaFin)}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error generando EER");
      setData(d as EERData);
      toast.success("Estado de Resultado Integral generado", {
        description: `${fmtFecha(d.fechaInicio)} → ${fmtFecha(d.fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo generar el EER", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin]);

  const guardar = useCallback(async () => {
    if (!data) return;
    try {
      await guardarReporte("EER", "anual", fechaInicio, fechaFin, data);
      toast.success("Reporte guardado", {
        description: `EER ${fmtFecha(fechaInicio)} → ${fmtFecha(fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo guardar", { description: e?.message });
    }
  }, [data, fechaInicio, fechaFin]);

  const descargarPDFEER = useCallback(async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      const r = await fetch("/api/niif/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "EER",
          periodo: "anual",
          fechaInicio,
          fechaFin,
          json_data: data,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error guardando reporte");
      descargarPDF(d.id);
    } catch (e: any) {
      toast.error("No se pudo descargar el PDF", { description: e?.message });
    } finally {
      setPdfLoading(false);
    }
  }, [data, fechaInicio, fechaFin]);

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <TrendingUp className="w-5 h-5" />
          Estado de Resultado Integral
        </CardTitle>
        <CardDescription>
          Ingresos, costos y gastos del período (NIC 1). Calcula utilidad
          bruta, operativa, antes de impuestos y neta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="eer-fecha-inicio">Fecha inicio</Label>
            <Input
              id="eer-fecha-inicio"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              max={fechaFin || todayISO()}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="eer-fecha-fin">Fecha fin</Label>
            <Input
              id="eer-fecha-fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              max={todayISO()}
            />
          </div>
          <Button
            onClick={generar}
            disabled={loading || !fechaInicio || !fechaFin}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Generar EER
          </Button>
        </div>

        {data && (
          <>
            <div className="flex gap-3">
              <Button
                onClick={guardar}
                variant="outline"
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar reporte
              </Button>
              <Button
                onClick={descargarPDFEER}
                variant="outline"
                disabled={pdfLoading}
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Descargar PDF
              </Button>
            </div>

            <TablaSaldos
              lineas={data.ingresos}
              tituloTotal="Total Ingresos"
              total={data.totalIngresos}
              indent
            />
            <TablaSaldos
              lineas={data.costosVenta}
              tituloTotal="Total Costos de Venta"
              total={data.totalCostosVenta}
              indent
            />
            <ResultadoRow
              label="UTILIDAD BRUTA"
              valor={data.utilidadBruta}
            />
            <TablaSaldos
              lineas={data.gastosAdmin}
              tituloTotal="Total Gastos Administrativos"
              total={data.totalGastosAdmin}
              indent
            />
            <TablaSaldos
              lineas={data.costosProduccion}
              tituloTotal="Total Costos de Producción"
              total={data.totalCostosProduccion}
              indent
            />
            <ResultadoRow
              label="UTILIDAD OPERATIVA"
              valor={data.utilidadOperativa}
            />
            <TablaSaldos
              lineas={data.otrosIngresos}
              tituloTotal="Total Otros Ingresos"
              total={data.totalOtrosIngresos}
              indent
            />
            <TablaSaldos
              lineas={data.otrosGastos}
              tituloTotal="Total Otros Gastos"
              total={data.totalOtrosGastos}
              indent
            />
            <ResultadoRow
              label="UTILIDAD ANTES DE IMPUESTOS"
              valor={data.utilidadAntesImpuestos}
            />
            <ResultadoRow
              label="Impuesto de renta (33%)"
              valor={data.impuestoRenta}
              negativo
            />
            <ResultadoRow
              label="UTILIDAD NETA DEL PERÍODO"
              valor={data.utilidadNeta}
              destacado
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ResultadoRow({
  label,
  valor,
  destacado,
  negativo,
}: {
  label: string;
  valor: number;
  destacado?: boolean;
  negativo?: boolean;
}) {
  const isNeg = valor < 0;
  return (
    <div
      className={`flex justify-between items-center px-4 py-2 rounded-md ${
        destacado
          ? "bg-emerald-600 text-white"
          : negativo
            ? "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
            : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200"
      }`}
    >
      <span className={`text-sm ${destacado ? "font-bold uppercase tracking-wider" : "font-semibold"}`}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums text-sm ${destacado ? "text-lg font-bold" : "font-bold"} ${
          !destacado && isNeg ? "text-red-700 dark:text-red-300" : ""
        }`}
      >
        {fmtCOP(valor)}
      </span>
    </div>
  );
}

// ============================================================
// TAB: Estado de Cambios en el Patrimonio (ECP)
// ============================================================

function ECPTab() {
  const [fechaInicio, setFechaInicio] = useState(startOfYearISO());
  const [fechaFin, setFechaFin] = useState(todayISO());
  const [data, setData] = useState<ECPData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const generar = useCallback(async () => {
    if (!fechaInicio || !fechaFin) return;
    setLoading(true);
    setData(null);
    try {
      const r = await fetch(
        `/api/niif/ecp?fechaInicio=${encodeURIComponent(fechaInicio)}&fechaFin=${encodeURIComponent(fechaFin)}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error generando ECP");
      setData(d as ECPData);
      toast.success("Estado de Cambios en el Patrimonio generado", {
        description: `${fmtFecha(d.fechaInicio)} → ${fmtFecha(d.fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo generar el ECP", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin]);

  const guardar = useCallback(async () => {
    if (!data) return;
    try {
      await guardarReporte("ECP", "anual", fechaInicio, fechaFin, data);
      toast.success("Reporte guardado", {
        description: `ECP ${fmtFecha(fechaInicio)} → ${fmtFecha(fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo guardar", { description: e?.message });
    }
  }, [data, fechaInicio, fechaFin]);

  const descargarPDFECP = useCallback(async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      const r = await fetch("/api/niif/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "ECP",
          periodo: "anual",
          fechaInicio,
          fechaFin,
          json_data: data,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error guardando reporte");
      descargarPDF(d.id);
    } catch (e: any) {
      toast.error("No se pudo descargar el PDF", { description: e?.message });
    } finally {
      setPdfLoading(false);
    }
  }, [data, fechaInicio, fechaFin]);

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <Wallet className="w-5 h-5" />
          Estado de Cambios en el Patrimonio
        </CardTitle>
        <CardDescription>
          Movimientos del patrimonio del período: saldo inicial, aumentos,
          reducciones, dividendos y saldo final.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="ecp-fecha-inicio">Fecha inicio</Label>
            <Input
              id="ecp-fecha-inicio"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              max={fechaFin || todayISO()}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="ecp-fecha-fin">Fecha fin</Label>
            <Input
              id="ecp-fecha-fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              max={todayISO()}
            />
          </div>
          <Button
            onClick={generar}
            disabled={loading || !fechaInicio || !fechaFin}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Generar ECP
          </Button>
        </div>

        {data && (
          <>
            <div className="flex gap-3">
              <Button
                onClick={guardar}
                variant="outline"
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar reporte
              </Button>
              <Button
                onClick={descargarPDFECP}
                variant="outline"
                disabled={pdfLoading}
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Descargar PDF
              </Button>
            </div>

            <div className="space-y-3">
              {/* Saldo inicial */}
              <div className="rounded-md border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3 flex justify-between">
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  Saldo inicial del patrimonio
                </span>
                <span className="font-mono font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                  {fmtCOP(data.saldoInicialPatrimonio)}
                </span>
              </div>

              {/* Aumentos */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
                  Aumentos de patrimonio
                </h4>
                <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-neutral-50 dark:bg-neutral-900">
                        <TableHead className="w-32">Categoría</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.aumentos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="italic text-center text-neutral-400 text-xs py-3">
                            No se registran aumentos en el período.
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.aumentos.map((a, i) => (
                          <TableRow key={`a-${i}`}>
                            <TableCell className="text-xs uppercase">{a.categoria}</TableCell>
                            <TableCell className="text-sm">{a.concepto}</TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums text-emerald-700 dark:text-emerald-300">
                              +{fmtCOP(a.monto)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/20">
                        <TableCell colSpan={2} className="text-right font-semibold">
                          Utilidad neta del período
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          +{fmtCOP(data.utilidadNetaPeriodo)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Reducciones */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300 mb-1">
                  Reducciones de patrimonio
                </h4>
                <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-neutral-50 dark:bg-neutral-900">
                        <TableHead className="w-32">Categoría</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.reducciones.length === 0 && data.dividendos === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="italic text-center text-neutral-400 text-xs py-3">
                            No se registran reducciones en el período.
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {data.reducciones.map((r, i) => (
                            <TableRow key={`r-${i}`}>
                              <TableCell className="text-xs uppercase">{r.categoria}</TableCell>
                              <TableCell className="text-sm">{r.concepto}</TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums text-red-700 dark:text-red-300">
                                -{fmtCOP(r.monto)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {data.dividendos > 0 && (
                            <TableRow>
                              <TableCell className="text-xs uppercase">DIV</TableCell>
                              <TableCell className="text-sm">Dividendos pagados</TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums text-red-700 dark:text-red-300">
                                -{fmtCOP(data.dividendos)}
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Saldo final */}
              <div className="rounded-md bg-emerald-600 text-white px-4 py-3 flex justify-between items-center">
                <span className="text-sm font-bold uppercase tracking-wider">
                  Saldo final del patrimonio
                </span>
                <span className="font-mono font-bold tabular-nums text-lg">
                  {fmtCOP(data.saldoFinalPatrimonio)}
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// TAB: Estado de Flujos de Efectivo (EFE)
// ============================================================

function EFETab() {
  const [fechaInicio, setFechaInicio] = useState(startOfYearISO());
  const [fechaFin, setFechaFin] = useState(todayISO());
  const [data, setData] = useState<EFEData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const generar = useCallback(async () => {
    if (!fechaInicio || !fechaFin) return;
    setLoading(true);
    setData(null);
    try {
      const r = await fetch(
        `/api/niif/efe?fechaInicio=${encodeURIComponent(fechaInicio)}&fechaFin=${encodeURIComponent(fechaFin)}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error generando EFE");
      setData(d as EFEData);
      toast.success("Estado de Flujos de Efectivo generado", {
        description: `${fmtFecha(d.fechaInicio)} → ${fmtFecha(d.fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo generar el EFE", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin]);

  const guardar = useCallback(async () => {
    if (!data) return;
    try {
      await guardarReporte("EFE", "anual", fechaInicio, fechaFin, data);
      toast.success("Reporte guardado", {
        description: `EFE ${fmtFecha(fechaInicio)} → ${fmtFecha(fechaFin)}`,
      });
    } catch (e: any) {
      toast.error("No se pudo guardar", { description: e?.message });
    }
  }, [data, fechaInicio, fechaFin]);

  const descargarPDFEFE = useCallback(async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      const r = await fetch("/api/niif/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "EFE",
          periodo: "anual",
          fechaInicio,
          fechaFin,
          json_data: data,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error guardando reporte");
      descargarPDF(d.id);
    } catch (e: any) {
      toast.error("No se pudo descargar el PDF", { description: e?.message });
    } finally {
      setPdfLoading(false);
    }
  }, [data, fechaInicio, fechaFin]);

  const renderFlujos = (titulo: string, flujos: EFELine[], total: number, color: string) => (
    <div>
      <h4 className={`text-xs font-bold uppercase tracking-wider mb-1 ${color}`}>
        {titulo}
      </h4>
      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50 dark:bg-neutral-900">
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flujos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="italic text-center text-neutral-400 text-xs py-3">
                  Sin flujos para esta sección.
                </TableCell>
              </TableRow>
            ) : (
              flujos.map((f, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{f.concepto}</TableCell>
                  <TableCell className={`text-right font-mono text-sm tabular-nums ${f.monto >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                    {f.monto >= 0 ? "+" : ""}{fmtCOP(f.monto)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/20 font-semibold">
              <TableCell className="text-right">Subtotal {titulo.toLowerCase()}</TableCell>
              <TableCell className="text-right font-mono font-bold tabular-nums">
                {fmtCOP(total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <ArrowDownCircle className="w-5 h-5" />
          Estado de Flujos de Efectivo
        </CardTitle>
        <CardDescription>
          Método indirecto (NIC 7). Flujos de operación, inversión y
          financiación, con aumento neto y saldos inicial y final.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="efe-fecha-inicio">Fecha inicio</Label>
            <Input
              id="efe-fecha-inicio"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              max={fechaFin || todayISO()}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="efe-fecha-fin">Fecha fin</Label>
            <Input
              id="efe-fecha-fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              max={todayISO()}
            />
          </div>
          <Button
            onClick={generar}
            disabled={loading || !fechaInicio || !fechaFin}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Generar EFE
          </Button>
        </div>

        {data && (
          <>
            <div className="flex gap-3">
              <Button
                onClick={guardar}
                variant="outline"
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar reporte
              </Button>
              <Button
                onClick={descargarPDFEFE}
                variant="outline"
                disabled={pdfLoading}
                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                {pdfLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Descargar PDF
              </Button>
            </div>

            {renderFlujos(
              "Actividades de operación",
              data.flujosOperacion,
              data.totalOperacion,
              "text-emerald-700 dark:text-emerald-300",
            )}
            {renderFlujos(
              "Actividades de inversión",
              data.flujosInversion,
              data.totalInversion,
              "text-teal-700 dark:text-teal-300",
            )}
            {renderFlujos(
              "Actividades de financiación",
              data.flujosFinanciacion,
              data.totalFinanciacion,
              "text-amber-700 dark:text-amber-300",
            )}

            <div className="rounded-md border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
                Aumento neto del efectivo
              </span>
              <span className="font-mono font-bold tabular-nums text-lg text-emerald-800 dark:text-emerald-200">
                {fmtCOP(data.aumentoNetoEfectivo)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-neutral-100 dark:bg-neutral-900 px-4 py-3">
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                  Saldo inicial
                </div>
                <div className="font-mono font-bold tabular-nums">
                  {fmtCOP(data.saldoInicial)}
                </div>
              </div>
              <div className="rounded-md bg-emerald-600 text-white px-4 py-3">
                <div className="text-xs uppercase tracking-wider mb-1 opacity-90">
                  Saldo final
                </div>
                <div className="font-mono font-bold tabular-nums text-lg">
                  {fmtCOP(data.saldoFinal)}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// TAB: Reportes NIIF guardados
// ============================================================

function GuardadosTab() {
  const [items, setItems] = useState<ReporteGuardado[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [verJson, setVerJson] = useState<ReporteGuardado | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroTipo !== "todos") params.set("tipo", filtroTipo);
      const r = await fetch(`/api/niif/reportes?${params.toString()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error cargando reportes");
      setItems((d.items ?? []) as ReporteGuardado[]);
    } catch (e: any) {
      toast.error("No se pudieron cargar los reportes", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [filtroTipo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const eliminar = useCallback(
    async (id: string) => {
      if (!confirm("¿Eliminar este reporte NIIF?")) return;
      try {
        const r = await fetch(`/api/niif/reportes/${id}`, { method: "DELETE" });
        if (!r.ok) {
          const d = await r.json();
          throw new Error(d.error ?? "Error");
        }
        toast.success("Reporte eliminado");
        cargar();
      } catch (e: any) {
        toast.error("No se pudo eliminar", { description: e?.message });
      }
    },
    [cargar],
  );

  const descargar = (id: string) => descargarPDF(id);

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <FileBarChart className="w-5 h-5" />
          Reportes NIIF Guardados
        </CardTitle>
        <CardDescription>
          Histórico de reportes NIIF persistidos. Ver JSON, descargar PDF o
          eliminar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="filtro-tipo">Filtrar por tipo</Label>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger id="filtro-tipo">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ESF">ESF — Situación Financiera</SelectItem>
                <SelectItem value="EER">EER — Resultado Integral</SelectItem>
                <SelectItem value="ECP">ECP — Cambios Patrimonio</SelectItem>
                <SelectItem value="EFE">EFE — Flujos de Efectivo</SelectItem>
                <SelectItem value="Notas">Notas a los EE. FF.</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={cargar}
            variant="outline"
            disabled={loading}
            className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Recargar
          </Button>
        </div>

        {items.length === 0 ? (
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Sin reportes guardados</AlertTitle>
            <AlertDescription>
              Genera un estado financiero NIIF en las pestañas anteriores y
              pulsa <strong>Guardar reporte</strong> para verlo aquí.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                  <TableRow>
                    <TableHead className="w-32">Fecha</TableHead>
                    <TableHead className="w-20">Tipo</TableHead>
                    <TableHead className="w-28">Período</TableHead>
                    <TableHead>Rango fechas</TableHead>
                    <TableHead className="text-right">Registros</TableHead>
                    <TableHead className="text-right w-40">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs text-neutral-500">
                        {fmtFecha(it.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                        >
                          {it.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{it.periodo}</TableCell>
                      <TableCell className="text-xs text-neutral-500">
                        {fmtFecha(it.fechaInicio)} → {fmtFecha(it.fechaFin)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {it.totalRegistros ?? 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setVerJson(it)}
                            title="Ver JSON"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => descargar(it.id)}
                            title="Descargar PDF"
                            className="text-emerald-700 dark:text-emerald-300"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => eliminar(it.id)}
                            title="Eliminar"
                            className="text-red-700 dark:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>

      {/* Dialog Ver JSON */}
      <Dialog open={!!verJson} onOpenChange={(o) => !o && setVerJson(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Reporte {verJson?.tipo} — {verJson ? fmtFecha(verJson.createdAt) : ""}
            </DialogTitle>
            <DialogDescription>
              {verJson ? `Período ${verJson.periodo} · ${fmtFecha(verJson.fechaInicio)} → ${fmtFecha(verJson.fechaFin)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              {verJson
                ? JSON.stringify(verJson.json_data ?? {}, null, 2)
                : ""}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
