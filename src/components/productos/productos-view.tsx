"use client";

// ============================================================
// productos-view.tsx — Vista de Productos (ERP Marsella)
// - Tabla responsiva con búsqueda y badges de estado
// - Dialog con formulario para crear/editar producto
// - Catálogos: unidades, líneas, impuestos
// - Moneda COP · Dark mode · Acento emerald/teal
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Package,
  Pencil,
  Power,
  Loader2,
  Boxes,
  Tag,
  BarChart3,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- Tipos ----------

interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
}

interface Linea {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
}

interface Impuesto {
  id: string;
  codigo: string;
  nombre: string;
  tarifa: number;
}

interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
}

interface SaldoInventario {
  id: string;
  bodegaId: string;
  cantidad: number;
  costoTotal: number;
  costoPromedio: number;
  bodega?: Bodega | null;
}

interface Producto {
  id: string;
  codigo: string;
  codigoBarras: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  inventariable: boolean;
  unidadMedidaId: string | null;
  unidadMedida?: { id: string; codigo: string; nombre: string } | null;
  lineaId: string | null;
  linea?: { id: string; codigo: string; nombre: string; nivel: number } | null;
  costoPromedio: number;
  ultimoCosto: number;
  precio1: number;
  precio2: number;
  precio3: number;
  impuestoId: string | null;
  impuesto?: { id: string; codigo: string; nombre: string; tarifa: number } | null;
  tarifaIva: number;
  stockMinimo: number;
  stockMaximo: number;
  manejaLotes: boolean;
  manejaSeriales: boolean;
  activo: boolean;
  stockTotal: number;
  valorInventario: number;
  bodegas: SaldoInventario[];
}

interface ProductoForm {
  id?: string;
  codigo: string;
  codigoBarras: string;
  nombre: string;
  descripcion: string;
  tipo: "producto" | "servicio" | "kit" | "insumo";
  inventariable: boolean;
  unidadMedidaId: string;
  lineaId: string;
  costoPromedio: string;
  precio1: string;
  precio2: string;
  precio3: string;
  tarifaIva: string;
  stockMinimo: string;
  stockMaximo: string;
  manejaLotes: boolean;
  manejaSeriales: boolean;
}

// ---------- Helpers ----------

const formatCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
  }).format(n || 0);

const TIPOS: { value: ProductoForm["tipo"]; label: string }[] = [
  { value: "producto", label: "Producto" },
  { value: "servicio", label: "Servicio" },
  { value: "kit", label: "Kit" },
  { value: "insumo", label: "Insumo" },
];

const TARIFAS_IVA = [0, 5, 19];

const tipoBadgeClass: Record<string, string> = {
  producto:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  servicio:
    "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
  kit: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  insumo:
    "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
};

const emptyForm: ProductoForm = {
  codigo: "",
  codigoBarras: "",
  nombre: "",
  descripcion: "",
  tipo: "producto",
  inventariable: true,
  unidadMedidaId: "",
  lineaId: "",
  costoPromedio: "0",
  precio1: "0",
  precio2: "0",
  precio3: "0",
  tarifaIva: "19",
  stockMinimo: "0",
  stockMaximo: "0",
  manejaLotes: false,
  manejaSeriales: false,
};

// ============================================================
// Componente
// ============================================================

