"use client";

// ============================================================
// ERP Marsella — Vista de Reportes PDF
// Reemplaza a Crystal Reports (Hermes §10.4).
//
// 9 cards de reportes disponibles. Cada card abre un Dialog con
// los inputs necesarios (selectores / fechas) y un botón
// "Generar PDF" que abre el endpoint en nueva pestaña.
//
// Backend:
//   GET /api/reportes/factura/[id]
//   GET /api/reportes/recibo/[id]
//   GET /api/reportes/egreso/[id]
//   GET /api/reportes/balance
//   GET /api/reportes/libro-diario?fechaInicio&fechaFin
//   GET /api/reportes/mayor?cuentaId&fechaInicio&fechaFin
//   GET /api/reportes/kardex?productoId&bodegaId&fechaInicio&fechaFin
//   GET /api/reportes/nomina/[id]
//   GET /api/reportes/ejecutivo
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  FileBarChart,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Scale,
  Boxes,
  UserCog,
  PieChart,
  Download,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Tipos ----------

interface FacturaItem {
  id: string;
  numero: string;
  nombreCliente: string;
  total: number;
  fecha: string;
  estado: string;
}

interface ReciboItem {
  id: string;
  numero: string;
  nombreTercero: string;
  valorTotal: number;
  fecha: string;
}

interface CuentaPuc {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  naturaleza: string;
  esMovimiento?: boolean;
}

interface ProductoItem {
  id: string;
  codigo: string;
  nombre: string;
}

interface BodegaItem {
  id: string;
  codigo: string;
  nombre: string;
}

interface NominaItem {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  periodoInicio: string;
  periodoFin: string;
  netoAPagar: number;
}

type ReportKey =
  | "factura"
  | "recibo"
  | "egreso"
  | "balance"
  | "libro-diario"
  | "mayor"
  | "kardex"
  | "nomina"
  | "ejecutivo";

// ---------- Helpers ----------

