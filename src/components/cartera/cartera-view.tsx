"use client";

// ============================================================
// ERP Marsella — Vista de Cartera
// CXC (Por cobrar) | CXP (Por pagar) | Recibos de Caja | Comprobantes de Egreso
// ------------------------------------------------------------
// - Lista de terceros con saldoCartera > 0, segmentada por edades
//   (0-30 / 31-60 / 61-90 / +90 días) — datos simplificados.
// - Listado y creación de recibos de caja (CXC) y comprobantes
//   de egreso (CXP) con decremento automático del saldo del tercero.
// - Moneda COP, dark mode, acento emerald/teal, responsive.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ReceiptText,
  FileMinus,
  Plus,
  RefreshCw,
  Search,
  Save,
  Users,
  AlertCircle,
  HandCoins,
  Banknote,
  CreditCard,
  Landmark,
  CheckCircle2,
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

const fmtFecha = (iso: string | Date) => {
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
  apellido1?: string | null;
  nombreComercial?: string | null;
  numeroDocumento: string;
  tipo: string;
  saldoCartera?: number;
  cupoCredito?: number;
  diasPlazo?: number;
  ciudad?: { nombre?: string } | null;
}

interface ComprobanteBase {
  id: string;
  numero: string;
  fecha: string;
  valorTotal: number;
  concepto?: string | null;
  formaPago: string;
  observaciones?: string | null;
  terceroId?: string | null;
  nombreTercero: string;
  estado?: string;
}

type FormaPago = "efectivo" | "tarjeta" | "transferencia" | "cheque";

// ---------- Constantes de UI ----------
const FORMAS_PAGO: { value: FormaPago; label: string; icon: React.ReactNode }[] = [
  { value: "efectivo", label: "Efectivo", icon: <Banknote className="h-4 w-4" /> },
  { value: "tarjeta", label: "Tarjeta", icon: <CreditCard className="h-4 w-4" /> },
  { value: "transferencia", label: "Transferencia", icon: <Landmark className="h-4 w-4" /> },
  { value: "cheque", label: "Cheque", icon: <HandCoins className="h-4 w-4" /> },
];

const formaPagoLabel = (fp: string) =>
  FORMAS_PAGO.find((f) => f.value === fp)?.label ?? fp;