export function ProductosView() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactivos, setShowInactivos] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ProductoForm>(emptyForm);

  // Catálogos
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);

  // ---------- Carga de catálogos ----------
  useEffect(() => {
    Promise.all([
      fetch("/api/unidades").then((r) => r.json()),
      fetch("/api/lineas").then((r) => r.json()),
      fetch("/api/impuestos").then((r) => r.json()),
    ])
      .then(([u, l, i]) => {
        setUnidades(Array.isArray(u) ? u : []);
        setLineas(Array.isArray(l) ? l : []);
        setImpuestos(Array.isArray(i) ? i : []);
      })
      .catch(() => {
        toast.error("No se pudieron cargar los catálogos");
      });
  }, []);

  // ---------- Carga de productos ----------
  const loadProductos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (showInactivos) params.set("inactivos", "1");
      params.set("pageSize", "200");
      const res = await fetch(`/api/productos?${params.toString()}`);
      const data = await res.json();
      setProductos(Array.isArray(data?.items) ? data.items : []);
    } catch {
      toast.error("Error al cargar productos");
      setProductos([]);
    } finally {
      setLoading(false);
    }
  }, [search, showInactivos]);

  useEffect(() => {
    const t = setTimeout(loadProductos, 250);
    return () => clearTimeout(t);
  }, [loadProductos]);

  // ---------- Métricas ----------
  const stats = useMemo(() => {
    const total = productos.length;
    const activos = productos.filter((p) => p.activo).length;
    const valorTotal = productos.reduce((a, p) => a + (p.valorInventario || 0), 0);
    const stockBajo = productos.filter(
      (p) =>
        p.inventariable &&
        p.stockMinimo > 0 &&
        p.stockTotal <= p.stockMinimo &&
        p.activo,
    ).length;
    return { total, activos, valorTotal, stockBajo };
  }, [productos]);

  // ---------- Handlers formulario ----------
  const openNew = () => {
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (p: Producto) => {
    setForm({
      id: p.id,
      codigo: p.codigo,
      codigoBarras: p.codigoBarras ?? "",
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      tipo: (p.tipo as ProductoForm["tipo"]) || "producto",
      inventariable: p.inventariable,
      unidadMedidaId: p.unidadMedidaId ?? "",
      lineaId: p.lineaId ?? "",
      costoPromedio: String(p.costoPromedio ?? 0),
      precio1: String(p.precio1 ?? 0),
      precio2: String(p.precio2 ?? 0),
      precio3: String(p.precio3 ?? 0),
      tarifaIva: String(p.tarifaIva ?? 19),
      stockMinimo: String(p.stockMinimo ?? 0),
      stockMaximo: String(p.stockMaximo ?? 0),
      manejaLotes: p.manejaLotes,
      manejaSeriales: p.manejaSeriales,
    });
    setDialogOpen(true);
  };

  const update = <K extends keyof ProductoForm>(
    key: K,
    value: ProductoForm[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.codigo.trim() || form.codigo.trim().length < 2) {
      toast.error("El código debe tener al menos 2 caracteres");
      return;
    }
    if (!form.nombre.trim() || form.nombre.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }

    const payload = {
      ...(form.id ? { id: form.id } : {}),
      codigo: form.codigo.trim(),
      codigoBarras: form.codigoBarras.trim() || null,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      tipo: form.tipo,
      inventariable: form.inventariable,
      unidadMedidaId: form.unidadMedidaId || null,
      lineaId: form.lineaId || null,
      costoPromedio: parseFloat(form.costoPromedio) || 0,
      precio1: parseFloat(form.precio1) || 0,
      precio2: parseFloat(form.precio2) || 0,
      precio3: parseFloat(form.precio3) || 0,
      tarifaIva: parseFloat(form.tarifaIva) || 0,
      stockMinimo: parseFloat(form.stockMinimo) || 0,
      stockMaximo: parseFloat(form.stockMaximo) || 0,
      manejaLotes: form.manejaLotes,
      manejaSeriales: form.manejaSeriales,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/productos", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al guardar producto");
        return;
      }
      toast.success(form.id ? "Producto actualizado" : "Producto creado");
      setDialogOpen(false);
      await loadProductos();
    } catch {
      toast.error("Error de red al guardar producto");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActivo = async (p: Producto) => {
    try {
      const res = await fetch("/api/productos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, activo: !p.activo }),
      });
      if (!res.ok) {
        toast.error("No se pudo cambiar el estado");
        return;
      }
      toast.success(p.activo ? "Producto inactivado" : "Producto activado");
      await loadProductos();
    } catch {
      toast.error("Error de red");
    }
  };

  // ---------- Render ----------
  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Productos
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Maestro de productos, servicios, kits e insumos del ERP Marsella
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadProductos}
            title="Refrescar"
            className="border-neutral-200 dark:border-neutral-700"
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            onClick={openNew}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <Plus className="size-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total productos"
          value={String(stats.total)}
          icon={<Package className="size-4" />}
          tone="emerald"
        />
        <StatCard
          label="Activos"
          value={String(stats.activos)}
          icon={<Tag className="size-4" />}
          tone="teal"
        />
        <StatCard
          label="Valor inventario"
          value={formatCOP(stats.valorTotal)}
          icon={<BarChart3 className="size-4" />}
          tone="emerald"
        />
        <StatCard
          label="Stock bajo mínimo"
          value={String(stats.stockBajo)}
          icon={<AlertCircle className="size-4" />}
          tone="amber"
        />
      </div>

      {/* Toolbar */}
      <Card className="border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-neutral-400 absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="Buscar por código, nombre o código de barras…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-neutral-200 pl-9 dark:border-neutral-700"
            />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <Checkbox
              checked={showInactivos}
              onCheckedChange={(v) => setShowInactivos(v === true)}
            />
            Mostrar inactivos
          </label>
        </CardContent>
      </Card>

      {/* Tabla (desktop) */}
      <div className="hidden md:block">
        <Card className="border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <CardContent className="p-0">
            <div className="max-h-[calc(100vh-22rem)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                  <TableRow className="border-neutral-200 hover:bg-transparent dark:border-neutral-800">
                    <TableHead className="text-neutral-600 dark:text-neutral-300">
                      Código
                    </TableHead>
                    <TableHead className="text-neutral-600 dark:text-neutral-300">
                      Cód. barras
                    </TableHead>
                    <TableHead className="text-neutral-600 dark:text-neutral-300">
                      Nombre
                    </TableHead>
                    <TableHead className="text-neutral-600 dark:text-neutral-300">
                      Tipo
                    </TableHead>
                    <TableHead className="text-neutral-600 dark:text-neutral-300">
                      Unidad
                    </TableHead>
                    <TableHead className="text-neutral-600 dark:text-neutral-300">
                      Línea
                    </TableHead>
                    <TableHead className="text-right text-neutral-600 dark:text-neutral-300">
                      Costo prom.
                    </TableHead>
                    <TableHead className="text-right text-neutral-600 dark:text-neutral-300">
                      Precio 1
                    </TableHead>
                    <TableHead className="text-right text-neutral-600 dark:text-neutral-300">
                      Precio 2
                    </TableHead>
                    <TableHead className="text-right text-neutral-600 dark:text-neutral-300">
                      Precio 3
                    </TableHead>
                    <TableHead className="text-right text-neutral-600 dark:text-neutral-300">
                      Stock total
                    </TableHead>
                    <TableHead className="text-right text-neutral-600 dark:text-neutral-300">
                      Valor inv.
                    </TableHead>
                    <TableHead className="text-neutral-600 dark:text-neutral-300">
                      Estado
                    </TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell colSpan={14}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : productos.length === 0 ? (
                    <TableRow className="border-neutral-200 hover:bg-transparent dark:border-neutral-800">
                      <TableCell colSpan={14} className="text-center text-neutral-500 py-10">
                        No se encontraron productos
                      </TableCell>
                    </TableRow>
                  ) : (
                    productos.map((p) => (
                      <TableRow
                        key={p.id}
                        className="border-neutral-200 hover:bg-emerald-50/40 dark:border-neutral-800 dark:hover:bg-emerald-500/5"
                      >
                        <TableCell className="font-mono text-xs font-medium text-neutral-900 dark:text-neutral-100">
                          {p.codigo}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                          {p.codigoBarras || "—"}
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate font-medium text-neutral-900 dark:text-neutral-100">
                          {p.nombre}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={tipoBadgeClass[p.tipo] ?? tipoBadgeClass.producto}
                          >
                            {p.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-neutral-600 dark:text-neutral-300">
                          {p.unidadMedida?.codigo ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-sm text-neutral-600 dark:text-neutral-300">
                          {p.linea?.nombre ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-neutral-700 dark:text-neutral-200">
                          {formatCOP(p.costoPromedio)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-neutral-700 dark:text-neutral-200">
                          {formatCOP(p.precio1)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                          {formatCOP(p.precio2)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                          {formatCOP(p.precio3)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium text-neutral-900 dark:text-neutral-100">
                          {p.stockTotal.toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-neutral-700 dark:text-neutral-200">
                          {formatCOP(p.valorInventario)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              p.activo
                                ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : "border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                            }
                          >
                            {p.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                              >
                                <Boxes className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                            >
                              <DropdownMenuLabel className="text-neutral-500 dark:text-neutral-400">
                                Acciones
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => openEdit(p)}
                                className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-700 dark:focus:bg-emerald-500/10 dark:focus:text-emerald-300"
                              >
                                <Pencil className="size-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => toggleActivo(p)}
                                className="cursor-pointer focus:bg-neutral-100 dark:focus:bg-neutral-800"
                              >
                                <Power className="size-4" />
                                {p.activo ? "Inactivar" : "Activar"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cards (mobile) */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`mcsk-${i}`} className="h-32 w-full" />
          ))
        ) : productos.length === 0 ? (
          <Card className="border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <CardContent className="text-center text-neutral-500 p-6">
              No se encontraron productos
            </CardContent>
          </Card>
        ) : (
          productos.map((p) => (
            <Card
              key={p.id}
              className="border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        {p.codigo}
                      </span>
                      <Badge
                        variant="outline"
                        className={tipoBadgeClass[p.tipo] ?? tipoBadgeClass.producto}
                      >
                        {p.tipo}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-semibold text-neutral-900 dark:text-neutral-100">
                      {p.nombre}
                    </p>
                    {p.codigoBarras && (
                      <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                        {p.codigoBarras}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      p.activo
                        ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                    }
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="Unidad" value={p.unidadMedida?.codigo ?? "—"} />
                  <Info label="Línea" value={p.linea?.nombre ?? "—"} />
                  <Info
                    label="Precio 1"
                    value={formatCOP(p.precio1)}
                    numeric
                  />
                  <Info
                    label="Costo prom."
                    value={formatCOP(p.costoPromedio)}
                    numeric
                  />
                  <Info
                    label="Stock total"
                    value={p.stockTotal.toLocaleString("es-CO")}
                    numeric
                  />
                  <Info
                    label="Valor inv."
                    value={formatCOP(p.valorInventario)}
                    numeric
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActivo(p)}
                    className="border-neutral-200 dark:border-neutral-700"
                  >
                    <Power className="size-3.5" />
                    {p.activo ? "Inactivar" : "Activar"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(p)}
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                  >
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog formulario */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              {form.id ? "Editar producto" : "Nuevo producto"}
            </DialogTitle>
            <DialogDescription>
              Complete los datos del maestro de productos. Los campos marcados
              con <span className="font-semibold">*</span> son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Código" required>
                <Input
                  value={form.codigo}
                  onChange={(e) => update("codigo", e.target.value)}
                  placeholder="Ej: PROD-001"
                  className="border-neutral-200 dark:border-neutral-700"
                  required
                />
              </Field>
              <Field label="Código de barras">
                <Input
                  value={form.codigoBarras}
                  onChange={(e) => update("codigoBarras", e.target.value)}
                  placeholder="EAN-13 (opcional)"
                  className="border-neutral-200 dark:border-neutral-700"
                />
              </Field>
              <Field label="Nombre" required className="sm:col-span-2">
                <Input
                  value={form.nombre}
                  onChange={(e) => update("nombre", e.target.value)}
                  placeholder="Nombre del producto / servicio"
                  className="border-neutral-200 dark:border-neutral-700"
                  required
                />
              </Field>
              <Field label="Descripción" className="sm:col-span-2">
                <Textarea
                  value={form.descripcion}
                  onChange={(e) => update("descripcion", e.target.value)}
                  placeholder="Descripción detallada (opcional)"
                  rows={3}
                  className="resize-none border-neutral-200 dark:border-neutral-700"
                />
              </Field>
              <Field label="Tipo" required>
                <Select
                  value={form.tipo}
                  onValueChange={(v) =>
                    update("tipo", v as ProductoForm["tipo"])
                  }
                >
                  <SelectTrigger className="w-full border-neutral-200 dark:border-neutral-700">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tarifa IVA" required>
                <Select
                  value={form.tarifaIva}
                  onValueChange={(v) => update("tarifaIva", v)}
                >
                  <SelectTrigger className="w-full border-neutral-200 dark:border-neutral-700">
                    <SelectValue placeholder="Tarifa" />
                  </SelectTrigger>
                  <SelectContent>
                    {TARIFAS_IVA.map((t) => (
                      <SelectItem key={t} value={String(t)}>
                        {t}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Unidad de medida">
                <Select
                  value={form.unidadMedidaId}
                  onValueChange={(v) => update("unidadMedidaId", v)}
                >
                  <SelectTrigger className="w-full border-neutral-200 dark:border-neutral-700">
                    <SelectValue placeholder="Sin unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.codigo} — {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Línea de clasificación">
                <Select
                  value={form.lineaId}
                  onValueChange={(v) => update("lineaId", v)}
                >
                  <SelectTrigger className="w-full border-neutral-200 dark:border-neutral-700">
                    <SelectValue placeholder="Sin línea" />
                  </SelectTrigger>
                  <SelectContent>
                    {lineas.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.codigo} — {l.nombre} (N{l.nivel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Costo promedio">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.costoPromedio}
                  onChange={(e) => update("costoPromedio", e.target.value)}
                  className="border-neutral-200 tabular-nums dark:border-neutral-700"
                />
              </Field>
              <Field label="Precio 1">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio1}
                  onChange={(e) => update("precio1", e.target.value)}
                  className="border-neutral-200 tabular-nums dark:border-neutral-700"
                />
              </Field>
              <Field label="Precio 2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio2}
                  onChange={(e) => update("precio2", e.target.value)}
                  className="border-neutral-200 tabular-nums dark:border-neutral-700"
                />
              </Field>
              <Field label="Precio 3">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio3}
                  onChange={(e) => update("precio3", e.target.value)}
                  className="border-neutral-200 tabular-nums dark:border-neutral-700"
                />
              </Field>
              <Field label="Stock mínimo">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.stockMinimo}
                  onChange={(e) => update("stockMinimo", e.target.value)}
                  className="border-neutral-200 tabular-nums dark:border-neutral-700"
                />
              </Field>
              <Field label="Stock máximo">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.stockMaximo}
                  onChange={(e) => update("stockMaximo", e.target.value)}
                  className="border-neutral-200 tabular-nums dark:border-neutral-700"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50 sm:grid-cols-3">
              <CheckField
                label="Inventariable"
                description="Maneja stock"
                checked={form.inventariable}
                onChange={(v) => update("inventariable", v)}
              />
              <CheckField
                label="Maneja lotes"
                description="Trazabilidad por lote"
                checked={form.manejaLotes}
                onChange={(v) => update("manejaLotes", v)}
              />
              <CheckField
                label="Maneja seriales"
                description="Único por unidad"
                checked={form.manejaSeriales}
                onChange={(v) => update("manejaSeriales", v)}
              />
            </div>
          </form>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="border-neutral-200 dark:border-neutral-700"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : form.id ? (
                "Guardar cambios"
              ) : (
                "Crear producto"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Subcomponentes ----------

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "teal" | "amber";
}) {
  const toneClass = {
    emerald:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    teal: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  }[tone];
  return (
    <Card className="border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-md ${toneClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p className="truncate text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label} {required && <span className="text-emerald-600">*</span>}
      </Label>
      {children}
    </div>
  );
}

function CheckField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2.5">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5 border-neutral-300 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white dark:border-neutral-600"
      />
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
    </label>
  );
}

function Info({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p
        className={`text-neutral-900 dark:text-neutral-100 ${numeric ? "tabular-nums" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
