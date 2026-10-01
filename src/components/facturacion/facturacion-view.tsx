"use client";

// ============================================================
// ERP Marsella — Vista de Facturación de Venta
// Tabs: Facturas emitidas | Nueva factura
//
// Backend:
//   GET  /api/facturas          (lista paginada + búsqueda por q)
//   POST /api/facturas          (crea factura, calcula CUFE/QR/XML,
//                               descuenta inventario, asiento contable)
//   GET  /api/terceros           (clientes)
//   GET  /api/productos         (con saldos por bodega)
//   GET  /api/bodegas
//   POST /api/terceros          (crea cliente en línea)
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Save,
  Receipt,
  ListChecks,
  UserPlus,
  Banknote,
  CreditCard,
  Wallet,
  CalendarClock,
  Package,
  Printer,
  FileText,
  X,
  CheckCircle2,
  ShoppingCart,
  Keyboard,
  Store,
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";

// ---------- Tipos ----------

interface Tercero {
  id: string;
  tipo: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  nombreComercial?: string | null;
}

interface ProductoSaldo {
  id: string;
  bodegaId: string;
  cantidad: number;
}

interface Producto {
  id: string;
  codigo: string;
  codigoBarras?: string | null;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  tarifaIva: number;
  precio1: number;
  precio2: number;
  precio3: number;
  unidadMedida?: { codigo: string; nombre: string } | null;
  bodegas?: ProductoSaldo[];
}

interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
}

interface FacturaItem {
  id: string;
  numero: string;
  fecha: string;
  nombreCliente: string;
  nitCliente: string;
  subtotalBruto: number;
  totalIva: number;
  total: number;
  estadoDIAN: string;
  formaPago?: string | null;
  saldoPendiente: number;
  estadoCartera: string;
  esPOS?: boolean;
}

interface ItemLine {
  key: string;
  productoId?: string;
  codigo?: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  descuentoPorcentaje: number;
  tarifaIva: number;
  bodegaId?: string;
}

type FormaPago = "efectivo" | "tarjeta" | "transferencia" | "credito" | "mixto";

// ---------- Helpers ----------

const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function formatCurrency(amount: number) {
  if (!Number.isFinite(amount)) amount = 0;
  return fmt.format(amount);
}

function formatDate(iso: string | Date) {
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

function datePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

let _keyCounter = 0;
function nextKey() {
  _keyCounter += 1;
  return `it-${Date.now()}-${_keyCounter}`;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeLine(l: ItemLine) {
  const gross = round2(l.cantidad * l.precioUnitario);
  const descuento = round2(gross * (l.descuentoPorcentaje / 100));
  const subtotal = round2(gross - descuento);
  const iva = round2(subtotal * (l.tarifaIva / 100));
  const total = round2(subtotal + iva);
  return { gross, descuento, subtotal, iva, total };
}

function computeTotals(items: ItemLine[]) {
  let subtotalBruto = 0;
  let descuentoTotal = 0;
  let subtotalNeto = 0;
  let totalIva = 0;
  let total = 0;
  for (const l of items) {
    const c = computeLine(l);
    subtotalBruto += c.gross;
    descuentoTotal += c.descuento;
    subtotalNeto += c.subtotal;
    totalIva += c.iva;
    total += c.total;
  }
  return {
    subtotalBruto: round2(subtotalBruto),
    descuentoTotal: round2(descuentoTotal),
    subtotalNeto: round2(subtotalNeto),
    totalIva: round2(totalIva),
    total: round2(total),
  };
}

// ---------- Badges ----------

function estadoDianBadge(estado: string) {
  const map: Record<string, string> = {
    procesado:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    aceptado:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    borrador:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    rechazado:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <Badge variant="outline" className={map[estado] ?? ""}>
      {estado}
    </Badge>
  );
}

function carteraBadge(estado: string, saldo: number) {
  if (saldo <= 0 || estado === "pagada") {
    return (
      <Badge
        variant="outline"
        className="border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
      >
        Pagada
      </Badge>
    );
  }
  if (estado === "vencida") {
    return (
      <Badge
        variant="outline"
        className="border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
      >
        Vencida
      </Badge>
    );
  }
  if (estado === "parcial") {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      >
        Parcial
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
    >
      Pendiente
    </Badge>
  );
}

function formaPagoBadge(fp?: string | null) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    efectivo: {
      label: "Efectivo",
      cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
      Icon: Banknote,
    },
    tarjeta: {
      label: "Tarjeta",
      cls: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
      Icon: CreditCard,
    },
    transferencia: {
      label: "Transferencia",
      cls: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
      Icon: Wallet,
    },
    credito: {
      label: "Crédito",
      cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      Icon: CalendarClock,
    },
    mixto: {
      label: "Mixto",
      cls: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
      Icon: Wallet,
    },
  };
  if (!fp || !map[fp]) {
    return <Badge variant="outline">—</Badge>;
  }
  const { label, cls, Icon } = map[fp];
  return (
    <Badge variant="outline" className={cls}>
      <Icon className="size-3 mr-1" />
      {label}
    </Badge>
  );
}