// ============================================================
// Componente principal
// ============================================================
export function CarteraView() {
  const [tab, setTab] = useState<string>("cxc");

  const [clientes, setClientes] = useState<Tercero[]>([]);
  const [proveedores, setProveedores] = useState<Tercero[]>([]);
  const [recibos, setRecibos] = useState<ComprobanteBase[]>([]);
  const [egresos, setEgresos] = useState<ComprobanteBase[]>([]);

  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingProveedores, setLoadingProveedores] = useState(false);
  const [loadingRecibos, setLoadingRecibos] = useState(false);
  const [loadingEgresos, setLoadingEgresos] = useState(false);

  // Estado del diálogo (compartido entre todos los tabs)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTipo, setDialogTipo] = useState<"recibo" | "egreso">("recibo");
  const [dialogTerceroPrefijado, setDialogTerceroPrefijado] =
    useState<Tercero | null>(null);

  // ---------- Carga de datos ----------
  const cargarClientes = useCallback(async () => {
    setLoadingClientes(true);
    try {
      const r = await fetch(
        "/api/terceros?tipo=cliente&pageSize=500",
        { cache: "no-store" },
      );
      const d = await r.json();
      const items: Tercero[] = d.items ?? [];
      setClientes(items);
    } catch {
      toast.error("No se pudo cargar la cartera de clientes");
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  const cargarProveedores = useCallback(async () => {
    setLoadingProveedores(true);
    try {
      const r = await fetch(
        "/api/terceros?tipo=proveedor&pageSize=500",
        { cache: "no-store" },
      );
      const d = await r.json();
      const items: Tercero[] = d.items ?? [];
      setProveedores(items);
    } catch {
      toast.error("No se pudo cargar la cartera de proveedores");
    } finally {
      setLoadingProveedores(false);
    }
  }, []);

  const cargarRecibos = useCallback(async () => {
    setLoadingRecibos(true);
    try {
      const r = await fetch("/api/cartera?tipo=recibo&pageSize=200", {
        cache: "no-store",
      });
      const d = await r.json();
      setRecibos(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar los recibos de caja");
    } finally {
      setLoadingRecibos(false);
    }
  }, []);

  const cargarEgresos = useCallback(async () => {
    setLoadingEgresos(true);
    try {
      const r = await fetch("/api/cartera?tipo=egreso&pageSize=200", {
        cache: "no-store",
      });
      const d = await r.json();
      setEgresos(d.items ?? []);
    } catch {
      toast.error("No se pudo cargar los comprobantes de egreso");
    } finally {
      setLoadingEgresos(false);
    }
  }, []);

  // Carga inicial (clientes para CXC, el tab por defecto)
  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  // Cambio de tab — carga diferida
  const onTabChange = (value: string) => {
    setTab(value);
    if (value === "cxp" && proveedores.length === 0) cargarProveedores();
    if (value === "recibos") cargarRecibos();
    if (value === "egresos") cargarEgresos();
  };

  // ---------- Diálogo ----------
  const abrirDialog = (
    tipo: "recibo" | "egreso",
    terceroPrefijado: Tercero | null = null,
  ) => {
    setDialogTipo(tipo);
    setDialogTerceroPrefijado(terceroPrefijado);
    setDialogOpen(true);
  };

  const onSaved = (tipo: "recibo" | "egreso") => {
    if (tipo === "recibo") {
      cargarRecibos();
      cargarClientes();
    } else {
      cargarEgresos();
      cargarProveedores();
    }
  };

  // ---------- Resumen superior (KPIs) ----------
  const resumen = useMemo(() => {
    const cxc = clientes.reduce(
      (acc, t) => acc + (t.saldoCartera ?? 0),
      0,
    );
    const cxp = proveedores.reduce(
      (acc, t) => acc + (t.saldoCartera ?? 0),
      0,
    );
    const totalRecibos = recibos.reduce(
      (acc, r) => acc + (r.valorTotal ?? 0),
      0,
    );
    const totalEgresos = egresos.reduce(
      (acc, e) => acc + (e.valorTotal ?? 0),
      0,
    );
    return { cxc, cxp, totalRecibos, totalEgresos };
  }, [clientes, proveedores, recibos, egresos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
              Cartera
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Cuentas por cobrar, por pagar, recibos de caja y comprobantes de
              egreso
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cargarClientes();
              cargarProveedores();
              cargarRecibos();
              cargarEgresos();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Por cobrar (CXC)"
          value={resumen.cxc}
          icon={<ArrowDownToLine className="h-4 w-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Por pagar (CXP)"
          value={resumen.cxp}
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          tone="teal"
        />
        <KpiCard
          label="Recibos de caja"
          value={resumen.totalRecibos}
          icon={<ReceiptText className="h-4 w-4" />}
          tone="emerald"
          sub={`${recibos.length} comprobantes`}
        />
        <KpiCard
          label="Comprobantes de egreso"
          value={resumen.totalEgresos}
          icon={<FileMinus className="h-4 w-4" />}
          tone="teal"
          sub={`${egresos.length} comprobantes`}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={onTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="cxc" className="gap-1.5">
            <ArrowDownToLine className="h-4 w-4" />
            <span className="hidden sm:inline">Por cobrar</span>
            <span className="sm:hidden">CXC</span>
          </TabsTrigger>
          <TabsTrigger value="cxp" className="gap-1.5">
            <ArrowUpFromLine className="h-4 w-4" />
            <span className="hidden sm:inline">Por pagar</span>
            <span className="sm:hidden">CXP</span>
          </TabsTrigger>
          <TabsTrigger value="recibos" className="gap-1.5">
            <ReceiptText className="h-4 w-4" />
            <span className="hidden sm:inline">Recibos de caja</span>
            <span className="sm:hidden">Recibos</span>
          </TabsTrigger>
          <TabsTrigger value="egresos" className="gap-1.5">
            <FileMinus className="h-4 w-4" />
            <span className="hidden sm:inline">Egresos</span>
            <span className="sm:hidden">Egresos</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cxc" className="mt-4">
          <AgingCartera
            terceros={clientes}
            loading={loadingClientes}
            tipo="cliente"
            onRecibir={(t) => abrirDialog("recibo", t)}
            onNuevo={() => abrirDialog("recibo", null)}
          />
        </TabsContent>

        <TabsContent value="cxp" className="mt-4">
          <AgingCartera
            terceros={proveedores}
            loading={loadingProveedores}
            tipo="proveedor"
            onRecibir={(t) => abrirDialog("egreso", t)}
            onNuevo={() => abrirDialog("egreso", null)}
          />
        </TabsContent>

        <TabsContent value="recibos" className="mt-4">
          <ListaComprobantes
            items={recibos}
            loading={loadingRecibos}
            prefijo="RC"
            titulo="Recibos de caja"
            descripcion="Comprobantes de ingreso (recaudo de cartera a clientes)"
            onNuevo={() => abrirDialog("recibo", null)}
            onReload={cargarRecibos}
            icon={<ReceiptText className="h-5 w-5" />}
          />
        </TabsContent>

        <TabsContent value="egresos" className="mt-4">
          <ListaComprobantes
            items={egresos}
            loading={loadingEgresos}
            prefijo="CE"
            titulo="Comprobantes de egreso"
            descripcion="Pagos a proveedores y salidas de efectivo"
            onNuevo={() => abrirDialog("egreso", null)}
            onReload={cargarEgresos}
            icon={<FileMinus className="h-5 w-5" />}
          />
        </TabsContent>
      </Tabs>

      {/* Diálogo compartido */}
      <DialogMovimiento
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setDialogTerceroPrefijado(null);
        }}
        tipo={dialogTipo}
        terceroTipo={dialogTipo === "recibo" ? "cliente" : "proveedor"}
        terceroPrefijado={dialogTerceroPrefijado}
        tercerosCache={dialogTipo === "recibo" ? clientes : proveedores}
        onTercerosLoaded={
          dialogTipo === "recibo" ? cargarClientes : cargarProveedores
        }
        onSaved={onSaved}
      />
    </div>
  );
}

// ============================================================
// KPI Card
// ============================================================
function KpiCard({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "emerald" | "teal";
  sub?: string;
}) {
  const toneCls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300";
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {label}
            </p>
            <p className="mt-1 truncate text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {fmtCOP(value)}
            </p>
            {sub ? (
              <p className="mt-0.5 truncate text-xs text-neutral-400 dark:text-neutral-500">
                {sub}
              </p>
            ) : null}
          </div>
          <div className={`rounded-lg p-2 ${toneCls}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tabla de cartera con aging por edades
// ============================================================
function AgingCartera({
  terceros,
  loading,
  tipo,
  onRecibir,
  onNuevo,
}: {
  terceros: Tercero[];
  loading: boolean;
  tipo: "cliente" | "proveedor";
  onRecibir: (t: Tercero) => void;
  onNuevo: () => void;
}) {
  const [q, setQ] = useState("");

  // Filtrado: solo terceros con saldoCartera > 0
  const rows = useMemo(() => {
    return terceros
      .filter((t) => (t.saldoCartera ?? 0) > 0)
      .filter((t) => {
        if (!q.trim()) return true;
        const s = q.toLowerCase();
        const nombre = `${t.nombre} ${t.apellido1 ?? ""}`.toLowerCase();
        return (
          nombre.includes(s) ||
          (t.nombreComercial ?? "").toLowerCase().includes(s) ||
          t.numeroDocumento.toLowerCase().includes(s)
        );
      })
      .sort((a, b) => (b.saldoCartera ?? 0) - (a.saldoCartera ?? 0));
  }, [terceros, q]);

  // Aging simplificado: asumimos todo en rango 0-30
  const totales = useMemo(() => {
    return rows.reduce(
      (acc, t) => {
        const s = t.saldoCartera ?? 0;
        acc.r0_30 += s;
        acc.total += s;
        return acc;
      },
      { r0_30: 0, r31_60: 0, r61_90: 0, r_mas_90: 0, total: 0 },
    );
  }, [rows]);

  const titulo = tipo === "cliente" ? "Cartera por cobrar (CXC)" : "Cartera por pagar (CXP)";
  const desc =
    tipo === "cliente"
      ? "Clientes con saldo pendiente"
      : "Proveedores con saldo pendiente";
  const accionLabel =
    tipo === "cliente" ? "Recibir pago" : "Pagar a proveedor";
  const nuevoLabel = tipo === "cliente" ? "Nuevo recibo de caja" : "Nuevo egreso";
  const accionIcon =
    tipo === "cliente" ? (
      <ArrowDownToLine className="h-4 w-4" />
    ) : (
      <ArrowUpFromLine className="h-4 w-4" />
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              {titulo}
            </CardTitle>
            <CardDescription>{desc}</CardDescription>
          </div>
          <Button
            onClick={onNuevo}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
            size="sm"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {nuevoLabel}
          </Button>
        </div>

        {/* Aviso de datos simplificados */}
        <Alert className="mt-2 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-xs font-semibold">
            Datos simplificados
          </AlertTitle>
          <AlertDescription className="text-xs">
            El aging por edades se muestra en el rango <strong>0-30 días</strong>{" "}
            utilizando el <code>saldoCartera</code> del tercero. La segmentación
            detallada por fecha de vencimiento de facturas se habilitará cuando
            se implemente el cálculo por documento.
          </AlertDescription>
        </Alert>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Buscador */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, NIT o nombre comercial…"
              className="pl-8"
            />
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {rows.length}{" "}
            {rows.length === 1 ? "tercero" : "terceros"}
          </Badge>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[200px]">Tercero</TableHead>
                  <TableHead className="min-w-[120px]">NIT / C.C.</TableHead>
                  <TableHead className="text-right">Saldo total</TableHead>
                  <TableHead className="text-right">0-30 días</TableHead>
                  <TableHead className="text-right">31-60 días</TableHead>
                  <TableHead className="text-right">61-90 días</TableHead>
                  <TableHead className="text-right">+90 días</TableHead>
                  <TableHead className="w-[120px] text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center">
                      <div className="flex flex-col items-center gap-2 text-neutral-400">
                        <Users className="h-8 w-8 opacity-50" />
                        <p className="text-sm">
                          No hay {tipo === "cliente" ? "clientes" : "proveedores"}{" "}
                          con saldo pendiente.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((t) => {
                    const s = t.saldoCartera ?? 0;
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                              {t.nombre}
                              {t.apellido1 ? ` ${t.apellido1}` : ""}
                            </span>
                            {t.nombreComercial ? (
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                {t.nombreComercial}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-neutral-600 dark:text-neutral-300">
                          {t.numeroDocumento}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-neutral-900 dark:text-neutral-100">
                          {fmtCOP(s)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-700 dark:text-emerald-300">
                          {fmtCOP(s)}
                        </TableCell>
                        <TableCell className="text-right text-neutral-400">
                          {fmtCOP(0)}
                        </TableCell>
                        <TableCell className="text-right text-neutral-400">
                          {fmtCOP(0)}
                        </TableCell>
                        <TableCell className="text-right text-neutral-400">
                          {fmtCOP(0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRecibir(t)}
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          >
                            {accionIcon}
                            <span className="ml-1 hidden sm:inline">
                              {accionLabel}
                            </span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              <TableFooter className="sticky bottom-0 bg-emerald-50/60 dark:bg-emerald-950/20">
                <TableRow className="border-t border-emerald-200 font-semibold dark:border-emerald-900/50">
                  <TableCell colSpan={2}>Total general</TableCell>
                  <TableCell className="text-right text-emerald-800 dark:text-emerald-200">
                    {fmtCOP(totales.total)}
                  </TableCell>
                  <TableCell className="text-right text-emerald-800 dark:text-emerald-200">
                    {fmtCOP(totales.r0_30)}
                  </TableCell>
                  <TableCell className="text-right text-neutral-400">
                    {fmtCOP(totales.r31_60)}
                  </TableCell>
                  <TableCell className="text-right text-neutral-400">
                    {fmtCOP(totales.r61_90)}
                  </TableCell>
                  <TableCell className="text-right text-neutral-400">
                    {fmtCOP(totales.r_mas_90)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Lista de comprobantes (recibos o egresos)
// ============================================================
function ListaComprobantes({
  items,
  loading,
  prefijo,
  titulo,
  descripcion,
  onNuevo,
  onReload,
  icon,
}: {
  items: ComprobanteBase[];
  loading: boolean;
  prefijo: "RC" | "CE";
  titulo: string;
  descripcion: string;
  onNuevo: () => void;
  onReload: () => void;
  icon: React.ReactNode;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(
      (r) =>
        r.numero.toLowerCase().includes(s) ||
        (r.nombreTercero ?? "").toLowerCase().includes(s) ||
        (r.concepto ?? "").toLowerCase().includes(s) ||
        (r.formaPago ?? "").toLowerCase().includes(s),
    );
  }, [items, q]);

  const total = useMemo(
    () => filtered.reduce((acc, r) => acc + (r.valorTotal ?? 0), 0),
    [filtered],
  );

  const accentCls =
    prefijo === "RC"
      ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
      : "bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600";
  const iconCls =
    prefijo === "RC"
      ? "text-emerald-600 dark:text-emerald-300"
      : "text-teal-600 dark:text-teal-300";
  const nuevoLabel = prefijo === "RC" ? "Nuevo recibo" : "Nuevo egreso";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg bg-neutral-100 p-2 dark:bg-neutral-800 ${iconCls}`}>
              {icon}
            </div>
            <div>
              <CardTitle>{titulo}</CardTitle>
              <CardDescription>{descripcion}</CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onReload}
              disabled={loading}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refrescar
            </Button>
            <Button size="sm" onClick={onNuevo} className={accentCls}>
              <Plus className="mr-1.5 h-4 w-4" />
              {nuevoLabel}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Buscador */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por número, tercero, concepto o forma de pago…"
              className="pl-8"
            />
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {filtered.length} registros
          </Badge>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[150px]">Número</TableHead>
                  <TableHead className="min-w-[110px]">Fecha</TableHead>
                  <TableHead className="min-w-[200px]">Tercero</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="min-w-[200px]">Concepto</TableHead>
                  <TableHead className="min-w-[120px]">Forma de pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center">
                      <div className="flex flex-col items-center gap-2 text-neutral-400">
                        <ReceiptText className="h-8 w-8 opacity-50" />
                        <p className="text-sm">
                          No hay {prefijo === "RC" ? "recibos de caja" : "comprobantes de egreso"}{" "}
                          registrados.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          {r.numero}
                        </span>
                        {r.estado && r.estado !== "vigente" ? (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            {r.estado}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600 dark:text-neutral-300">
                        {fmtFecha(r.fecha)}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {r.nombreTercero || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-neutral-900 dark:text-neutral-100">
                        {fmtCOP(r.valorTotal)}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-sm text-neutral-600 dark:text-neutral-300">
                        {r.concepto || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="capitalize"
                        >
                          {formaPagoLabel(r.formaPago)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="sticky bottom-0 bg-emerald-50/60 dark:bg-emerald-950/20">
                <TableRow className="border-t border-emerald-200 font-semibold dark:border-emerald-900/50">
                  <TableCell colSpan={3}>
                    Total ({filtered.length}{" "}
                    {filtered.length === 1 ? "registro" : "registros"})
                  </TableCell>
                  <TableCell className="text-right text-emerald-800 dark:text-emerald-200">
                    {fmtCOP(total)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Diálogo de creación (recibo o egreso)
// ============================================================
function DialogMovimiento({
  open,
  onOpenChange,
  tipo,
  terceroTipo,
  terceroPrefijado,
  tercerosCache,
  onTercerosLoaded,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipo: "recibo" | "egreso";
  terceroTipo: "cliente" | "proveedor";
  terceroPrefijado: Tercero | null;
  tercerosCache: Tercero[];
  onTercerosLoaded: () => void;
  onSaved: (tipo: "recibo" | "egreso") => void;
}) {
  const [terceros, setTerceros] = useState<Tercero[]>(tercerosCache);
  const [loadingTerceros, setLoadingTerceros] = useState(false);
  const [q, setQ] = useState("");

  const [terceroSel, setTerceroSel] = useState<Tercero | null>(terceroPrefijado);
  const [valorStr, setValorStr] = useState("");
  const [concepto, setConcepto] = useState("");
  const [formaPago, setFormaPago] = useState<FormaPago>("efectivo");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincronizar lista de terceros cuando se abre
  useEffect(() => {
    if (!open) return;
    if (tercerosCache.length > 0) {
      setTerceros(tercerosCache);
      return;
    }
    let cancelled = false;
    setLoadingTerceros(true);
    (async () => {
      try {
        const r = await fetch(
          `/api/terceros?tipo=${terceroTipo}&pageSize=500`,
          { cache: "no-store" },
        );
        const d = await r.json();
        if (!cancelled) {
          setTerceros(d.items ?? []);
          onTercerosLoaded();
        }
      } catch {
        if (!cancelled) toast.error("No se pudo cargar la lista de terceros");
      } finally {
        if (!cancelled) setLoadingTerceros(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, terceroTipo, tercerosCache, onTercerosLoaded]);

  // Reset/Sincronizar tercero preseleccionado
  useEffect(() => {
    if (open) {
      setTerceroSel(terceroPrefijado);
      setValorStr("");
      setConcepto("");
      setFormaPago("efectivo");
      setObservaciones("");
      setQ("");
    }
  }, [open, terceroPrefijado]);

  // Terceros filtrados por búsqueda
  const filteredTerceros = useMemo(() => {
    const base = terceros;
    if (!q.trim()) return base;
    const s = q.toLowerCase();
    return base.filter((t) => {
      const nombre = `${t.nombre} ${t.apellido1 ?? ""}`.toLowerCase();
      return (
        nombre.includes(s) ||
        (t.nombreComercial ?? "").toLowerCase().includes(s) ||
        t.numeroDocumento.toLowerCase().includes(s)
      );
    });
  }, [terceros, q]);

  const valorNum = useMemo(() => {
    const n = parseFloat(valorStr.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, [valorStr]);

  // Saldo actual del tercero seleccionado (para mostrar en el formulario)
  const saldoTercero = terceroSel?.saldoCartera ?? 0;
  const excedeSaldo =
    terceroSel && valorNum > 0 && valorNum > saldoTercero + 0.01;

  const isValid =
    !!terceroSel && valorNum > 0 && !excedeSaldo && !saving;

  const tituloDialog =
    tipo === "recibo" ? "Nuevo recibo de caja" : "Nuevo comprobante de egreso";
  const descDialog =
    tipo === "recibo"
      ? "Recaudo de cartera a un cliente. El saldo del tercero se disminuirá automáticamente."
      : "Pago a un proveedor o salida de efectivo. El saldo del tercero se disminuirá automáticamente.";
  const labelTercero = terceroTipo === "cliente" ? "Cliente" : "Proveedor";
  const accentBtn =
    tipo === "recibo"
      ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
      : "bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600";

  const handleGuardar = async () => {
    if (!terceroSel) {
      toast.error("Seleccione un tercero");
      return;
    }
    if (valorNum <= 0) {
      toast.error("El valor debe ser mayor a cero");
      return;
    }
    if (excedeSaldo) {
      toast.error(
        `El valor excede el saldo actual del tercero (${fmtCOP(saldoTercero)})`,
      );
      return;
    }
    setSaving(true);
    try {
      const body = {
        tipo,
        terceroId: terceroSel.id,
        nombreTercero:
          `${terceroSel.nombre}${terceroSel.apellido1 ? " " + terceroSel.apellido1 : ""}`.trim(),
        valorTotal: valorNum,
        concepto: concepto.trim() || undefined,
        formaPago,
        observaciones: observaciones.trim() || undefined,
      };
      const r = await fetch("/api/cartera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d?.error || "Error al guardar el comprobante");
      }
      toast.success(
        `${tipo === "recibo" ? "Recibo de caja" : "Comprobante de egreso"} creado: ${d.numero}`,
      );
      onSaved(tipo);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar el comprobante");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            {tipo === "recibo" ? (
              <ReceiptText className="h-5 w-5" />
            ) : (
              <FileMinus className="h-5 w-5" />
            )}
            {tituloDialog}
          </DialogTitle>
          <DialogDescription>{descDialog}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector de tercero */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {labelTercero} <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Buscar ${labelTercero.toLowerCase()} por nombre o NIT…`}
                className="pl-8"
                disabled={!!terceroSel}
              />
              {terceroSel ? (
                <button
                  type="button"
                  onClick={() => {
                    setTerceroSel(null);
                    setQ("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  ✕
                </button>
              ) : null}
            </div>

            {/* Lista seleccionable */}
            {!terceroSel ? (
              <div className="max-h-56 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                {loadingTerceros ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="border-b border-neutral-100 p-2 dark:border-neutral-800">
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ))
                ) : filteredTerceros.length === 0 ? (
                  <div className="p-4 text-center text-sm text-neutral-400">
                    No se encontraron terceros
                  </div>
                ) : (
                  filteredTerceros.slice(0, 50).map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setTerceroSel(t)}
                      className="flex w-full items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2 text-left text-sm transition hover:bg-emerald-50 dark:border-neutral-800 dark:hover:bg-emerald-950/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                          {t.nombre}
                          {t.apellido1 ? ` ${t.apellido1}` : ""}
                        </div>
                        <div className="truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">
                          {t.numeroDocumento}
                          {t.nombreComercial ? ` · ${t.nombreComercial}` : ""}
                        </div>
                      </div>
                      {t.saldoCartera && t.saldoCartera > 0 ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          Saldo: {fmtCOP(t.saldoCartera)}
                        </Badge>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                      {terceroSel.nombre}
                      {terceroSel.apellido1 ? ` ${terceroSel.apellido1}` : ""}
                    </div>
                    <div className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {terceroSel.numeroDocumento}
                    </div>
                  </div>
                  <Badge className="shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                    Saldo: {fmtCOP(saldoTercero)}
                  </Badge>
                </div>
              </div>
            )}
          </div>

          {/* Valor */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="val" className="text-sm font-medium">
                Valor total <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                  $
                </span>
                <Input
                  id="val"
                  inputMode="decimal"
                  value={valorStr}
                  onChange={(e) => setValorStr(e.target.value)}
                  placeholder="0"
                  className="pl-6"
                />
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {valorNum > 0 ? fmtCOP(valorNum) : "Ingrese el valor en COP"}
              </p>
              {excedeSaldo ? (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  ⚠ El valor excede el saldo actual ({fmtCOP(saldoTercero)}).
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fp" className="text-sm font-medium">
                Forma de pago
              </Label>
              <Select
                value={formaPago}
                onValueChange={(v) => setFormaPago(v as FormaPago)}
              >
                <SelectTrigger id="fp">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <div className="flex items-center gap-2">
                        {f.icon}
                        <span>{f.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Concepto */}
          <div className="space-y-2">
            <Label htmlFor="cp" className="text-sm font-medium">
              Concepto
            </Label>
            <Input
              id="cp"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder={
                tipo === "recibo"
                  ? "Ej: Pago factura FAC-2026-000123"
                  : "Ej: Pago factura de compra FC-2026-000045"
              }
            />
          </div>

          {/* Observaciones */}
          <div className="space-y-2">
            <Label htmlFor="obs" className="text-sm font-medium">
              Observaciones
            </Label>
            <Textarea
              id="obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas internas (opcional)"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGuardar}
            disabled={!isValid}
            className={accentBtn}
          >
            {saving ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar
          </Button>
        </DialogFooter>

        {/* Resumen visual cuando es válido */}
        {isValid ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Se {tipo === "recibo" ? "recaudarán" : "pagarán"}{" "}
              <strong>{fmtCOP(valorNum)}</strong> a{" "}
              <strong>
                {terceroSel?.nombre}
                {terceroSel?.apellido1 ? ` ${terceroSel.apellido1}` : ""}
              </strong>{" "}
              vía <strong>{formaPagoLabel(formaPago)}</strong>. El saldo del
              tercero se actualizará automáticamente.
            </span>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
