"use client";

// ============================================================
// ERP Marsella — Vista de Inventarios Multibodega
// Pestañas: Bodegas | Saldos por bodega | Kardex
// Acento: emerald/teal · Dark mode · Responsive
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  Building2,
  FileText,
  Hash,
  History,
  Layers,
  MapPin,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- Types ----------
interface ProductoLite {
  id: string;
  codigo: string;
  nombre: string;
  inventariable?: boolean;
}

interface BodegaLite {
  id: string;
  codigo: string;
  nombre: string;
  direccion?: string | null;
  activa?: boolean;
  createdAt?: string;
  productosCount?: number;
  cantidadTotal?: number;
  valorTotal?: number;
}

interface SaldoRow {
  id: string;
  cantidad: number;
  costoTotal: number;
  costoPromedio: number;
  stockMinimo: number;
  producto: { id: string; codigo: string; nombre: string };
  bodega: { id: string; codigo: string; nombre: string };
}

interface KardexRow {
  id: string;
  tipo: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  fecha: string;
  documentoTipo?: string | null;
  documentoId?: string | null;
  saldoCantidad: number;
  saldoValor: number;
}

// ---------- Helpers ----------
const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
});
const numFormatter = new Intl.NumberFormat("es-CO");

const fmtCOP = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : copFormatter.format(n);
const fmtNum = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n)
    ? "—"
    : numFormatter.format(
        Number.isInteger(n) ? n : Number(n.toFixed(digits)),
      );
const fmtFecha = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || "Error en la petición");
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Error en la petición");
  }
  return data as T;
}

const tipoMovStyles: Record<
  string,
  { label: string; className: string; sign: (n: number) => string }
> = {
  entrada: {
    label: "Entrada",
    className:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
    sign: (n) => `+${numFormatter.format(n)}`,
  },
  salida: {
    label: "Salida",
    className:
      "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
    sign: (n) => `-${numFormatter.format(Math.abs(n))}`,
  },
  ajuste: {
    label: "Ajuste",
    className:
      "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    sign: (n) => (n >= 0 ? `+${numFormatter.format(n)}` : numFormatter.format(n)),
  },
  traslado: {
    label: "Traslado",
    className:
      "border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    sign: (n) => (n >= 0 ? `+${numFormatter.format(n)}` : numFormatter.format(n)),
  },
};

function tipoBadge(tipo: string) {
  const s = tipoMovStyles[tipo] ?? {
    label: tipo || "—",
    className:
      "border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    sign: (n: number) => numFormatter.format(n),
  };
  return s;
}