// ============================================================
// Componente principal
// ============================================================
export function FacturacionView() {
  const [tab, setTab] = useState<string>("lista");

  return (
    <div className="w-full">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Receipt className="size-5 text-emerald-600 dark:text-emerald-400" />
              Facturación de Venta
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Emisión de facturas electrónicas (DIAN) y POS, con cálculo de
              CUFE, inventario y asiento contable automático.
            </p>
          </div>
          <TabsList className="self-start">
            <TabsTrigger value="lista" className="gap-2">
              <ListChecks className="size-4" />
              Facturas emitidas
            </TabsTrigger>
            <TabsTrigger value="nueva" className="gap-2">
              <Plus className="size-4" />
              Nueva factura
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="lista" className="mt-0">
          <ListaFacturas onGoNew={() => setTab("nueva")} />
        </TabsContent>

        <TabsContent value="nueva" className="mt-0">
          <NuevaFactura onDone={() => setTab("lista")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Tab 1 — Facturas emitidas
// ============================================================
function ListaFacturas({ onGoNew }: { onGoNew: () => void }) {
  const [facturas, setFacturas] = useState<FacturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const cargar = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = new URL("/api/facturas", window.location.origin);
      url.searchParams.set("pageSize", "100");
      if (q) url.searchParams.set("q", q);
      const r = await fetch(url.toString());
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setFacturas((d.items ?? []) as FacturaItem[]);
    } catch (e: any) {
      toast.error("No se pudo listar facturas", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    cargar(debouncedSearch || undefined);
  }, [debouncedSearch, cargar]);

  const filtered = useMemo(() => {
    return facturas;
  }, [facturas]);

  return (
    <Card className="border-neutral-200 dark:border-neutral-800">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="size-4 text-emerald-600 dark:text-emerald-400" />
              Documentos emitidos
            </CardTitle>
            <CardDescription>
              Facturas electrónicas y POS registradas ante la DIAN.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar número / cliente / NIT"
                className="pl-8 w-full sm:w-72"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => cargar(debouncedSearch || undefined)}
              title="Refrescar"
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              onClick={onGoNew}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nueva</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                <TableRow>
                  <TableHead className="min-w-[120px]">Número</TableHead>
                  <TableHead className="min-w-[110px]">Fecha</TableHead>
                  <TableHead className="min-w-[200px]">Cliente</TableHead>
                  <TableHead className="text-right min-w-[120px]">Subtotal</TableHead>
                  <TableHead className="text-right min-w-[110px]">IVA</TableHead>
                  <TableHead className="text-right min-w-[130px]">Total</TableHead>
                  <TableHead className="text-center min-w-[110px]">DIAN</TableHead>
                  <TableHead className="text-center min-w-[120px]">Forma pago</TableHead>
                  <TableHead className="text-right min-w-[120px]">Saldo</TableHead>
                  <TableHead className="text-center min-w-[110px]">Cartera</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                      No hay facturas registradas. Crea la primera.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  filtered.map((f) => (
                    <TableRow key={f.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60">
                      <TableCell className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="inline-flex items-center gap-1">
                          {f.esPOS && <Store className="size-3 text-teal-600 dark:text-teal-400" />}
                          {f.numero}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(f.fecha)}</TableCell>
                      <TableCell>
                        <div className="font-medium leading-tight">{f.nombreCliente}</div>
                        <div className="text-xs text-muted-foreground">NIT {f.nitCliente}</div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatCurrency(f.subtotalBruto)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatCurrency(f.totalIva)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(f.total)}
                      </TableCell>
                      <TableCell className="text-center">{estadoDianBadge(f.estadoDIAN)}</TableCell>
                      <TableCell className="text-center">
                        {formaPagoBadge(f.formaPago)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {f.saldoPendiente > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">
                            {formatCurrency(f.saldoPendiente)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {carteraBadge(f.estadoCartera, f.saldoPendiente)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 2 — Nueva factura (POS-like)
// ============================================================
interface NuevaFacturaProps {
  onDone: () => void;
}
function NuevaFactura({ onDone }: NuevaFacturaProps) {
  // Catálogos
  const [clientes, setClientes] = useState<Tercero[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);

  // Form state
  const [clienteSel, setClienteSel] = useState<Tercero | null>(null);
  const [clienteComboboxOpen, setClienteComboboxOpen] = useState(false);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteNIT, setNuevoClienteNIT] = useState("");
  const [creatingCliente, setCreatingCliente] = useState(false);

  const [esPOS, setEsPOS] = useState(false);
  const [formaPago, setFormaPago] = useState<FormaPago>("efectivo");
  const [efectivoRecibido, setEfectivoRecibido] = useState<number>(0);
  const [fechaVencimiento, setFechaVencimiento] = useState<string>(datePlusDays(30));
  const [bodegaId, setBodegaId] = useState<string>("");
  const [observaciones, setObservaciones] = useState("");

  // Items
  const [items, setItems] = useState<ItemLine[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);

  // Quick add (código o combobox de producto)
  const [quickCode, setQuickCode] = useState("");
  const [productoComboboxOpen, setProductoComboboxOpen] = useState(false);
  const quickCodeRef = useRef<HTMLInputElement>(null);

  // Save
  const [saving, setSaving] = useState(false);
  const [exito, setExito] = useState<{
    numero: string;
    cufe?: string;
    total: number;
    cambio?: number;
  } | null>(null);

  // ---------- Carga catálogos ----------
  const cargarClientes = useCallback(async () => {
    try {
      const r = await fetch("/api/terceros?pageSize=200&tipo=cliente");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setClientes((d.items ?? []) as Tercero[]);
    } catch (e: any) {
      toast.error("No se pudo cargar clientes", { description: e?.message });
    }
  }, []);

  const cargarProductos = useCallback(async () => {
    try {
      const r = await fetch("/api/productos?pageSize=500");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setProductos((d.items ?? []) as Producto[]);
    } catch (e: any) {
      toast.error("No se pudo cargar productos", { description: e?.message });
    }
  }, []);

  const cargarBodegas = useCallback(async () => {
    try {
      const r = await fetch("/api/bodegas");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setBodegas((d ?? []) as Bodega[]);
    } catch (e: any) {
      toast.error("No se pudo cargar bodegas", { description: e?.message });
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingCatalogos(true);
      await Promise.all([cargarClientes(), cargarProductos(), cargarBodegas()]);
      setLoadingCatalogos(false);
    })();
  }, [cargarClientes, cargarProductos, cargarBodegas]);

  // Default bodega si solo hay una
  useEffect(() => {
    if (bodegas.length === 1 && !bodegaId) {
      setBodegaId(bodegas[0].id);
    }
  }, [bodegas, bodegaId]);

  // ---------- Items helpers ----------
  const addProductoById = useCallback(
    (productoId: string, cantidad = 1) => {
      const p = productos.find((x) => x.id === productoId);
      if (!p) {
        toast.error("Producto no encontrado");
        return;
      }
      setItems((prev) => {
        // si ya existe, suma cantidad
        const idx = prev.findIndex((i) => i.productoId === productoId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], cantidad: round2(copy[idx].cantidad + cantidad) };
          return copy;
        }
        return [
          ...prev,
          {
            key: nextKey(),
            productoId: p.id,
            codigo: p.codigo,
            descripcion: p.descripcion || p.nombre,
            cantidad,
            unidadMedida: p.unidadMedida?.codigo ?? "UND",
            precioUnitario: p.precio1,
            descuentoPorcentaje: 0,
            tarifaIva: p.tarifaIva,
            bodegaId: bodegaId || undefined,
          },
        ];
      });
    },
    [productos, bodegaId],
  );

  const addProductoByCode = useCallback(
    (codigo: string) => {
      const code = codigo.trim();
      if (!code) return;
      const p = productos.find(
        (x) => x.codigo.toLowerCase() === code.toLowerCase() || (x.codigoBarras ?? "").toLowerCase() === code.toLowerCase(),
      );
      if (!p) {
        toast.error("Código no encontrado", { description: `"${code}"` });
        return;
      }
      addProductoById(p.id, 1);
      setQuickCode("");
      quickCodeRef.current?.focus();
    },
    [productos, addProductoById],
  );

  const addManualItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        descripcion: "",
        cantidad: 1,
        unidadMedida: "UND",
        precioUnitario: 0,
        descuentoPorcentaje: 0,
        tarifaIva: 19,
        bodegaId: bodegaId || undefined,
      },
    ]);
  }, [bodegaId]);

  const updateItem = useCallback((key: string, patch: Partial<ItemLine>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
    setSelectedItemKey((cur) => (cur === key ? null : cur));
  }, []);

  const removeSelected = useCallback(() => {
    if (!selectedItemKey) return;
    removeItem(selectedItemKey);
  }, [selectedItemKey, removeItem]);

  // ---------- Totales ----------
  const totales = useMemo(() => computeTotals(items), [items]);
  const cambio = useMemo(() => {
    if (formaPago !== "efectivo") return 0;
    return round2((efectivoRecibido || 0) - totales.total);
  }, [formaPago, efectivoRecibido, totales.total]);

  // ---------- Crear cliente en línea ----------
  const crearClienteInline = useCallback(async () => {
    const nombre = nuevoClienteNombre.trim();
    const nit = nuevoClienteNIT.trim();
    if (nombre.length < 2) {
      toast.error("El nombre del cliente es obligatorio");
      return;
    }
    if (nit.length < 3) {
      toast.error("El NIT/documento del cliente es obligatorio");
      return;
    }
    setCreatingCliente(true);
    try {
      const r = await fetch("/api/terceros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "cliente",
          tipoDocumento: nit.length > 5 ? "NIT" : "CC",
          numeroDocumento: nit,
          nombre,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      const nuevo = d as Tercero;
      await cargarClientes();
      setClienteSel(nuevo);
      setShowNuevoCliente(false);
      setNuevoClienteNombre("");
      setNuevoClienteNIT("");
      setClienteComboboxOpen(false);
      toast.success("Cliente creado", { description: `${nuevo.nombre} · ${nuevo.numeroDocumento}` });
    } catch (e: any) {
      toast.error("No se pudo crear el cliente", { description: e?.message });
    } finally {
      setCreatingCliente(false);
    }
  }, [nuevoClienteNombre, nuevoClienteNIT, cargarClientes]);

  // ---------- Submit ----------
  const canSubmit = useMemo(() => {
    if (items.length === 0) return false;
    if (!clienteSel && !(nuevoClienteNombre.trim() && nuevoClienteNIT.trim())) {
      // Si no hay cliente seleccionado pero hay cliente nuevo abierto y completo, permitimos
      if (!(showNuevoCliente && nuevoClienteNombre.trim() && nuevoClienteNIT.trim())) {
        return false;
      }
    }
    // Validar items: descripción y cantidad > 0
    for (const it of items) {
      if (!it.descripcion.trim()) return false;
      if (!(it.cantidad > 0)) return false;
      if (!(it.precioUnitario >= 0)) return false;
    }
    if (formaPago === "efectivo" && efectivoRecibido < totales.total) return false;
    return true;
  }, [
    items,
    clienteSel,
    showNuevoCliente,
    nuevoClienteNombre,
    nuevoClienteNIT,
    formaPago,
    efectivoRecibido,
    totales.total,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    // Resolver cliente final
    let terceroId: string | undefined;
    let nombreCliente: string;
    let nitCliente: string;
    if (clienteSel) {
      terceroId = clienteSel.id;
      nombreCliente = clienteSel.nombre;
      nitCliente = clienteSel.numeroDocumento;
    } else if (showNuevoCliente && nuevoClienteNombre.trim() && nuevoClienteNIT.trim()) {
      // Crear cliente antes de emitir
      setCreatingCliente(true);
      try {
        const r = await fetch("/api/terceros", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "cliente",
            tipoDocumento: nuevoClienteNIT.trim().length > 5 ? "NIT" : "CC",
            numeroDocumento: nuevoClienteNIT.trim(),
            nombre: nuevoClienteNombre.trim(),
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Error al crear cliente");
        terceroId = (d as Tercero).id;
        nombreCliente = (d as Tercero).nombre;
        nitCliente = (d as Tercero).numeroDocumento;
      } catch (e: any) {
        toast.error("No se pudo crear el cliente", { description: e?.message });
        setCreatingCliente(false);
        return;
      }
      setCreatingCliente(false);
    } else {
      toast.error("Selecciona o crea un cliente");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        terceroId,
        nombreCliente,
        nitCliente,
        items: items.map((it) => ({
          productoId: it.productoId,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          unidadMedida: it.unidadMedida,
          precioUnitario: it.precioUnitario,
          descuentoPorcentaje: it.descuentoPorcentaje,
          tarifaIva: it.tarifaIva,
          bodegaId: it.bodegaId,
        })),
        esPOS,
        formaPago,
        observaciones: observaciones.trim() || undefined,
      };
      if (formaPago === "efectivo") {
        payload.efectivoRecibido = efectivoRecibido;
      }
      if (formaPago === "credito") {
        payload.fechaVencimiento = fechaVencimiento;
      }

      const r = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? "Error al emitir factura");
      }
      const f = d as any;
      setExito({
        numero: f.numero,
        cufe: f.cufe,
        total: f.total,
        cambio: f.cambio,
      });
      toast.success("Factura emitida", {
        description: `${f.numero} · ${formatCurrency(f.total)}`,
      });
      // Reset
      setItems([]);
      setSelectedItemKey(null);
      setEfectivoRecibido(0);
      setObservaciones("");
      setClienteSel(null);
      setShowNuevoCliente(false);
      setNuevoClienteNombre("");
      setNuevoClienteNIT("");
    } catch (e: any) {
      toast.error("No se pudo emitir factura", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }, [
    canSubmit,
    clienteSel,
    showNuevoCliente,
    nuevoClienteNombre,
    nuevoClienteNIT,
    items,
    esPOS,
    formaPago,
    efectivoRecibido,
    fechaVencimiento,
    observaciones,
  ]);

  // ---------- Atajos de teclado ----------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F2 → guardar
      if (e.key === "F2") {
        e.preventDefault();
        if (!saving) handleSubmit();
        return;
      }
      // Supr/Delete → eliminar fila seleccionada (no cuando focus en input)
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((e.key === "Delete" || e.key === "Del") && !inInput) {
        if (selectedItemKey) {
          e.preventDefault();
          removeSelected();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit, saving, selectedItemKey, removeSelected]);

  // ---------- Render ----------
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Columna izquierda: cliente + pago */}
      <div className="lg:col-span-1 space-y-4">
        <Card className="border-neutral-200 dark:border-neutral-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="size-4 text-emerald-600 dark:text-emerald-400" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Cliente</Label>
              <Popover open={clienteComboboxOpen} onOpenChange={setClienteComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {clienteSel
                      ? `${clienteSel.nombre} · ${clienteSel.numeroDocumento}`
                      : "Seleccionar cliente…"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar nombre o NIT…" />
                    <CommandList>
                      <CommandEmpty>No hay coincidencias.</CommandEmpty>
                      <CommandGroup heading="Clientes">
                        {clientes.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.nombre} ${c.numeroDocumento}`}
                            onSelect={() => {
                              setClienteSel(c);
                              setShowNuevoCliente(false);
                              setClienteComboboxOpen(false);
                            }}
                          >
                            <div className="flex flex-col">
                              <span>{c.nombre}</span>
                              <span className="text-xs text-muted-foreground">
                                {c.numeroDocumento}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  <Separator />
                  <div className="p-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed"
                      onClick={() => {
                        setShowNuevoCliente(true);
                        setClienteSel(null);
                        setClienteComboboxOpen(false);
                      }}
                    >
                      <UserPlus className="size-4" />
                      Crear cliente en línea
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {showNuevoCliente && (
              <div className="rounded-md border border-dashed border-emerald-300 dark:border-emerald-800 p-3 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Nuevo cliente
                  </Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setShowNuevoCliente(false)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">Nombre / Razón social</Label>
                  <Input
                    value={nuevoClienteNombre}
                    onChange={(e) => setNuevoClienteNombre(e.target.value)}
                    placeholder="Ej. Comercial Marsella S.A.S"
                  />
                </div>
                <div>
                  <Label className="text-xs">NIT / Documento</Label>
                  <Input
                    value={nuevoClienteNIT}
                    onChange={(e) => setNuevoClienteNIT(e.target.value)}
                    placeholder="900.123.456-7"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={crearClienteInline}
                  disabled={creatingCliente}
                >
                  {creatingCliente ? "Guardando…" : "Guardar cliente"}
                </Button>
              </div>
            )}

            {!showNuevoCliente && clienteSel && (
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 text-sm bg-neutral-50 dark:bg-neutral-900/40">
                <div className="font-medium">{clienteSel.nombre}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Doc: {clienteSel.numeroDocumento} · Tipo: {clienteSel.tipoDocumento}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-neutral-200 dark:border-neutral-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="size-4 text-emerald-600 dark:text-emerald-400" />
              Tipo y forma de pago
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Tipo de factura</Label>
              <ToggleGroup
                type="single"
                value={esPOS ? "pos" : "estandar"}
                onValueChange={(v) => v && setEsPOS(v === "pos")}
                variant="outline"
                className="w-full"
              >
                <ToggleGroupItem value="estandar" className="flex-1">
                  <FileText className="size-4 mr-1.5" />
                  Estándar
                </ToggleGroupItem>
                <ToggleGroupItem value="pos" className="flex-1">
                  <Store className="size-4 mr-1.5" />
                  POS
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div>
              <Label className="text-xs">Forma de pago</Label>
              <div className="grid grid-cols-2 gap-2">
                <FormaPagoButton
                  active={formaPago === "efectivo"}
                  onClick={() => setFormaPago("efectivo")}
                  icon={<Banknote className="size-4" />}
                  label="Efectivo"
                />
                <FormaPagoButton
                  active={formaPago === "tarjeta"}
                  onClick={() => setFormaPago("tarjeta")}
                  icon={<CreditCard className="size-4" />}
                  label="Tarjeta"
                />
                <FormaPagoButton
                  active={formaPago === "transferencia"}
                  onClick={() => setFormaPago("transferencia")}
                  icon={<Wallet className="size-4" />}
                  label="Transferencia"
                />
                <FormaPagoButton
                  active={formaPago === "credito"}
                  onClick={() => setFormaPago("credito")}
                  icon={<CalendarClock className="size-4" />}
                  label="Crédito"
                />
              </div>
            </div>

            {formaPago === "efectivo" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Efectivo recibido</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={efectivoRecibido || ""}
                    onChange={(e) =>
                      setEfectivoRecibido(parseFloat(e.target.value) || 0)
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Cambio</Label>
                  <div
                    className={`h-9 rounded-md border px-3 flex items-center text-sm font-semibold ${
                      cambio < 0
                        ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    }`}
                  >
                    {formatCurrency(cambio)}
                  </div>
                </div>
              </div>
            )}

            {formaPago === "credito" && (
              <div>
                <Label className="text-xs">Fecha de vencimiento</Label>
                <Input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Default: hoy + 30 días. La factura generará cartera pendiente.
                </p>
              </div>
            )}

            {bodegas.length > 1 && (
              <div>
                <Label className="text-xs">Bodega</Label>
                <Select value={bodegaId} onValueChange={setBodegaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar bodega" />
                  </SelectTrigger>
                  <SelectContent>
                    {bodegas.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.codigo} · {b.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Observaciones</Label>
              <Input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 dark:border-neutral-800 bg-emerald-50/40 dark:bg-emerald-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <Keyboard className="size-3.5" />
              Atajos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground space-y-1 pt-0">
            <div className="flex justify-between">
              <span>Buscar producto por código</span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700">Enter</kbd>
            </div>
            <div className="flex justify-between">
              <span>Eliminar fila seleccionada</span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700">Supr</kbd>
            </div>
            <div className="flex justify-between">
              <span>Emitir factura</span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700">F2</kbd>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Columna derecha: items + totales */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="border-neutral-200 dark:border-neutral-800">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingCart className="size-4 text-emerald-600 dark:text-emerald-400" />
                  Items de la factura
                </CardTitle>
                <CardDescription>
                  Agrega productos por código/barras o seleccionando del catálogo.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Popover open={productoComboboxOpen} onOpenChange={setProductoComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Package className="size-4" />
                      <span className="hidden sm:inline">Catálogo</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Buscar por nombre o código…" />
                      <CommandList>
                        <CommandEmpty>No hay productos.</CommandEmpty>
                        <CommandGroup>
                          {productos.slice(0, 200).map((p) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.codigo} ${p.nombre}`}
                              onSelect={() => {
                                addProductoById(p.id, 1);
                                setProductoComboboxOpen(false);
                                quickCodeRef.current?.focus();
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                                  {p.codigo}
                                </span>
                                <span>{p.nombre}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(p.precio1)} · IVA {p.tarifaIva}%
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={addManualItem}>
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Item manual</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Quick add por código */}
            <div className="flex gap-2">
              <Input
                ref={quickCodeRef}
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addProductoByCode(quickCode);
                  }
                }}
                placeholder="Escriba código o código de barras y presione Enter"
                disabled={loadingCatalogos}
              />
              <Button
                onClick={() => addProductoByCode(quickCode)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={loadingCatalogos}
              >
                <Plus className="size-4" />
                Agregar
              </Button>
            </div>

            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-auto">
              <div className="max-h-[48vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                    <TableRow>
                      <TableHead className="w-[110px]">Código</TableHead>
                      <TableHead className="min-w-[220px]">Descripción</TableHead>
                      <TableHead className="w-[80px] text-right">Cant.</TableHead>
                      <TableHead className="w-[120px] text-right">Precio</TableHead>
                      <TableHead className="w-[80px] text-right">Desc %</TableHead>
                      <TableHead className="w-[80px] text-right">IVA %</TableHead>
                      <TableHead className="w-[110px] text-right">Subtotal</TableHead>
                      <TableHead className="w-[110px] text-right">IVA</TableHead>
                      <TableHead className="w-[120px] text-right">Total</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                          Sin items. Agrega productos por código o usa el catálogo.
                        </TableCell>
                      </TableRow>
                    )}
                    {items.map((it) => {
                      const c = computeLine(it);
                      const isSelected = selectedItemKey === it.key;
                      return (
                        <TableRow
                          key={it.key}
                          data-state={isSelected ? "selected" : undefined}
                          onClick={() => setSelectedItemKey(it.key)}
                          className={`cursor-pointer ${isSelected ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
                        >
                          <TableCell className="font-mono text-xs">
                            {it.codigo ?? (
                              <span className="text-muted-foreground italic">manual</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={it.descripcion}
                              onChange={(e) => updateItem(it.key, { descripcion: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              className="h-8"
                              placeholder="Descripción del item"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={it.cantidad || ""}
                              onChange={(e) =>
                                updateItem(it.key, { cantidad: parseFloat(e.target.value) || 0 })
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 w-16 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={it.precioUnitario || ""}
                              onChange={(e) =>
                                updateItem(it.key, { precioUnitario: parseFloat(e.target.value) || 0 })
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 w-28 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="any"
                              value={it.descuentoPorcentaje || ""}
                              onChange={(e) =>
                                updateItem(it.key, {
                                  descuentoPorcentaje: parseFloat(e.target.value) || 0,
                                })
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 w-16 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Select
                              value={String(it.tarifaIva)}
                              onValueChange={(v) =>
                                updateItem(it.key, { tarifaIva: parseFloat(v) })
                              }
                            >
                              <SelectTrigger
                                className="h-8 w-20"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[0, 5, 19].map((p) => (
                                  <SelectItem key={p} value={String(p)}>
                                    {p}%
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatCurrency(c.subtotal)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatCurrency(c.iva)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">
                            {formatCurrency(c.total)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-rose-600 hover:text-rose-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeItem(it.key);
                              }}
                              title="Eliminar fila"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal bruto:</span>
                  <span className="font-mono">{formatCurrency(totales.subtotalBruto)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descuento total:</span>
                  <span className="font-mono text-rose-600 dark:text-rose-400">
                    − {formatCurrency(totales.descuentoTotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal neto:</span>
                  <span className="font-mono">{formatCurrency(totales.subtotalNeto)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA:</span>
                  <span className="font-mono">{formatCurrency(totales.totalIva)}</span>
                </div>
              </div>
              <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex flex-col justify-center">
                <div className="text-xs text-emerald-700 dark:text-emerald-400">Total</div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                  {formatCurrency(totales.total)}
                </div>
                {formaPago === "efectivo" && efectivoRecibido > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Cambio:{" "}
                    <span
                      className={
                        cambio < 0
                          ? "text-rose-600 dark:text-rose-400 font-semibold"
                          : "text-emerald-700 dark:text-emerald-300 font-semibold"
                      }
                    >
                      {formatCurrency(cambio)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Validación resumen */}
            {items.length > 0 && !canSubmit && (
              <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <div>
                  {clienteSel || (showNuevoCliente && nuevoClienteNombre.trim() && nuevoClienteNIT.trim())
                    ? "Revisa que todos los items tengan descripción y cantidad mayor a 0."
                    : "Selecciona o crea un cliente para emitir la factura."}
                  {formaPago === "efectivo" && efectivoRecibido < totales.total && (
                    <> El efectivo recibido es menor al total.</>
                  )}
                </div>
              </div>
            )}

            {/* Botón emitir */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  setItems([]);
                  setSelectedItemKey(null);
                  setEfectivoRecibido(0);
                  setObservaciones("");
                  setClienteSel(null);
                }}
                disabled={saving || items.length === 0}
              >
                <X className="size-4" />
                Limpiar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Emitir factura
                <kbd className="ml-1 px-1.5 py-0.5 rounded bg-emerald-700/50 text-[10px]">F2</kbd>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de éxito */}
      <Dialog open={!!exito} onOpenChange={(o) => !o && setExito(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
              Factura emitida
            </DialogTitle>
            <DialogDescription>
              La factura fue registrada exitosamente ante la DIAN.
            </DialogDescription>
          </DialogHeader>
          {exito && (
            <div className="space-y-3">
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Número</span>
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {exito.numero}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-mono">{formatCurrency(exito.total)}</span>
                </div>
                {exito.cambio !== undefined && exito.cambio > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cambio</span>
                    <span className="font-mono">{formatCurrency(exito.cambio)}</span>
                  </div>
                )}
                {exito.cufe && (
                  <div>
                    <span className="text-muted-foreground text-xs">CUFE</span>
                    <div className="font-mono text-[10px] break-all bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded p-2 mt-1">
                      {exito.cufe}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                toast.info("Impresión", {
                  description: "La impresión de la factura electrónica será habilitada próximamente.",
                });
              }}
            >
              <Printer className="size-4" />
              Imprimir
            </Button>
            <Button
              onClick={() => {
                setExito(null);
                onDone();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Ver facturas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Subcomponente: botón de forma de pago
// ============================================================
interface FormaPagoButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}
function FormaPagoButton({ active, onClick, icon, label }: FormaPagoButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 h-10 rounded-md border text-sm transition-colors ${
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
