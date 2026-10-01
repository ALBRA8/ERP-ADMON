"use client";

// ============================================================
// ERP Marsella — Vista de Compras y Proveedores
// - Tab "Compras registradas": tabla con búsqueda por número/proveedor/NIT,
//   columnas de número, fecha, proveedor, # ítems, subtotal, IVA descontable,
//   total, saldo pendiente y estado.
// - Tab "Nueva compra": formulario con selector de proveedor (combobox +
//   diálogo "Crear proveedor"), bodega destino, fecha de vencimiento,
//   tabla editable de ítems (combobox de producto que autocompleta
//   descripción y precio), totales en tiempo real y POST /api/compras.
// Moneda COP · Dark mode · Acento emerald/teal · Toast sonner
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ShoppingCart,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Save,
  Package,
  Building2,
  Warehouse,
  CalendarClock,
  FileText,
  ChevronsUpDown,
  Check,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  Loader2,
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Tipos ----------

interface Tercero {
  id: string;
  nombre: string;
  numeroDocumento: string;
  tipo: string;
  nombreComercial?: string | null;
  digitoVerif?: string | null;
}

interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
}

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  unidadMedida?: UnidadMedida | null;
  unidadMedidaId?: string | null;
  precio1: number;
  costoPromedio: number;
  ultimoCosto: number;
  tarifaIva: number;
  inventariable: boolean;
  tipo?: string;
}

interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
  direccion?: string | null;
  activa?: boolean;
}

interface DetalleCompra {
  id: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  descuentoValor: number;
  tarifaIva: number;
  subtotal: number;
  iva: number;
  total: number;
}

interface FacturaCompra {
  id: string;
  numero: string;
  proveedorFacturaNumero?: string | null;
  terceroId?: string | null;
  nombreProveedor: string;
  nitProveedor: string;
  fecha: string;
  fechaVencimiento?: string | null;
  subtotal: number;
  descuentoTotal: number;
  totalIva: number;
  total: number;
  saldoPendiente: number;
  estadoCartera: string;
  estado: string;
  observaciones?: string | null;
  detalles?: DetalleCompra[];
  tercero?: Tercero | null;
}

// ---------- Helpers UI ----------