// ============================================================
// Componente principal
// ============================================================
export function InventarioView() {
  const [tab, setTab] = useState<"bodegas" | "saldos" | "kardex">("bodegas");

  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [bodegas, setBodegas] = useState<BodegaLite[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [loadingSaldos, setLoadingSaldos] = useState(false);
  const [saldosLoaded, setSaldosLoaded] = useState(false);
  const [filtroSaldos, setFiltroSaldos] = useState("");
  const [ajusteOpen, setAjusteOpen] = useState(false);

  const [kardex, setKardex] = useState<KardexRow[]>([]);
  const [loadingKardex, setLoadingKardex] = useState(false);
  const [kardexConsultado, setKardexConsultado] = useState(false);
  const [kProductoId, setKProductoId] = useState<string>("");
  const [kBodegaId, setKBodegaId] = useState<string>("__all__");
  const [kDesde, setKDesde] = useState<string>("");
  const [kHasta, setKHasta] = useState<string>("");

  const [bodegaOpen, setBodegaOpen] = useState(false);
  const [loadingBodegas, setLoadingBodegas] = useState(false);

  // ---------- Carga inicial ----------
  const cargarMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [prodRes, bodRes] = await Promise.all([
        apiGet<{
          items: Array<ProductoLite & { inventariable?: boolean }>;
        }>("/api/productos?pageSize=500"),
        apiGet<BodegaLite[]>("/api/bodegas"),
      ]);
      setProductos(
        (prodRes.items ?? []).filter((p) => p.inventariable !== false),
      );
      setBodegas(bodRes ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al cargar datos";
      toast.error(msg);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    cargarMeta();
  }, [cargarMeta]);

  const cargarBodegas = useCallback(async () => {
    setLoadingBodegas(true);
    try {
      const data = await apiGet<BodegaLite[]>("/api/bodegas");
      setBodegas(data ?? []);
    } catch {
      /* ya notificado en meta */
    } finally {
      setLoadingBodegas(false);
    }
  }, []);

  const cargarSaldos = useCallback(async () => {
    setLoadingSaldos(true);
    try {
      const data = await apiGet<SaldoRow[]>("/api/inventario?op=saldos");
      setSaldos(data ?? []);
      setSaldosLoaded(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al cargar saldos";
      toast.error(msg);
    } finally {
      setLoadingSaldos(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "saldos" && !saldosLoaded) {
      cargarSaldos();
    }
  }, [tab, saldosLoaded, cargarSaldos]);

  // ---------- Filtros de saldos ----------
  const saldosFiltrados = useMemo(() => {
    const q = filtroSaldos.trim().toLowerCase();
    if (!q) return saldos;
    return saldos.filter((s) => {
      const haystack = `${s.producto.codigo} ${s.producto.nombre} ${s.bodega.codigo} ${s.bodega.nombre}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [saldos, filtroSaldos]);

  // Totales
  const totalValorSaldos = useMemo(
    () => saldos.reduce((a, s) => a + (s.costoTotal ?? 0), 0),
    [saldos],
  );
  const totalUnidadesSaldos = useMemo(
    () => saldos.reduce((a, s) => a + (s.cantidad ?? 0), 0),
    [saldos],
  );

  // ---------- Consultar Kardex ----------
  const consultarKardex = useCallback(async () => {
    setLoadingKardex(true);
    setKardexConsultado(true);
    try {
      const params = new URLSearchParams();
      params.set("op", "kardex");
      if (kProductoId) params.set("productoId", kProductoId);
      if (kBodegaId && kBodegaId !== "__all__")
        params.set("bodegaId", kBodegaId);
      if (kDesde) params.set("fechaInicio", kDesde);
      if (kHasta) params.set("fechaFin", `${kHasta}T23:59:59`);
      const url = `/api/inventario?${params.toString()}`;
      const data = await apiGet<KardexRow[]>(url);
      setKardex(data ?? []);
      toast.success(`${(data ?? []).length} movimiento(s) encontrado(s)`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al consultar kardex";
      toast.error(msg);
      setKardex([]);
    } finally {
      setLoadingKardex(false);
    }
  }, [kProductoId, kBodegaId, kDesde, kHasta]);

  // ---------- Crear bodega ----------
  const [nbCodigo, setNbCodigo] = useState("");
  const [nbNombre, setNbNombre] = useState("");
  const [nbDireccion, setNbDireccion] = useState("");
  const [savingBodega, setSavingBodega] = useState(false);

  const limpiarFormBodega = () => {
    setNbCodigo("");
    setNbNombre("");
    setNbDireccion("");
  };

  const crearBodega = useCallback(async () => {
    if (!nbCodigo.trim() || !nbNombre.trim()) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    setSavingBodega(true);
    try {
      await apiPost("/api/bodegas", {
        codigo: nbCodigo.trim(),
        nombre: nbNombre.trim(),
        direccion: nbDireccion.trim() || undefined,
      });
      toast.success("Bodega creada correctamente");
      setBodegaOpen(false);
      limpiarFormBodega();
      await cargarBodegas();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al crear bodega";
      toast.error(msg);
    } finally {
      setSavingBodega(false);
    }
  }, [nbCodigo, nbNombre, nbDireccion, cargarBodegas]);

  // ---------- Ajuste de inventario ----------
  const [ajProductoId, setAjProductoId] = useState("");
  const [ajBodegaId, setAjBodegaId] = useState("");
  const [ajTipo, setAjTipo] = useState<"entrada" | "salida" | "ajuste">(
    "entrada",
  );
  const [ajCantidad, setAjCantidad] = useState<string>("");
  const [ajCostoUnitario, setAjCostoUnitario] = useState<string>("");
  const [ajMotivo, setAjMotivo] = useState<string>("");
  const [savingAjuste, setSavingAjuste] = useState(false);

  const limpiarFormAjuste = () => {
    setAjProductoId("");
    setAjBodegaId("");
    setAjTipo("entrada");
    setAjCantidad("");
    setAjCostoUnitario("");
    setAjMotivo("");
  };

  // Autocompletar costo unitario con el costo promedio del producto
  useEffect(() => {
    if (!ajProductoId) return;
    // busca en saldos si ya hay un saldo previo para usar el costo promedio
    const prodSaldos = saldos.filter((s) => s.producto.id === ajProductoId);
    if (prodSaldos.length > 0) {
      const prom = prodSaldos[0].costoPromedio;
      if (prom > 0 && ajCostoUnitario === "") {
        setAjCostoUnitario(String(prom));
      }
    }
  }, [ajProductoId, saldos, ajCostoUnitario]);

  const aplicarAjuste = useCallback(async () => {
    if (!ajProductoId || !ajBodegaId) {
      toast.error("Selecciona producto y bodega");
      return;
    }
    const cantidad = parseFloat(ajCantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast.error("Cantidad inválida");
      return;
    }
    const costoUnitario =
      ajCostoUnitario === "" ? 0 : parseFloat(ajCostoUnitario);
    if (!Number.isFinite(costoUnitario) || costoUnitario < 0) {
      toast.error("Costo unitario inválido");
      return;
    }
    setSavingAjuste(true);
    try {
      await apiPost("/api/inventario", {
        productoId: ajProductoId,
        bodegaId: ajBodegaId,
        tipo: ajTipo,
        cantidad,
        costoUnitario,
        motivo: ajMotivo.trim() || undefined,
      });
      toast.success(
        `${tipoMovStyles[ajTipo].label} registrada correctamente`,
      );
      setAjusteOpen(false);
      limpiarFormAjuste();
      // refrescar saldos
      setLoadingSaldos(false);
      setSaldosLoaded(false);
      cargarSaldos();
      await cargarBodegas();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al aplicar ajuste";
      toast.error(msg);
    } finally {
      setSavingAjuste(false);
    }
  }, [
    ajProductoId,
    ajBodegaId,
    ajTipo,
    ajCantidad,
    ajCostoUnitario,
    ajMotivo,
    cargarSaldos,
    cargarBodegas,
  ]);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Boxes className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Inventarios Multibodega
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Gestiona bodegas, saldos valorizados y kardex por producto.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cargarMeta();
              if (tab === "saldos") cargarSaldos();
              if (tab === "kardex" && kardexConsultado) consultarKardex();
            }}
          >
            <RefreshCw className="size-4" />
            Refrescar
          </Button>
          {tab === "bodegas" && (
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              onClick={() => setBodegaOpen(true)}
            >
              <Plus className="size-4" />
              Nueva bodega
            </Button>
          )}
          {tab === "saldos" && (
            <Button
              size="sm"
              className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
              onClick={() => setAjusteOpen(true)}
            >
              <SlidersHorizontal className="size-4" />
              Ajuste de inventario
            </Button>
          )}
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="w-full"
      >
        <TabsList className="w-full max-w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="bodegas" className="gap-1.5">
            <Building2 className="size-4" />
            <span>Bodegas</span>
          </TabsTrigger>
          <TabsTrigger value="saldos" className="gap-1.5">
            <Layers className="size-4" />
            <span>Saldos por bodega</span>
          </TabsTrigger>
          <TabsTrigger value="kardex" className="gap-1.5">
            <History className="size-4" />
            <span>Kardex</span>
          </TabsTrigger>
        </TabsList>

        {/* ===================== BODEGAS ===================== */}
        <TabsContent value="bodegas" className="mt-4">
          {loadingMeta || loadingBodegas ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full rounded-xl" />
              ))}
            </div>
          ) : bodegas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <Building2 className="size-7" />
                </div>
                <div>
                  <p className="text-base font-medium text-neutral-900 dark:text-neutral-50">
                    No hay bodegas registradas
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Crea tu primera bodega para empezar a gestionar inventarios.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  onClick={() => setBodegaOpen(true)}
                >
                  <Plus className="size-4" />
                  Nueva bodega
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bodegas.map((b) => (
                <Card
                  key={b.id}
                  className="overflow-hidden border-l-4 border-l-emerald-500 dark:border-l-emerald-600 transition-shadow hover:shadow-md"
                >
                  <CardHeader className="gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <Building2 className="size-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{b.nombre}</CardTitle>
                          <CardDescription className="font-mono text-xs">
                            {b.codigo}
                          </CardDescription>
                        </div>
                      </div>
                      {b.activa === false && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                        >
                          Inactiva
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="min-w-0 truncate">
                        {b.direccion || "Sin dirección"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
                        <div className="flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <PackageSearch className="size-4" />
                        </div>
                        <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                          {fmtNum(b.productosCount ?? 0, 0)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Productos
                        </div>
                      </div>
                      <div className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
                        <div className="flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <Layers className="size-4" />
                        </div>
                        <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                          {fmtNum(b.cantidadTotal ?? 0, 2)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Unidades
                        </div>
                      </div>
                      <div className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
                        <div className="flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <Wallet className="size-4" />
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-neutral-900 dark:text-neutral-50">
                          {fmtCOP(b.valorTotal ?? 0)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Valor
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===================== SALDOS ===================== */}
        <TabsContent value="saldos" className="mt-4 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Buscar por producto o bodega…"
                value={filtroSaldos}
                onChange={(e) => setFiltroSaldos(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                <Layers className="size-3" />
                {fmtNum(totalUnidadesSaldos, 2)} unidades
              </Badge>
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                <Wallet className="size-3" />
                {fmtCOP(totalValorSaldos)}
              </Badge>
            </div>
          </div>

          {/* Tabla */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[220px]">Producto</TableHead>
                      <TableHead className="min-w-[160px]">Bodega</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo prom.</TableHead>
                      <TableHead className="text-right">Costo total</TableHead>
                      <TableHead className="text-right">Stock mín.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingSaldos ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : saldosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center">
                          <div className="flex flex-col items-center gap-2 text-neutral-500 dark:text-neutral-400">
                            <Layers className="size-8" />
                            <span className="text-sm">
                              No hay saldos de inventario para mostrar.
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      saldosFiltrados.map((s) => {
                        const bajoMinimo =
                          s.stockMinimo > 0 && s.cantidad <= s.stockMinimo;
                        return (
                          <TableRow key={s.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-neutral-900 dark:text-neutral-50">
                                  {s.producto.nombre}
                                </span>
                                <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                                  {s.producto.codigo}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Building2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                <div className="flex flex-col">
                                  <span className="text-sm">
                                    {s.bodega.nombre}
                                  </span>
                                  <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                                    {s.bodega.codigo}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={
                                  bajoMinimo
                                    ? "font-semibold text-amber-700 dark:text-amber-300"
                                    : "font-medium text-neutral-900 dark:text-neutral-50"
                                }
                              >
                                {fmtNum(s.cantidad, 2)}
                              </span>
                              {bajoMinimo && (
                                <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                                  ⚠
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-neutral-700 dark:text-neutral-200">
                              {fmtCOP(s.costoPromedio)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-emerald-700 dark:text-emerald-300">
                              {fmtCOP(s.costoTotal)}
                            </TableCell>
                            <TableCell className="text-right text-neutral-500 dark:text-neutral-400">
                              {fmtNum(s.stockMinimo, 2)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== KARDEX ===================== */}
        <TabsContent value="kardex" className="mt-4 space-y-4">
          {/* Filtros */}
          <Card>
            <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-neutral-500 dark:text-neutral-400">
                  Producto
                </Label>
                <Select
                  value={kProductoId || "__all__"}
                  onValueChange={(v) =>
                    setKProductoId(v === "__all__" ? "" : v)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos los productos</SelectItem>
                    {productos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.codigo} — {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-neutral-500 dark:text-neutral-400">
                  Bodega
                </Label>
                <Select
                  value={kBodegaId}
                  onValueChange={(v) => setKBodegaId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas las bodegas</SelectItem>
                    {bodegas.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.codigo} — {b.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-neutral-500 dark:text-neutral-400">
                  Desde
                </Label>
                <Input
                  type="date"
                  value={kDesde}
                  onChange={(e) => setKDesde(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-neutral-500 dark:text-neutral-400">
                  Hasta
                </Label>
                <Input
                  type="date"
                  value={kHasta}
                  onChange={(e) => setKHasta(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  onClick={consultarKardex}
                  disabled={loadingKardex}
                >
                  {loadingKardex ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  Consultar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabla Kardex */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[55vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[160px]">Fecha</TableHead>
                      <TableHead className="min-w-[120px]">Tipo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo unit.</TableHead>
                      <TableHead className="text-right">Costo total</TableHead>
                      <TableHead className="text-right">Saldo acum.</TableHead>
                      <TableHead className="min-w-[160px]">Documento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingKardex ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : kardex.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center">
                          <div className="flex flex-col items-center gap-2 text-neutral-500 dark:text-neutral-400">
                            <History className="size-8" />
                            <span className="text-sm">
                              {kardexConsultado
                                ? "No hay movimientos en el rango seleccionado."
                                : "Selecciona filtros y presiona Consultar para ver el kardex."}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      kardex.map((m) => {
                        const t = tipoBadge(m.tipo);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="text-sm text-neutral-700 dark:text-neutral-200">
                              {fmtFecha(m.fecha)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={t.className}
                              >
                                {t.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {t.sign(m.cantidad)}
                            </TableCell>
                            <TableCell className="text-right text-neutral-700 dark:text-neutral-200">
                              {fmtCOP(m.costoUnitario)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-neutral-900 dark:text-neutral-50">
                              {fmtCOP(m.costoTotal)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-mono text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                  {fmtNum(m.saldoCantidad, 2)}
                                </span>
                                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {fmtCOP(m.saldoValor)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-neutral-700 dark:text-neutral-200">
                              <div className="flex items-center gap-1.5">
                                <FileText className="size-3.5 text-neutral-400" />
                                <span className="font-mono text-xs">
                                  {m.documentoTipo || "—"}
                                  {m.documentoId ? ` · ${m.documentoId.slice(-6)}` : ""}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===================== Dialog: Nueva bodega ===================== */}
      <Dialog
        open={bodegaOpen}
        onOpenChange={(v) => {
          setBodegaOpen(v);
          if (!v) limpiarFormBodega();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Building2 className="size-5" />
              Nueva bodega
            </DialogTitle>
            <DialogDescription>
              Registra una nueva bodega para el control multibodega de inventarios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nb-codigo">
                Código <span className="text-rose-500">*</span>
              </Label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="nb-codigo"
                  placeholder="Ej: BOD-001"
                  className="pl-8"
                  value={nbCodigo}
                  onChange={(e) => setNbCodigo(e.target.value)}
                  maxLength={20}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-nombre">
                Nombre <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="nb-nombre"
                placeholder="Ej: Bodega principal"
                value={nbNombre}
                onChange={(e) => setNbNombre(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-direccion">Dirección</Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="nb-direccion"
                  placeholder="Dirección física (opcional)"
                  className="pl-8"
                  value={nbDireccion}
                  onChange={(e) => setNbDireccion(e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={savingBodega}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={crearBodega}
              disabled={savingBodega}
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              {savingBodega ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Crear bodega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Dialog: Ajuste de inventario ===================== */}
      <Dialog
        open={ajusteOpen}
        onOpenChange={(v) => {
          setAjusteOpen(v);
          if (!v) limpiarFormAjuste();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
              <SlidersHorizontal className="size-5" />
              Ajuste de inventario
            </DialogTitle>
            <DialogDescription>
              Registra un movimiento manual de inventario. Se actualizará el saldo y el costo promedio (PEPS ponderado).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aj-producto">
                  Producto <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={ajProductoId}
                  onValueChange={(v) => setAjProductoId(v)}
                >
                  <SelectTrigger id="aj-producto" className="w-full">
                    <SelectValue placeholder="Selecciona producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        Sin productos
                      </SelectItem>
                    ) : (
                      productos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.codigo} — {p.nombre}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aj-bodega">
                  Bodega <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={ajBodegaId}
                  onValueChange={(v) => setAjBodegaId(v)}
                >
                  <SelectTrigger id="aj-bodega" className="w-full">
                    <SelectValue placeholder="Selecciona bodega" />
                  </SelectTrigger>
                  <SelectContent>
                    {bodegas.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        Sin bodegas
                      </SelectItem>
                    ) : (
                      bodegas.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.codigo} — {b.nombre}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de movimiento</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "entrada", label: "Entrada", Icon: ArrowDownToLine, c: "emerald" },
                  { v: "salida", label: "Salida", Icon: ArrowUpFromLine, c: "rose" },
                  { v: "ajuste", label: "Ajuste", Icon: ArrowLeftRight, c: "amber" },
                ] as const).map(({ v, label, Icon, c }) => {
                  const selected = ajTipo === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAjTipo(v as typeof ajTipo)}
                      className={
                        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors " +
                        (selected
                          ? c === "emerald"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : c === "rose"
                              ? "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                              : "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          : "border-neutral-200 bg-transparent text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900")
                      }
                      aria-pressed={selected}
                    >
                      <Icon className="size-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aj-cantidad">
                  Cantidad <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="aj-cantidad"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={ajCantidad}
                  onChange={(e) => setAjCantidad(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aj-costo">Costo unitario (COP)</Label>
                <Input
                  id="aj-costo"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={ajCostoUnitario}
                  onChange={(e) => setAjCostoUnitario(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="aj-motivo">Motivo</Label>
              <Input
                id="aj-motivo"
                placeholder="Ej: Conteo físico, daño de mercancía, devolución…"
                value={ajMotivo}
                onChange={(e) => setAjMotivo(e.target.value)}
                maxLength={120}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={savingAjuste}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={aplicarAjuste}
              disabled={savingAjuste}
              className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
            >
              {savingAjuste ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <SlidersHorizontal className="size-4" />
              )}
              Aplicar movimiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default InventarioView;