function descargar(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

// ---------- Componente principal ----------

export function ReportesView() {
  const [open, setOpen] = useState<ReportKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Listas
  const [facturas, setFacturas] = useState<FacturaItem[]>([]);
  const [recibos, setRecibos] = useState<ReciboItem[]>([]);
  const [egresos, setEgresos] = useState<ReciboItem[]>([]);
  const [cuentas, setCuentas] = useState<CuentaPuc[]>([]);
  const [productos, setProductos] = useState<ProductoItem[]>([]);
  const [bodegas, setBodegas] = useState<BodegaItem[]>([]);
  const [nominas, setNominas] = useState<NominaItem[]>([]);

  // Selecciones dentro del dialog activo
  const [selFacturaId, setSelFacturaId] = useState<string>("");
  const [selReciboId, setSelReciboId] = useState<string>("");
  const [selEgresoId, setSelEgresoId] = useState<string>("");
  const [selCuentaId, setSelCuentaId] = useState<string>("");
  const [selProductoId, setSelProductoId] = useState<string>("");
  const [selBodegaId, setSelBodegaId] = useState<string>("all");
  const [selNominaId, setSelNominaId] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [fechaFin, setFechaFin] = useState<string>("");

  // Cargar listas
  const cargarListas = useCallback(async () => {
    setLoading(true);
    try {
      const [
        fRes,
        rRes,
        eRes,
        cRes,
        pRes,
        bRes,
        nRes,
      ] = await Promise.all([
        fetch("/api/facturas?pageSize=200"),
        fetch("/api/cartera?tipo=recibo&pageSize=200"),
        fetch("/api/cartera?tipo=egreso&pageSize=200"),
        fetch("/api/contabilidad?op=cuentas"),
        fetch("/api/productos?pageSize=500"),
        fetch("/api/bodegas"),
        fetch("/api/nomina?pageSize=200"),
      ]);
      const fData = await fRes.json().catch(() => ({ items: [] }));
      const rData = await rRes.json().catch(() => ({ items: [] }));
      const eData = await eRes.json().catch(() => ({ items: [] }));
      const cData = await cRes.json().catch(() => []);
      const pData = await pRes.json().catch(() => ({ items: [] }));
      const bData = await bRes.json().catch(() => []);
      const nData = await nRes.json().catch(() => ({ items: [] }));
      setFacturas(fData.items ?? []);
      setRecibos(rData.items ?? []);
      setEgresos(eData.items ?? []);
      setCuentas(Array.isArray(cData) ? cData : (cData.items ?? []));
      setProductos(pData.items ?? []);
      setBodegas(Array.isArray(bData) ? bData : (bData.items ?? []));
      setNominas(nData.items ?? []);
    } catch (e: any) {
      console.error("[reportes] cargarListas", e);
      toast.error("Error al cargar las listas de reportes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarListas();
  }, [cargarListas]);

  // Reset selecciones al abrir un nuevo dialog
  const abrirDialog = (k: ReportKey) => {
    setSelFacturaId("");
    setSelReciboId("");
    setSelEgresoId("");
    setSelCuentaId("");
    setSelProductoId("");
    setSelBodegaId("all");
    setSelNominaId("");
    setFechaInicio("");
    setFechaFin("");
    setOpen(k);
  };

  const buildUrl = (base: string, params: Record<string, string> = {}): string => {
    const u = new URL(base, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "")
        u.searchParams.set(k, v);
    });
    return u.pathname + u.search;
  };

  const generar = async (k: ReportKey) => {
    setGenerating(true);
    try {
      switch (k) {
        case "factura": {
          if (!selFacturaId) {
            toast.error("Selecciona una factura");
            setGenerating(false);
            return;
          }
          descargar(buildUrl(`/api/reportes/factura/${selFacturaId}`));
          toast.success("Factura PDF abierta en nueva pestaña");
          break;
        }
        case "recibo": {
          if (!selReciboId) {
            toast.error("Selecciona un recibo");
            setGenerating(false);
            return;
          }
          descargar(buildUrl(`/api/reportes/recibo/${selReciboId}`));
          toast.success("Recibo de caja PDF abierto");
          break;
        }
        case "egreso": {
          if (!selEgresoId) {
            toast.error("Selecciona un egreso");
            setGenerating(false);
            return;
          }
          descargar(buildUrl(`/api/reportes/egreso/${selEgresoId}`));
          toast.success("Comprobante de egreso PDF abierto");
          break;
        }
        case "balance": {
          descargar(buildUrl(`/api/reportes/balance`));
          toast.success("Balance de prueba PDF abierto");
          break;
        }
        case "libro-diario": {
          descargar(
            buildUrl(`/api/reportes/libro-diario`, {
              fechaInicio,
              fechaFin,
            }),
          );
          toast.success("Libro diario PDF abierto");
          break;
        }
        case "mayor": {
          if (!selCuentaId) {
            toast.error("Selecciona una cuenta");
            setGenerating(false);
            return;
          }
          descargar(
            buildUrl(`/api/reportes/mayor`, {
              cuentaId: selCuentaId,
              fechaInicio,
              fechaFin,
            }),
          );
          toast.success("Libro mayor PDF abierto");
          break;
        }
        case "kardex": {
          if (!selProductoId) {
            toast.error("Selecciona un producto");
            setGenerating(false);
            return;
          }
          descargar(
            buildUrl(`/api/reportes/kardex`, {
              productoId: selProductoId,
              bodegaId: selBodegaId === "all" ? "" : selBodegaId,
              fechaInicio,
              fechaFin,
            }),
          );
          toast.success("Kardex PDF abierto");
          break;
        }
        case "nomina": {
          if (!selNominaId) {
            toast.error("Selecciona una nómina");
            setGenerating(false);
            return;
          }
          descargar(buildUrl(`/api/reportes/nomina/${selNominaId}`));
          toast.success("Nómina PDF abierta");
          break;
        }
        case "ejecutivo": {
          descargar(buildUrl(`/api/reportes/ejecutivo`));
          toast.success("Reporte ejecutivo PDF abierto");
          break;
        }
      }
      setOpen(null);
    } catch (e: any) {
      console.error("[reportes] generar", e);
      toast.error("Error al generar el PDF");
    } finally {
      setGenerating(false);
    }
  };

  const cards: {
    key: ReportKey;
    titulo: string;
    descripcion: string;
    icon: React.ElementType;
    color: string;
    inputs: string;
  }[] = [
    {
      key: "factura",
      titulo: "Factura de Venta Electrónica",
      descripcion:
        "Genera el PDF de la factura electrónica con CUFE, QR y todos los datos fiscales requeridos por la DIAN.",
      icon: FileText,
      color: "text-emerald-600 dark:text-emerald-400",
      inputs: "Selector de factura",
    },
    {
      key: "recibo",
      titulo: "Recibo de Caja",
      descripcion:
        "Comprobante de ingreso (CXC) con valor, concepto, forma de pago y firmas.",
      icon: ArrowDownToLine,
      color: "text-teal-600 dark:text-teal-400",
      inputs: "Selector de recibo",
    },
    {
      key: "egreso",
      titulo: "Comprobante de Egreso",
      descripcion:
        "Pago a proveedores y gastos (CXP) con valor, concepto y firmas.",
      icon: ArrowUpFromLine,
      color: "text-amber-600 dark:text-amber-400",
      inputs: "Selector de egreso",
    },
    {
      key: "balance",
      titulo: "Balance de Prueba",
      descripcion:
        "Lista todas las cuentas PUC con débitos, créditos y saldos, con totales generales y validación de cuadre.",
      icon: Scale,
      color: "text-emerald-600 dark:text-emerald-400",
      inputs: "Botón directo",
    },
    {
      key: "libro-diario",
      titulo: "Libro Diario",
      descripcion:
        "Lista de comprobantes contabilizados con sus movimientos en un rango de fechas.",
      icon: BookOpen,
      color: "text-teal-600 dark:text-teal-400",
      inputs: "Selector de rango de fechas",
    },
    {
      key: "mayor",
      titulo: "Libro Mayor",
      descripcion:
        "Mayor detallado de una cuenta con saldos acumulados en un rango de fechas.",
      icon: Layers,
      color: "text-emerald-600 dark:text-emerald-400",
      inputs: "Selector de cuenta + fechas",
    },
    {
      key: "kardex",
      titulo: "Kardex Valorizado",
      descripcion:
        "Movimientos de inventario de un producto en una bodega con entradas, salidas y saldo valorizado.",
      icon: Boxes,
      color: "text-teal-600 dark:text-teal-400",
      inputs: "Selector de producto + bodega + fechas",
    },
    {
      key: "nomina",
      titulo: "Nómina Electrónica",
      descripcion:
        "Detalle de nómina con devengos, deducciones, aportes patronales, provisiones y CUNE por empleado.",
      icon: UserCog,
      color: "text-emerald-600 dark:text-emerald-400",
      inputs: "Selector de nómina",
    },
    {
      key: "ejecutivo",
      titulo: "Reporte Ejecutivo",
      descripcion:
        "Dashboard ejecutivo en PDF: KPIs del mes, cartera por edades, top productos y stock crítico.",
      icon: PieChart,
      color: "text-teal-600 dark:text-teal-400",
      inputs: "Botón directo",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Reportes PDF
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Generación de reportes en PDF. Reemplaza a Crystal Reports (Hermes §10.4).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void cargarListas()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Actualizar listas
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          { label: "Facturas", value: facturas.length, color: "text-emerald-600" },
          { label: "Recibos", value: recibos.length, color: "text-teal-600" },
          { label: "Egresos", value: egresos.length, color: "text-amber-600" },
          { label: "Cuentas PUC", value: cuentas.length, color: "text-emerald-600" },
          { label: "Productos", value: productos.length, color: "text-teal-600" },
          { label: "Bodegas", value: bodegas.length, color: "text-emerald-600" },
          { label: "Nóminas", value: nominas.length, color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label} className="border-neutral-200 dark:border-neutral-800">
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                {s.label}
              </div>
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card
              key={c.key}
              className="border-neutral-200 dark:border-neutral-800 hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors cursor-pointer group"
            >
              <button
                onClick={() => abrirDialog(c.key)}
                className="text-left w-full h-full"
                aria-label={`Generar ${c.titulo}`}
              >
                <CardHeader className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 ${c.color}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <Download className="w-4 h-4 text-neutral-300 group-hover:text-emerald-500 transition-colors" />
                  </div>
                  <CardTitle className="text-base mt-2 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                    {c.titulo}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {c.descripcion}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <Badge variant="outline" className="text-[10px]">
                    {c.inputs}
                  </Badge>
                </CardContent>
              </button>
            </Card>
          );
        })}
      </div>

      {/* Alert informativo */}
      <Alert className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <AlertTitle className="text-emerald-800 dark:text-emerald-300">
          ¿Cómo funcionan los reportes?
        </AlertTitle>
        <AlertDescription className="text-emerald-700 dark:text-emerald-300/80 text-xs">
          Los PDFs se generan en el servidor con <code>@react-pdf/renderer</code> a
          partir de los datos del ERP. Cada reporte se abre en una nueva pestaña
          del navegador donde podrás visualizarlo, imprimirlo o descargarlo. Los
          reportes balance y ejecutivo no requieren selección: el botón directo
          genera con los datos actuales de tu empresa.
        </AlertDescription>
      </Alert>

      {/* ===== DIALOG FACTURA ===== */}
      <Dialog open={open === "factura"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Factura de Venta Electrónica
            </DialogTitle>
            <DialogDescription>
              Selecciona la factura para generar el PDF con CUFE y QR.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Factura</Label>
            <Select value={selFacturaId} onValueChange={setSelFacturaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una factura..." />
              </SelectTrigger>
              <SelectContent>
                {facturas.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No hay facturas
                  </SelectItem>
                )}
                {facturas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.numero} · {f.nombreCliente} · {formatCurrency(f.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selFacturaId && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {facturas.find((f) => f.id === selFacturaId)?.estado === "anulada" && (
                  <Badge variant="destructive" className="mr-2">
                    ANULADA
                  </Badge>
                )}
                Se abrirá el PDF en una nueva pestaña del navegador.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("factura")}
              disabled={!selFacturaId || generating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG RECIBO ===== */}
      <Dialog open={open === "recibo"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-teal-600" />
              Recibo de Caja
            </DialogTitle>
            <DialogDescription>
              Selecciona el recibo de caja a generar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Recibo</Label>
            <Select value={selReciboId} onValueChange={setSelReciboId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un recibo..." />
              </SelectTrigger>
              <SelectContent>
                {recibos.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No hay recibos
                  </SelectItem>
                )}
                {recibos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.numero} · {r.nombreTercero} · {formatCurrency(r.valorTotal)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("recibo")}
              disabled={!selReciboId || generating}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG EGRESO ===== */}
      <Dialog open={open === "egreso"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="w-5 h-5 text-amber-600" />
              Comprobante de Egreso
            </DialogTitle>
            <DialogDescription>
              Selecciona el comprobante de egreso a generar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Egreso</Label>
            <Select value={selEgresoId} onValueChange={setSelEgresoId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un egreso..." />
              </SelectTrigger>
              <SelectContent>
                {egresos.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No hay egresos
                  </SelectItem>
                )}
                {egresos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.numero} · {r.nombreTercero} · {formatCurrency(r.valorTotal)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("egreso")}
              disabled={!selEgresoId || generating}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG BALANCE ===== */}
      <Dialog open={open === "balance"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-600" />
              Balance de Prueba
            </DialogTitle>
            <DialogDescription>
              Genera el balance de prueba con todas las cuentas y sus saldos.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Generación directa</AlertTitle>
            <AlertDescription className="text-xs">
              Este reporte no requiere selección. Se generará con los saldos
              actuales (corte a la fecha de hoy) usando los comprobantes
              contabilizados.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("balance")}
              disabled={generating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG LIBRO DIARIO ===== */}
      <Dialog open={open === "libro-diario"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-teal-600" />
              Libro Diario
            </DialogTitle>
            <DialogDescription>
              Selecciona el rango de fechas para listar comprobantes contabilizados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Si dejas las fechas vacías, se listarán todos los comprobantes
            contabilizados.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("libro-diario")}
              disabled={generating}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG LIBRO MAYOR ===== */}
      <Dialog open={open === "mayor"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              Libro Mayor
            </DialogTitle>
            <DialogDescription>
              Selecciona una cuenta PUC y un rango de fechas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cuenta PUC</Label>
              <Select value={selCuentaId} onValueChange={setSelCuentaId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una cuenta..." />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.length === 0 && (
                    <SelectItem value="_none" disabled>
                      No hay cuentas
                    </SelectItem>
                  )}
                  {cuentas
                    .filter((c) => c.esMovimiento !== false)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.codigo} · {c.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              El saldo anterior se calcula con los movimientos previos a la fecha
              de inicio.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("mayor")}
              disabled={!selCuentaId || generating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG KARDEX ===== */}
      <Dialog open={open === "kardex"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-teal-600" />
              Kardex Valorizado
            </DialogTitle>
            <DialogDescription>
              Selecciona el producto, la bodega y el rango de fechas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Producto</Label>
              <Select value={selProductoId} onValueChange={setSelProductoId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un producto..." />
                </SelectTrigger>
                <SelectContent>
                  {productos.length === 0 && (
                    <SelectItem value="_none" disabled>
                      No hay productos
                    </SelectItem>
                  )}
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} · {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Bodega</Label>
              <Select value={selBodegaId} onValueChange={setSelBodegaId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas las bodegas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las bodegas</SelectItem>
                  {bodegas.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.codigo} · {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("kardex")}
              disabled={!selProductoId || generating}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG NÓMINA ===== */}
      <Dialog open={open === "nomina"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-emerald-600" />
              Nómina Electrónica
            </DialogTitle>
            <DialogDescription>
              Selecciona la nómina para generar el PDF con detalle por empleado y CUNE.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Nómina</Label>
            <Select value={selNominaId} onValueChange={setSelNominaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una nómina..." />
              </SelectTrigger>
              <SelectContent>
                {nominas.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No hay nóminas
                  </SelectItem>
                )}
                {nominas.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.numero} · {n.tipo} · {formatCurrency(n.netoAPagar)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("nomina")}
              disabled={!selNominaId || generating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG EJECUTIVO ===== */}
      <Dialog open={open === "ejecutivo"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-teal-600" />
              Reporte Ejecutivo
            </DialogTitle>
            <DialogDescription>
              Dashboard ejecutivo consolidado en PDF (KPIs, cartera por edades,
              top productos, stock crítico).
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Generación directa</AlertTitle>
            <AlertDescription className="text-xs">
              Este reporte se genera con los datos actuales de tu empresa
              (período en curso). Útil para imprimir y compartir con gerencia.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void generar("ejecutivo")}
              disabled={generating}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