function formatDate(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  try {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    return d.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function round2(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function estadoCarteraBadge(estado: string) {
  const map: Record<string, string> = {
    pendiente:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    parcial:
      "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
    pagada:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    vencida:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <Badge variant="outline" className={map[estado] ?? ""}>
      {estado}
    </Badge>
  );
}

function estadoFacturaBadge(estado: string) {
  const map: Record<string, string> = {
    vigente:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    anulada:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <Badge variant="outline" className={map[estado] ?? ""}>
      {estado}
    </Badge>
  );
}

// ---------- Tipos internos para el formulario ----------

interface ItemInput {
  key: string;
  productoId?: string;
  descripcion: string;
  cantidad: string;
  unidadMedida: string;
  precioUnitario: string;
  descuentoValor: string;
  tarifaIva: string;
}

function emptyItem(): ItemInput {
  return {
    key: crypto.randomUUID(),
    productoId: undefined,
    descripcion: "",
    cantidad: "1",
    unidadMedida: "UND",
    precioUnitario: "0",
    descuentoValor: "0",
    tarifaIva: "19",
  };
}

function computeItem(row: ItemInput) {
  const cantidad = parseFloat(row.cantidad) || 0;
  const precio = parseFloat(row.precioUnitario) || 0;
  const descuento = parseFloat(row.descuentoValor) || 0;
  const tarifa = parseFloat(row.tarifaIva) || 0;
  const gross = round2(cantidad * precio);
  const subtotal = round2(gross - descuento);
  const iva = round2(subtotal * (tarifa / 100));
  const total = round2(subtotal + iva);
  return { cantidad, precio, descuento, tarifa, gross, subtotal, iva, total };
}

// ============================================================
// Combobox reutilizable (Popover + Command)
// ============================================================

interface ComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  items: { id: string; label: string; sub?: string }[];
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
}

function Combobox({
  value,
  onValueChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  emptyText = "Sin resultados.",
  items,
  triggerClassName,
  contentClassName,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const l = (it.label ?? "").toLowerCase();
      const s = (it.sub ?? "").toLowerCase();
      return l.includes(q) || s.includes(q);
    });
  }, [items, search]);

  const selected = items.find((it) => it.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate text-left">
            {selected ? (
              <span className="block truncate">
                <span className="text-foreground">{selected.label}</span>
                {selected.sub ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    · {selected.sub}
                  </span>
                ) : null}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.id}
                  onSelect={() => {
                    onValueChange?.(it.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      value === it.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{it.label}</span>
                    {it.sub ? (
                      <span className="text-xs text-muted-foreground truncate">
                        {it.sub}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// Componente principal
// ============================================================

export function ComprasView() {
  const [tab, setTab] = useState<string>("lista");

  // Datos compartidos
  const [proveedores, setProveedores] = useState<Tercero[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);

  // Tab lista
  const [compras, setCompras] = useState<FacturaCompra[]>([]);
  const [loadingCompras, setLoadingCompras] = useState(true);
  const [searchCompras, setSearchCompras] = useState("");

  // Tab nueva compra (formulario)
  const [proveedorId, setProveedorId] = useState<string>("");
  const [proveedorFacturaNumero, setProveedorFacturaNumero] = useState("");
  const [bodegaDestinoId, setBodegaDestinoId] = useState<string>("");
  const [fechaVencimiento, setFechaVencimiento] = useState<string>(addDaysISO(30));
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<ItemInput[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);

  // Diálogo crear proveedor
  const [openNuevoProv, setOpenNuevoProv] = useState(false);
  const [nuevoProvNombre, setNuevoProvNombre] = useState("");
  const [nuevoProvNIT, setNuevoProvNIT] = useState("");
  const [nuevoProvDigito, setNuevoProvDigito] = useState("");
  const [savingProv, setSavingProv] = useState(false);

  // -------- Carga de catálogos al montar --------
  const cargarCatalogos = useCallback(async () => {
    setLoadingCatalogos(true);
    try {
      const [rProv, rProd, rBod] = await Promise.all([
        fetch("/api/terceros?tipo=proveedor&pageSize=300"),
        fetch("/api/productos?pageSize=500"),
        fetch("/api/bodegas"),
      ]);
      const dProv = await rProv.json();
      if (!rProv.ok) throw new Error(dProv.error ?? "Error proveedores");
      const dProd = await rProd.json();
      if (!rProd.ok) throw new Error(dProd.error ?? "Error productos");
      const dBod = await rBod.json();
      if (!rBod.ok) throw new Error(dBod.error ?? "Error bodegas");

      setProveedores((dProv.items ?? []) as Tercero[]);
      setProductos((dProd.items ?? []) as Producto[]);
      const bods = (Array.isArray(dBod) ? dBod : dBod.items ?? []) as Bodega[];
      setBodegas(bods.filter((b) => b.activa !== false));
      if (bods.length > 0 && bods[0]) {
        setBodegaDestinoId(bods[0].id);
      }
    } catch (e: any) {
      toast.error("No se pudieron cargar los catálogos", {
        description: e?.message,
      });
    } finally {
      setLoadingCatalogos(false);
    }
  }, []);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  // -------- Cargar lista de compras (al entrar a la tab) --------
  const cargarCompras = useCallback(async () => {
    setLoadingCompras(true);
    try {
      const q = searchCompras.trim();
      const url = `/api/compras?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ""}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setCompras((d.items ?? []) as FacturaCompra[]);
    } catch (e: any) {
      toast.error("No se pudieron listar las compras", {
        description: e?.message,
      });
    } finally {
      setLoadingCompras(false);
    }
  }, [searchCompras]);

  useEffect(() => {
    if (tab === "lista") {
      const t = setTimeout(() => cargarCompras(), 350);
      return () => clearTimeout(t);
    }
  }, [tab, cargarCompras]);

  // -------- Helpers de productos/proveedores --------
  const proveedorItems = useMemo(
    () =>
      proveedores.map((p) => ({
        id: p.id,
        label: p.nombreComercial?.trim() ? p.nombreComercial : p.nombre,
        sub: p.numeroDocumento + (p.digitoVerif ? `-${p.digitoVerif}` : ""),
      })),
    [proveedores],
  );

  const productoItems = useMemo(
    () =>
      productos.map((p) => ({
        id: p.id,
        label: p.nombre,
        sub: `${p.codigo} · ${formatCurrency(p.ultimoCosto || p.precio1 || 0)}`,
      })),
    [productos],
  );

  const selectedProveedor = useMemo(
    () => proveedores.find((p) => p.id === proveedorId),
    [proveedores, proveedorId],
  );

  // -------- Manipulación de items --------
  const updateItem = useCallback((key: string, patch: Partial<ItemInput>) => {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  }, []);

  const addManualItem = useCallback(() => {
    setItems((prev) => [...prev, emptyItem()]);
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }, []);

  const onSelectProducto = useCallback(
    (key: string, productoId: string) => {
      const p = productos.find((x) => x.id === productoId);
      if (!p) return;
      updateItem(key, {
        productoId: p.id,
        descripcion: p.descripcion?.trim() || p.nombre,
        unidadMedida: p.unidadMedida?.codigo || "UND",
        precioUnitario: String(p.ultimoCosto || p.precio1 || 0),
        tarifaIva: String(p.tarifaIva ?? 19),
      });
    },
    [productos, updateItem],
  );

  // -------- Totales en tiempo real --------
  const totals = useMemo(() => {
    let gross = 0;
    let descuento = 0;
    let iva = 0;
    let total = 0;
    for (const it of items) {
      const c = computeItem(it);
      gross += c.gross;
      descuento += c.descuento;
      iva += c.iva;
      total += c.total;
    }
    return {
      gross: round2(gross),
      descuento: round2(descuento),
      iva: round2(iva),
      total: round2(total),
    };
  }, [items]);

  // -------- Validación previa al submit --------
  const validacion = useMemo(() => {
    if (!selectedProveedor) {
      return { ok: false, msg: "Seleccione un proveedor (o créelo si no existe)." };
    }
    if (!bodegaDestinoId) {
      return { ok: false, msg: "Seleccione una bodega destino." };
    }
    if (items.length === 0) {
      return { ok: false, msg: "Agregue al menos un ítem a la compra." };
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const c = computeItem(it);
      if (!it.descripcion.trim()) {
        return { ok: false, msg: `Ítem #${i + 1}: la descripción es obligatoria.` };
      }
      if (c.cantidad <= 0) {
        return { ok: false, msg: `Ítem #${i + 1}: la cantidad debe ser mayor que 0.` };
      }
      if (c.precio < 0) {
        return { ok: false, msg: `Ítem #${i + 1}: el precio no puede ser negativo.` };
      }
      if (c.descuento > c.gross) {
        return {
          ok: false,
          msg: `Ítem #${i + 1}: el descuento no puede superar el bruto.`,
        };
      }
    }
    return { ok: true, msg: "" };
  }, [selectedProveedor, bodegaDestinoId, items]);

  // -------- Crear proveedor desde el diálogo --------
  const guardarProveedor = useCallback(async () => {
    const nombre = nuevoProvNombre.trim();
    const nit = nuevoProvNIT.trim();
    if (nombre.length < 2) {
      toast.error("El nombre del proveedor es obligatorio.");
      return;
    }
    if (nit.length < 3) {
      toast.error("El NIT del proveedor es obligatorio.");
      return;
    }
    setSavingProv(true);
    try {
      const r = await fetch("/api/terceros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "proveedor",
          tipoDocumento: "NIT",
          numeroDocumento: nit,
          nombre,
          nombreComercial: nombre,
          digitoVerif: nuevoProvDigito.trim() || undefined,
          regimenTributario: "comun",
          responsabilidad: "iva",
          cupoCredito: 0,
          diasPlazo: 30,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error al crear proveedor");
      const creado = d as Tercero;
      setProveedores((prev) => [creado, ...prev]);
      setProveedorId(creado.id);
      setOpenNuevoProv(false);
      setNuevoProvNombre("");
      setNuevoProvNIT("");
      setNuevoProvDigito("");
      toast.success("Proveedor creado", {
        description: `${creado.nombre} · ${creado.numeroDocumento}`,
      });
    } catch (e: any) {
      toast.error("No se pudo crear el proveedor", { description: e?.message });
    } finally {
      setSavingProv(false);
    }
  }, [nuevoProvNombre, nuevoProvNIT, nuevoProvDigito]);

  // -------- Reset formulario --------
  const resetForm = useCallback(() => {
    setProveedorId("");
    setProveedorFacturaNumero("");
    setObservaciones("");
    setFechaVencimiento(addDaysISO(30));
    setItems([emptyItem()]);
    if (bodegas[0]) setBodegaDestinoId(bodegas[0].id);
  }, [bodegas]);

  // -------- Submit (POST /api/compras) --------
  const submit = useCallback(async () => {
    if (!validacion.ok) {
      toast.error("Validación", { description: validacion.msg });
      return;
    }
    if (!selectedProveedor) return;
    setSubmitting(true);
    try {
      const payload = {
        proveedorFacturaNumero: proveedorFacturaNumero.trim() || undefined,
        terceroId: selectedProveedor.id,
        nombreProveedor:
          selectedProveedor.nombreComercial?.trim() || selectedProveedor.nombre,
        nitProveedor: selectedProveedor.numeroDocumento,
        fechaVencimiento,
        bodegaDestinoId,
        observaciones: observaciones.trim() || undefined,
        items: items.map((it) => {
          const c = computeItem(it);
          return {
            productoId: it.productoId,
            descripcion: it.descripcion.trim(),
            cantidad: c.cantidad,
            unidadMedida: it.unidadMedida || "UND",
            precioUnitario: c.precio,
            descuentoValor: c.descuento,
            tarifaIva: c.tarifa,
            bodegaDestinoId,
          };
        }),
      };

      const r = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error al registrar compra");
      const fac = d as FacturaCompra;
      toast.success("Compra registrada", {
        description: `Factura ${fac.numero} · ${formatCurrency(fac.total)}`,
      });
      resetForm();
      setTab("lista");
    } catch (e: any) {
      toast.error("No se pudo registrar la compra", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  }, [
    validacion,
    selectedProveedor,
    proveedorFacturaNumero,
    fechaVencimiento,
    bodegaDestinoId,
    observaciones,
    items,
    resetForm,
  ]);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              Compras y Proveedores
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Facturas de compra · Entrada de inventario · CxP
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex h-auto sm:h-9">
            <TabsTrigger value="lista" className="gap-1.5">
              <Receipt className="w-4 h-4" />
              <span>Compras registradas</span>
            </TabsTrigger>
            <TabsTrigger value="nueva" className="gap-1.5">
              <Plus className="w-4 h-4" />
              <span>Nueva compra</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ============ TAB LISTA ============ */}
        <TabsContent value="lista">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Compras registradas
                  </CardTitle>
                  <CardDescription>
                    {compras.length} facturas · búsqueda por número, proveedor o NIT
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <Input
                      placeholder="Buscar número, proveedor, NIT..."
                      value={searchCompras}
                      onChange={(e) => setSearchCompras(e.target.value)}
                      className="pl-8 w-full sm:w-72"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => cargarCompras()}
                    disabled={loadingCompras}
                  >
                    <RefreshCw
                      className={cn(
                        "w-4 h-4",
                        loadingCompras && "animate-spin",
                      )}
                    />
                    Actualizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingCompras ? (
                <div className="p-8 text-center text-sm text-neutral-500 animate-pulse">
                  Cargando compras...
                </div>
              ) : compras.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">
                  No se encontraron compras con el criterio indicado.
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-40">Número</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="min-w-[200px]">Proveedor</TableHead>
                        <TableHead className="w-20 text-center">Ítems</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">IVA desct.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="w-28 text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compras.map((c) => {
                        const proveedorLabel = c.nombreProveedor || c.tercero?.nombre || "—";
                        const nitLabel = c.nitProveedor || c.tercero?.numeroDocumento || "";
                        const numItems = c.detalles?.length ?? 0;
                        const saldo = c.saldoPendiente ?? 0;
                        const pagada = saldo <= 0.009;
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/40">
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  {c.numero}
                                </span>
                                {c.proveedorFacturaNumero ? (
                                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                    Fac. prov: {c.proveedorFacturaNumero}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDate(c.fecha)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="truncate font-medium">
                                  {proveedorLabel}
                                </span>
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                                  {nitLabel}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="font-mono">
                                {numItems}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatCurrency(c.subtotal)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-teal-700 dark:text-teal-400">
                              {formatCurrency(c.totalIva)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              {formatCurrency(c.total)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              <span
                                className={cn(
                                  pagada
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400",
                                )}
                              >
                                {formatCurrency(saldo)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                {estadoCarteraBadge(c.estadoCartera)}
                                {c.estado && c.estado !== "vigente"
                                  ? estadoFacturaBadge(c.estado)
                                  : null}
                              </div>
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

        {/* ============ TAB NUEVA COMPRA ============ */}
        <TabsContent value="nueva">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Columna izquierda — formulario */}
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Datos de la factura
                  </CardTitle>
                  <CardDescription>
                    Proveedor, bodega destino y vencimiento (CxP)
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 space-y-4">
                  {/* Proveedor */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Proveedor <span className="text-rose-500">*</span>
                    </Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1">
                        <Combobox
                          value={proveedorId}
                          onValueChange={setProveedorId}
                          placeholder="Seleccionar proveedor..."
                          searchPlaceholder="Buscar por nombre o NIT..."
                          emptyText="No se encontraron proveedores."
                          items={proveedorItems}
                          disabled={loadingCatalogos || submitting}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpenNuevoProv(true)}
                        disabled={submitting}
                        className="shrink-0"
                      >
                        <UserPlus className="w-4 h-4" />
                        Crear proveedor
                      </Button>
                    </div>
                    {selectedProveedor ? (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        NIT: {selectedProveedor.numeroDocumento}
                        {selectedProveedor.digitoVerif
                          ? `-${selectedProveedor.digitoVerif}`
                          : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Número factura proveedor */}
                    <div className="space-y-1.5">
                      <Label htmlFor="fac-prov" className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        N° factura proveedor
                      </Label>
                      <Input
                        id="fac-prov"
                        value={proveedorFacturaNumero}
                        onChange={(e) => setProveedorFacturaNumero(e.target.value)}
                        placeholder="Opcional (ej. FC-2026-001)"
                        disabled={submitting}
                      />
                    </div>

                    {/* Bodega destino */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Warehouse className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Bodega destino <span className="text-rose-500">*</span>
                      </Label>
                      <Select
                        value={bodegaDestinoId}
                        onValueChange={setBodegaDestinoId}
                        disabled={loadingCatalogos || submitting}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar bodega..." />
                        </SelectTrigger>
                        <SelectContent>
                          {bodegas.length === 0 ? (
                            <SelectItem value="_none" disabled>
                              Sin bodegas
                            </SelectItem>
                          ) : (
                            bodegas.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                <span className="font-mono text-xs mr-2">
                                  {b.codigo}
                                </span>
                                {b.nombre}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Fecha vencimiento */}
                    <div className="space-y-1.5">
                      <Label htmlFor="venc" className="flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Fecha vencimiento (crédito)
                      </Label>
                      <Input
                        id="venc"
                        type="date"
                        value={fechaVencimiento}
                        onChange={(e) => setFechaVencimiento(e.target.value)}
                        disabled={submitting}
                      />
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Default: hoy + 30 días
                      </p>
                    </div>

                    {/* Cargar productos info */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <Package className="w-3.5 h-3.5" />
                        Catálogo cargado
                      </Label>
                      <div className="text-sm flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/30">
                        <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-mono">{productos.length}</span>
                        <span className="text-neutral-500 dark:text-neutral-400">
                          productos disponibles
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabla de items */}
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        Ítems de la compra
                      </CardTitle>
                      <CardDescription>
                        Seleccione productos o cree ítems manuales
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addManualItem}
                      disabled={submitting}
                    >
                      <Plus className="w-4 h-4" />
                      Item manual
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="min-w-[260px]">Producto / Descripción</TableHead>
                          <TableHead className="w-24">Cantidad</TableHead>
                          <TableHead className="w-20">Unidad</TableHead>
                          <TableHead className="w-32">Precio unit.</TableHead>
                          <TableHead className="w-28">Descuento</TableHead>
                          <TableHead className="w-20">IVA %</TableHead>
                          <TableHead className="w-28 text-right">Subtotal</TableHead>
                          <TableHead className="w-28 text-right">IVA</TableHead>
                          <TableHead className="w-28 text-right">Total</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((it, i) => {
                          const c = computeItem(it);
                          return (
                            <TableRow key={it.key} className="align-top">
                              <TableCell>
                                <div className="flex flex-col gap-1.5 min-w-0">
                                  <Combobox
                                    value={it.productoId}
                                    onValueChange={(pid) => onSelectProducto(it.key, pid)}
                                    placeholder="Producto..."
                                    searchPlaceholder="Buscar producto..."
                                    emptyText="No se encontraron productos."
                                    items={productoItems}
                                    disabled={loadingCatalogos || submitting}
                                  />
                                  <Input
                                    value={it.descripcion}
                                    onChange={(e) =>
                                      updateItem(it.key, { descripcion: e.target.value })
                                    }
                                    placeholder="Descripción (requerida)"
                                    disabled={submitting}
                                    className="text-xs"
                                  />
                                  {it.productoId ? (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                                      SKU autocompletado
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                                      Ítem manual #{i + 1}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.cantidad}
                                  onChange={(e) =>
                                    updateItem(it.key, { cantidad: e.target.value })
                                  }
                                  disabled={submitting}
                                  className="w-20 font-mono text-sm"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={it.unidadMedida}
                                  onChange={(e) =>
                                    updateItem(it.key, { unidadMedida: e.target.value })
                                  }
                                  disabled={submitting}
                                  className="w-16 font-mono text-sm uppercase"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.precioUnitario}
                                  onChange={(e) =>
                                    updateItem(it.key, { precioUnitario: e.target.value })
                                  }
                                  disabled={submitting}
                                  className="w-28 font-mono text-sm"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.descuentoValor}
                                  onChange={(e) =>
                                    updateItem(it.key, { descuentoValor: e.target.value })
                                  }
                                  disabled={submitting}
                                  className="w-24 font-mono text-sm"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.tarifaIva}
                                  onChange={(e) =>
                                    updateItem(it.key, { tarifaIva: e.target.value })
                                  }
                                  disabled={submitting}
                                  className="w-16 font-mono text-sm"
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(c.subtotal)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-teal-700 dark:text-teal-400">
                                {formatCurrency(c.iva)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">
                                {formatCurrency(c.total)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeItem(it.key)}
                                  disabled={submitting || items.length <= 1}
                                  className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
                          <TableCell colSpan={6} className="font-semibold text-right">
                            Totales
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(totals.gross)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-teal-700 dark:text-teal-400">
                            {formatCurrency(totals.iva)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(totals.total)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Observaciones */}
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Observaciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <Textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Notas internas sobre la compra (opcional)..."
                    rows={3}
                    disabled={submitting}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Columna derecha — resumen + acciones */}
            <div className="space-y-4 md:space-y-6">
              <Card className="lg:sticky lg:top-4">
                <CardHeader className="border-b bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40">
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Resumen de la compra
                  </CardTitle>
                  <CardDescription>
                    Cálculos en tiempo real
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 space-y-3">
                  <ResumenRow label="Proveedor">
                    {selectedProveedor ? (
                      <span className="text-sm font-medium">
                        {selectedProveedor.nombreComercial?.trim() || selectedProveedor.nombre}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        No seleccionado
                      </span>
                    )}
                  </ResumenRow>
                  <ResumenRow label="NIT">
                    {selectedProveedor ? (
                      <span className="font-mono text-sm">
                        {selectedProveedor.numeroDocumento}
                        {selectedProveedor.digitoVerif
                          ? `-${selectedProveedor.digitoVerif}`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </ResumenRow>
                  <ResumenRow label="Bodega destino">
                    {bodegaDestinoId ? (
                      <span className="text-sm font-medium">
                        {bodegas.find((b) => b.id === bodegaDestinoId)?.nombre ?? "—"}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        No seleccionada
                      </span>
                    )}
                  </ResumenRow>
                  <ResumenRow label="Vencimiento">
                    <span className="text-sm font-mono">
                      {formatDate(fechaVencimiento)}
                    </span>
                  </ResumenRow>
                  <ResumenRow label="Ítems">
                    <span className="font-mono text-sm">{items.length}</span>
                  </ResumenRow>

                  <div className="border-t border-dashed border-emerald-200 dark:border-emerald-800 pt-3 space-y-2">
                    <TotalRow
                      label="Subtotal bruto"
                      value={formatCurrency(totals.gross)}
                    />
                    <TotalRow
                      label="Descuentos"
                      value={`- ${formatCurrency(totals.descuento)}`}
                      tone="amber"
                    />
                    <TotalRow
                      label="Base gravable"
                      value={formatCurrency(totals.gross - totals.descuento)}
                      muted
                    />
                    <TotalRow
                      label="IVA descontable"
                      value={formatCurrency(totals.iva)}
                      tone="teal"
                    />
                    <div className="border-t pt-3 mt-3">
                      <TotalRow
                        label="Total a pagar"
                        value={formatCurrency(totals.total)}
                        big
                        tone="emerald"
                      />
                    </div>
                  </div>

                  {/* Validación */}
                  {!validacion.ok ? (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="text-xs">{validacion.msg}</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="text-xs">
                        Listo para registrar. Se actualizará inventario y CxP.
                      </span>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      type="button"
                      onClick={submit}
                      disabled={submitting || !validacion.ok}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Registrando...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Registrar compra
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetForm}
                      disabled={submitting}
                      className="w-full"
                    >
                      Limpiar formulario
                    </Button>
                  </div>

                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 text-center pt-1">
                    La acción registra la factura de compra, da entrada al inventario en
                    la bodega destino, genera IVA descontable y crea saldo en CxP.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ============ Diálogo Crear proveedor ============ */}
      <Dialog
        open={openNuevoProv}
        onOpenChange={(o) => {
          if (!savingProv) setOpenNuevoProv(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Crear proveedor
            </DialogTitle>
            <DialogDescription>
              Registre un nuevo proveedor. Quedará disponible para seleccionarlo
              inmediatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="np-nombre">
                Nombre / Razón social <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="np-nombre"
                value={nuevoProvNombre}
                onChange={(e) => setNuevoProvNombre(e.target.value)}
                placeholder="Ej. Distribuidora Marsella S.A.S."
                disabled={savingProv}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) guardarProveedor();
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="np-nit">
                  NIT <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="np-nit"
                  value={nuevoProvNIT}
                  onChange={(e) => setNuevoProvNIT(e.target.value)}
                  placeholder="900.123.456"
                  disabled={savingProv}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-dv">Dígito</Label>
                <Input
                  id="np-dv"
                  value={nuevoProvDigito}
                  onChange={(e) => setNuevoProvDigito(e.target.value)}
                  placeholder="7"
                  maxLength={1}
                  disabled={savingProv}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenNuevoProv(false)}
              disabled={savingProv}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={guardarProveedor}
              disabled={savingProv}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {savingProv ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar proveedor
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Subcomponentes visuales del resumen
// ============================================================

function ResumenRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span className="text-right min-w-0 truncate">{children}</span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  big = false,
  muted = false,
  tone,
}: {
  label: string;
  value: string;
  big?: boolean;
  muted?: boolean;
  tone?: "emerald" | "teal" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "teal"
        ? "text-teal-700 dark:text-teal-400"
        : tone === "amber"
          ? "text-amber-700 dark:text-amber-400"
          : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          big ? "text-sm font-semibold" : "text-xs",
          muted ? "text-neutral-500 dark:text-neutral-400" : "",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          big ? "text-xl font-bold" : "text-sm font-medium",
          toneClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}
