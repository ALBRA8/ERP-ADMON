"use client";

// ============================================================
// ERP Marsella — Vista de Restaurante
// Tabs: Mapa de mesas | Comandas abiertas | Historial | Configuración mesas
// Acento emerald/teal, dark mode, responsive mobile-first.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  UtensilsCrossed,
  Plus,
  RefreshCw,
  Grid3x3,
  ListOrdered,
  History,
  Settings2,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  ChefHat,
  Bell,
  Ban,
  FileText,
  Trash2,
  Edit3,
  Save,
  ArrowRightCircle,
  ShoppingCart,
  CircleDot,
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Helpers de formato ----------
const fmtFechaHora = (iso: string | Date | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const fmtFechaCorta = (iso: string | Date | null | undefined) => {
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
interface Mesa {
  id: string;
  codigo: string;
  nombre: string;
  capacidad: number;
  ubicacion?: string | null;
  posicionX: number;
  posicionY: number;
  estado: "disponible" | "ocupada" | "reservada" | "inactiva";
  comandaActiva?: Comanda | null;
}

interface DetalleComanda {
  id: string;
  productoId?: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  observaciones?: string | null;
  estado: "solicitado" | "preparando" | "listo" | "servido" | "anulado";
  horaSolicitud: string;
  horaListo?: string | null;
}

interface Comanda {
  id: string;
  mesaId: string;
  meseroId?: string | null;
  estado: "abierta" | "facturada" | "anulada" | "cerrada";
  fechaApertura: string;
  fechaCierre?: string | null;
  total: number;
  observaciones?: string | null;
  detalles: DetalleComanda[];
  mesa?: Mesa;
  itemsPendientes?: number;
}

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio1: number;
  precio2: number;
  precio3: number;
  tarifaIva?: number;
}

interface Tercero {
  id: string;
  nombre: string;
  numeroDocumento: string;
  tipo: string;
}

interface Mesero {
  id: string;
  nombre: string;
}

// ---------- Constantes de UI ----------
const ESTADO_MESA: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  disponible: {
    label: "Disponible",
    color:
      "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  ocupada: {
    label: "Ocupada",
    color:
      "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  reservada: {
    label: "Reservada",
    color:
      "bg-violet-50 dark:bg-violet-950/30 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  inactiva: {
    label: "Inactiva",
    color:
      "bg-neutral-100 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400",
    dot: "bg-neutral-400",
  },
};

const ESTADO_ITEM: Record<
  string,
  { label: string; color: string; Icon: React.ElementType }
> = {
  solicitado: {
    label: "Solicitado",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    Icon: Bell,
  },
  preparando: {
    label: "Preparando",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    Icon: ChefHat,
  },
  listo: {
    label: "Listo",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  servido: {
    label: "Servido",
    color:
      "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
    Icon: UtensilsCrossed,
  },
  anulado: {
    label: "Anulado",
    color:
      "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    Icon: XCircle,
  },
};

const ESTADO_COMANDA: Record<
  string,
  { label: string; color: string; Icon: React.ElementType }
> = {
  abierta: {
    label: "Abierta",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    Icon: Clock,
  },
  facturada: {
    label: "Facturada",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  anulada: {
    label: "Anulada",
    color:
      "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    Icon: XCircle,
  },
  cerrada: {
    label: "Cerrada",
    color:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
    Icon: CheckCircle2,
  },
};

// ---------- Fetch helpers ----------
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Error al consultar");
  return json as T;
}

async function apiPost<T>(
  url: string,
  body: any,
  method = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Error al procesar");
  return json as T;
}

// ---------- KPI ----------
function KPI({
  label,
  value,
  icon: Icon,
  accent = "emerald",
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
  accent?: "emerald" | "amber" | "rose" | "teal" | "neutral";
}) {
  const accentMap: Record<string, string> = {
    emerald:
      "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    amber:
      "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    rose:
      "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    teal:
      "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
    neutral:
      "bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
  };
  return (
    <div
      className={`rounded-lg border p-3 ${accentMap[accent]} flex items-center gap-3`}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0 opacity-80" />}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-70">
          {label}
        </div>
        <div className="text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

// ---------- Item row del Sheet ----------
interface ItemLine {
  productoId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  observaciones?: string;
}

// ============================================================
// Componente principal
// ============================================================
export function RestauranteView() {
  const [tab, setTab] = useState<string>("mapa");

  // ---- Estados de datos ----
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandasAbiertas, setComandasAbiertas] = useState<Comanda[]>([]);
  const [comandasHistorial, setComandasHistorial] = useState<Comanda[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [meseros, setMeseros] = useState<Mesero[]>([]);

  const [loadingMesas, setLoadingMesas] = useState(false);
  const [loadingAbiertas, setLoadingAbiertas] = useState(false);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // ---- Sheet comanda ----
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetComanda, setSheetComanda] = useState<Comanda | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  // ---- Dialogs ----
  const [dialogNuevaMesaOpen, setDialogNuevaMesaOpen] = useState(false);
  const [dialogEditarMesaOpen, setDialogEditarMesaOpen] = useState(false);
  const [dialogNuevaComandaOpen, setDialogNuevaComandaOpen] = useState(false);
  const [dialogAgregarItemOpen, setDialogAgregarItemOpen] = useState(false);
  const [dialogFacturarOpen, setDialogFacturarOpen] = useState(false);

  // Mesa objetivo de las acciones
  const [mesaSeleccionada, setMesaSeleccionada] = useState<Mesa | null>(null);

  // ---- Formularios ----
  // Nueva mesa
  const [fMesaCodigo, setFMesaCodigo] = useState("");
  const [fMesaNombre, setFMesaNombre] = useState("");
  const [fMesaCapacidad, setFMesaCapacidad] = useState(4);
  const [fMesaUbicacion, setFMesaUbicacion] = useState("Salón");
  const [fMesaPosX, setFMesaPosX] = useState(0);
  const [fMesaPosY, setFMesaPosY] = useState(0);

  // Nueva comanda
  const [fComMesero, setFComMesero] = useState<string>("");
  const [fComItems, setFComItems] = useState<ItemLine[]>([
    { descripcion: "", cantidad: 1, precioUnitario: 0 },
  ]);
  const [fComObs, setFComObs] = useState("");

  // Agregar item
  const [fAggProductoId, setFAggProductoId] = useState<string>("");
  const [fAggDescripcion, setFAggDescripcion] = useState("");
  const [fAggCantidad, setFAggCantidad] = useState(1);
  const [fAggPrecio, setFAggPrecio] = useState(0);
  const [fAggObs, setFAggObs] = useState("");

  // Facturar
  const [fFacTerceroId, setFFacTerceroId] = useState<string>("");
  const [fFacNombreCliente, setFFacNombreCliente] = useState("");
  const [fFacNitCliente, setFFacNitCliente] = useState("");
  const [fFacFormaPago, setFFacFormaPago] = useState("efectivo");

  // ---------- Cargas ----------
  const cargarMesas = useCallback(async () => {
    setLoadingMesas(true);
    try {
      const data = await apiGet<{ items: Mesa[] }>("/api/mesas");
      setMesas(data.items ?? []);
    } catch (e: any) {
      toast.error("Error al cargar mesas", { description: e.message });
    } finally {
      setLoadingMesas(false);
    }
  }, []);

  const cargarAbiertas = useCallback(async () => {
    setLoadingAbiertas(true);
    try {
      const data = await apiGet<{ items: Comanda[] }>(
        "/api/comandas?estado=abierta&pageSize=200",
      );
      setComandasAbiertas(data.items ?? []);
    } catch (e: any) {
      toast.error("Error al cargar comandas abiertas", {
        description: e.message,
      });
    } finally {
      setLoadingAbiertas(false);
    }
  }, []);

  const cargarHistorial = useCallback(async () => {
    setLoadingHistorial(true);
    try {
      const [fact, anul] = await Promise.all([
        apiGet<{ items: Comanda[] }>(
          "/api/comandas?estado=facturada&pageSize=200",
        ).catch(() => ({ items: [] as Comanda[] })),
        apiGet<{ items: Comanda[] }>(
          "/api/comandas?estado=anulada&pageSize=200",
        ).catch(() => ({ items: [] as Comanda[] })),
      ]);
      setComandasHistorial([...(fact.items ?? []), ...(anul.items ?? [])]);
    } catch (e: any) {
      toast.error("Error al cargar historial", { description: e.message });
    } finally {
      setLoadingHistorial(false);
    }
  }, []);

  const cargarProductos = useCallback(async () => {
    try {
      const data = await apiGet<{ items: Producto[] }>(
        "/api/productos?pageSize=500",
      );
      setProductos(data.items ?? []);
    } catch {
      /* sin toast en carga inicial */
    }
  }, []);

  const cargarTerceros = useCallback(async () => {
    try {
      const data = await apiGet<{ items: Tercero[] }>(
        "/api/terceros?tipo=cliente&pageSize=500",
      );
      setTerceros(data.items ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const cargarMeseros = useCallback(async () => {
    try {
      const data = await apiGet<{ items: Tercero[] }>(
        "/api/terceros?tipo=empleado&pageSize=500",
      );
      setMeseros(
        (data.items ?? []).map((t) => ({ id: t.id, nombre: t.nombre })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    cargarMesas();
    cargarAbiertas();
    cargarHistorial();
    cargarProductos();
    cargarTerceros();
    cargarMeseros();
  }, [
    cargarMesas,
    cargarAbiertas,
    cargarHistorial,
    cargarProductos,
    cargarTerceros,
    cargarMeseros,
  ]);

  // ---------- Acciones ----------
  const abrirSheetComanda = useCallback(async (comandaId: string) => {
    setSheetOpen(true);
    setSheetLoading(true);
    setSheetComanda(null);
    try {
      const data = await apiGet<Comanda>(`/api/comandas/${comandaId}`);
      setSheetComanda(data);
    } catch (e: any) {
      toast.error("Error al cargar comanda", { description: e.message });
      setSheetOpen(false);
    } finally {
      setSheetLoading(false);
    }
  }, []);

  const abrirComandaMesa = useCallback(
    async (mesa: Mesa) => {
      if (mesa.estado === "disponible" || mesa.estado === "reservada") {
        setMesaSeleccionada(mesa);
        setFComItems([{ descripcion: "", cantidad: 1, precioUnitario: 0 }]);
        setFComMesero("");
        setFComObs("");
        setDialogNuevaComandaOpen(true);
        return;
      }
      if (mesa.estado === "ocupada") {
        // buscar comanda abierta
        await cargarAbiertas();
        const comanda = comandasAbiertas.find((c) => c.mesaId === mesa.id);
        if (comanda) {
          await abrirSheetComanda(comanda.id);
        } else {
          // reload mesas para refrescar comandaActiva
          await cargarMesas();
          toast.info("Buscando comanda activa...");
        }
      }
    },
    [comandasAbiertas, cargarAbiertas, cargarMesas, abrirSheetComanda],
  );

  const crearMesa = async () => {
    if (!fMesaCodigo || !fMesaNombre) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    try {
      await apiPost("/api/mesas", {
        codigo: fMesaCodigo,
        nombre: fMesaNombre,
        capacidad: Number(fMesaCapacidad) || 4,
        ubicacion: fMesaUbicacion || undefined,
        posicionX: Number(fMesaPosX) || 0,
        posicionY: Number(fMesaPosY) || 0,
      });
      toast.success("Mesa creada");
      setDialogNuevaMesaOpen(false);
      setFMesaCodigo("");
      setFMesaNombre("");
      setFMesaCapacidad(4);
      setFMesaUbicacion("Salón");
      setFMesaPosX(0);
      setFMesaPosY(0);
      await cargarMesas();
    } catch (e: any) {
      toast.error("Error al crear mesa", { description: e.message });
    }
  };

  const actualizarMesa = async (id: string, data: any) => {
    try {
      await apiPost("/api/mesas", { id, ...data }, "PUT");
      toast.success("Mesa actualizada");
      await cargarMesas();
    } catch (e: any) {
      toast.error("Error al actualizar mesa", { description: e.message });
    }
  };

  const desactivarMesa = async (id: string) => {
    try {
      await apiPost(`/api/mesas/${id}`, {}, "DELETE");
      toast.success("Mesa desactivada");
      await cargarMesas();
    } catch (e: any) {
      toast.error("Error al desactivar mesa", { description: e.message });
    }
  };

  const crearComanda = async () => {
    if (!mesaSeleccionada) return;
    const validItems = fComItems.filter(
      (i) => i.descripcion && i.cantidad > 0,
    );
    if (validItems.length === 0) {
      toast.error("Agrega al menos un item válido");
      return;
    }
    try {
      const comanda = await apiPost<Comanda>("/api/comandas", {
        mesaId: mesaSeleccionada.id,
        meseroId: fComMesero || undefined,
        observaciones: fComObs || undefined,
        items: validItems.map((i) => ({
          productoId: i.productoId || undefined,
          descripcion: i.descripcion,
          cantidad: Number(i.cantidad),
          precioUnitario: Number(i.precioUnitario),
          observaciones: i.observaciones || undefined,
        })),
      });
      toast.success("Comanda abierta");
      setDialogNuevaComandaOpen(false);
      await Promise.all([cargarMesas(), cargarAbiertas()]);
      await abrirSheetComanda(comanda.id);
    } catch (e: any) {
      toast.error("Error al crear comanda", { description: e.message });
    }
  };

  const agregarItem = async () => {
    if (!sheetComanda) return;
    if (!fAggDescripcion || fAggCantidad <= 0) {
      toast.error("Descripción y cantidad son obligatorias");
      return;
    }
    try {
      const updated = await apiPost<Comanda>(
        `/api/comandas/${sheetComanda.id}/agregar-item`,
        {
          productoId: fAggProductoId || undefined,
          descripcion: fAggDescripcion,
          cantidad: Number(fAggCantidad),
          precioUnitario: Number(fAggPrecio),
          observaciones: fAggObs || undefined,
        },
      );
      setSheetComanda(updated);
      toast.success("Item agregado");
      setDialogAgregarItemOpen(false);
      setFAggProductoId("");
      setFAggDescripcion("");
      setFAggCantidad(1);
      setFAggPrecio(0);
      setFAggObs("");
      await cargarAbiertas();
    } catch (e: any) {
      toast.error("Error al agregar item", { description: e.message });
    }
  };

  const cambiarEstadoItem = async (
    detalleId: string,
    estado: DetalleComanda["estado"],
  ) => {
    if (!sheetComanda) return;
    try {
      await apiPost(
        `/api/comandas/${sheetComanda.id}/cambiar-estado-item`,
        { detalleId, estado },
      );
      // Recargar comanda
      const data = await apiGet<Comanda>(
        `/api/comandas/${sheetComanda.id}`,
      );
      setSheetComanda(data);
      toast.success(`Item marcado como "${estado}"`);
      await cargarAbiertas();
    } catch (e: any) {
      toast.error("Error al cambiar estado", { description: e.message });
    }
  };

  const facturarComanda = async () => {
    if (!sheetComanda) return;
    try {
      const res = await apiPost<{ factura?: any; estado: string }>(
        `/api/comandas/${sheetComanda.id}/facturar`,
        {
          terceroId: fFacTerceroId || undefined,
          nombreCliente: fFacNombreCliente || undefined,
          nitCliente: fFacNitCliente || undefined,
          formaPago: fFacFormaPago,
        },
      );
      toast.success("Comanda facturada", {
        description: res?.factura?.numero
          ? `Factura ${res.factura.numero}`
          : undefined,
      });
      setDialogFacturarOpen(false);
      setSheetOpen(false);
      setSheetComanda(null);
      setFFacTerceroId("");
      setFFacNombreCliente("");
      setFFacNitCliente("");
      setFFacFormaPago("efectivo");
      await Promise.all([cargarMesas(), cargarAbiertas(), cargarHistorial()]);
    } catch (e: any) {
      toast.error("Error al facturar comanda", { description: e.message });
    }
  };

  const anularComanda = async () => {
    if (!sheetComanda) return;
    if (!confirm("¿Anular la comanda? Se liberará la mesa.")) return;
    try {
      await apiPost(`/api/comandas/${sheetComanda.id}/anular`, {});
      toast.success("Comanda anulada");
      setSheetOpen(false);
      setSheetComanda(null);
      await Promise.all([cargarMesas(), cargarAbiertas(), cargarHistorial()]);
    } catch (e: any) {
      toast.error("Error al anular comanda", { description: e.message });
    }
  };

  // ---------- Derivados ----------
  const ubicaciones = useMemo(() => {
    const set = new Set<string>();
    mesas.forEach((m) => {
      if (m.ubicacion) set.add(m.ubicacion);
    });
    return Array.from(set).sort();
  }, [mesas]);

  const stats = useMemo(() => {
    const total = mesas.length;
    const disponibles = mesas.filter((m) => m.estado === "disponible").length;
    const ocupadas = mesas.filter((m) => m.estado === "ocupada").length;
    const reservadas = mesas.filter((m) => m.estado === "reservada").length;
    return { total, disponibles, ocupadas, reservadas };
  }, [mesas]);

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <Card className="border-neutral-200 dark:border-neutral-800">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base md:text-lg">
                  Restaurante — Mesas & Comandas
                </CardTitle>
                <CardDescription className="text-xs">
                  Mapa de mesas, comandas en curso e historial de facturación
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cargarMesas();
                  cargarAbiertas();
                  cargarHistorial();
                }}
              >
                <RefreshCw className="h-4 w-4" /> Actualizar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setFMesaCodigo("");
                  setFMesaNombre("");
                  setFMesaCapacidad(4);
                  setFMesaUbicacion("Salón");
                  setFMesaPosX(0);
                  setFMesaPosY(0);
                  setDialogNuevaMesaOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-4 w-4" /> Nueva mesa
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <KPI
              label="Total mesas"
              value={String(stats.total)}
              icon={Grid3x3}
              accent="neutral"
            />
            <KPI
              label="Disponibles"
              value={String(stats.disponibles)}
              icon={CheckCircle2}
              accent="emerald"
            />
            <KPI
              label="Ocupadas"
              value={String(stats.ocupadas)}
              icon={Users}
              accent="amber"
            />
            <KPI
              label="Reservadas"
              value={String(stats.reservadas)}
              icon={Clock}
              accent="teal"
            />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList className="h-auto flex-wrap bg-neutral-100 dark:bg-neutral-800/60">
              <TabsTrigger value="mapa" className="gap-1.5">
                <Grid3x3 className="h-4 w-4" /> Mapa de mesas
              </TabsTrigger>
              <TabsTrigger value="abiertas" className="gap-1.5">
                <ListOrdered className="h-4 w-4" /> Comandas abiertas
                {comandasAbiertas.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    {comandasAbiertas.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="historial" className="gap-1.5">
                <History className="h-4 w-4" /> Historial
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-1.5">
                <Settings2 className="h-4 w-4" /> Configuración
              </TabsTrigger>
            </TabsList>

            {/* ============== TAB: MAPA ============== */}
            <TabsContent value="mapa">
              {loadingMesas ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : mesas.length === 0 ? (
                <div className="text-center py-10 text-neutral-500">
                  <UtensilsCrossed className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  No hay mesas configuradas. Crea una desde &quot;Nueva mesa&quot;.
                </div>
              ) : ubicaciones.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {mesas.map((m) => (
                    <MesaCard
                      key={m.id}
                      mesa={m}
                      onClick={() => abrirComandaMesa(m)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {ubicaciones.map((ub) => (
                    <div key={ub}>
                      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 px-1">
                        {ub}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {mesas
                          .filter((m) => m.ubicacion === ub)
                          .map((m) => (
                            <MesaCard
                              key={m.id}
                              mesa={m}
                              onClick={() => abrirComandaMesa(m)}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ============== TAB: COMANDAS ABIERTAS ============== */}
            <TabsContent value="abiertas">
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[100px]">Mesa</TableHead>
                        <TableHead className="min-w-[120px]">Mesero</TableHead>
                        <TableHead className="min-w-[140px]">Apertura</TableHead>
                        <TableHead className="text-center min-w-[100px]">
                          # Pendientes
                        </TableHead>
                        <TableHead className="text-right min-w-[120px]">
                          Total
                        </TableHead>
                        <TableHead className="text-center min-w-[120px]">
                          Estado
                        </TableHead>
                        <TableHead className="text-center min-w-[140px]">
                          Acciones
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingAbiertas ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 7 }).map((__, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : comandasAbiertas.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-neutral-500 py-10"
                          >
                            <ListOrdered className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            No hay comandas abiertas.
                          </TableCell>
                        </TableRow>
                      ) : (
                        comandasAbiertas.map((c) => (
                          <TableRow
                            key={c.id}
                            className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 cursor-pointer"
                            onClick={() => abrirSheetComanda(c.id)}
                          >
                            <TableCell className="font-semibold text-emerald-700 dark:text-emerald-300">
                              {c.mesa?.nombre ?? "—"}
                              <div className="text-[10px] text-neutral-500 font-normal">
                                {c.mesa?.codigo}
                              </div>
                            </TableCell>
                            <TableCell>
                              {c.meseroId
                                ? meseros.find((m) => m.id === c.meseroId)
                                    ?.nombre ?? "—"
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtFechaHora(c.fechaApertura)}
                            </TableCell>
                            <TableCell className="text-center">
                              {(c.itemsPendientes ?? 0) > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                                >
                                  {c.itemsPendientes}
                                </Badge>
                              ) : (
                                <span className="text-neutral-400">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(c.total)}
                            </TableCell>
                            <TableCell className="text-center">
                              <EstadoComandaBadge estado={c.estado} />
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirSheetComanda(c.id);
                                }}
                              >
                                <ArrowRightCircle className="h-4 w-4" /> Abrir
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* ============== TAB: HISTORIAL ============== */}
            <TabsContent value="historial">
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[140px]">Cierre</TableHead>
                        <TableHead className="min-w-[100px]">Mesa</TableHead>
                        <TableHead className="min-w-[140px]">Apertura</TableHead>
                        <TableHead className="text-right min-w-[120px]">
                          Total
                        </TableHead>
                        <TableHead className="text-center min-w-[120px]">
                          Estado
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingHistorial ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 5 }).map((__, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : comandasHistorial.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-neutral-500 py-10"
                          >
                            <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            No hay comandas en el historial.
                          </TableCell>
                        </TableRow>
                      ) : (
                        comandasHistorial.map((c) => (
                          <TableRow
                            key={c.id}
                            className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                          >
                            <TableCell className="text-xs">
                              {fmtFechaCorta(c.fechaCierre)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {c.mesa?.nombre ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtFechaHora(c.fechaApertura)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {c.estado === "anulada" ? (
                                <span className="text-neutral-400 line-through">
                                  {formatCurrency(c.total)}
                                </span>
                              ) : (
                                formatCurrency(c.total)
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <EstadoComandaBadge estado={c.estado} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* ============== TAB: CONFIGURACIÓN ============== */}
            <TabsContent value="config">
              <ConfiguracionMesas
                mesas={mesas}
                loading={loadingMesas}
                onEdit={(m) => {
                  setMesaSeleccionada(m);
                  setFMesaCodigo(m.codigo);
                  setFMesaNombre(m.nombre);
                  setFMesaCapacidad(m.capacidad);
                  setFMesaUbicacion(m.ubicacion ?? "Salón");
                  setFMesaPosX(m.posicionX);
                  setFMesaPosY(m.posicionY);
                  setDialogEditarMesaOpen(true);
                }}
                onDesactivar={desactivarMesa}
                onCambiarEstado={(m, estado) =>
                  actualizarMesa(m.id, { estado })
                }
                onNueva={() => {
                  setFMesaCodigo("");
                  setFMesaNombre("");
                  setFMesaCapacidad(4);
                  setFMesaUbicacion("Salón");
                  setFMesaPosX(0);
                  setFMesaPosY(0);
                  setDialogNuevaMesaOpen(true);
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ============== SHEET: Detalle de comanda ============== */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[80vw] lg:w-[70vw] overflow-y-auto"
        >
          <SheetHeader className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
            <SheetTitle className="text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              {sheetComanda ? (
                <>
                  <UtensilsCrossed className="h-4 w-4" />
                  <span>
                    {sheetComanda.mesa?.nombre ?? "Mesa"} · Comanda{" "}
                    {sheetComanda.id.slice(-6).toUpperCase()}
                  </span>
                </>
              ) : (
                "Detalle de comanda"
              )}
            </SheetTitle>
            <SheetDescription>
              {sheetComanda
                ? `Apertura ${fmtFechaHora(sheetComanda.fechaApertura)} · Mesero ${
                    sheetComanda.meseroId
                      ? meseros.find((m) => m.id === sheetComanda.meseroId)
                          ?.nombre ?? "—"
                      : "—"
                  }`
                : "Cargando..."}
            </SheetDescription>
          </SheetHeader>

          {sheetLoading || !sheetComanda ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* KPIs comanda */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KPI
                  label="Items totales"
                  value={String(sheetComanda.detalles.length)}
                  icon={ShoppingCart}
                  accent="neutral"
                />
                <KPI
                  label="Pendientes"
                  value={String(
                    sheetComanda.detalles.filter(
                      (d) =>
                        d.estado === "solicitado" || d.estado === "preparando",
                    ).length,
                  )}
                  icon={Bell}
                  accent="amber"
                />
                <KPI
                  label="Listos/servidos"
                  value={String(
                    sheetComanda.detalles.filter(
                      (d) => d.estado === "listo" || d.estado === "servido",
                    ).length,
                  )}
                  icon={CheckCircle2}
                  accent="emerald"
                />
                <KPI
                  label="Total acumulado"
                  value={formatCurrency(sheetComanda.total)}
                  icon={FileText}
                  accent="teal"
                />
              </div>

              {/* Items */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="max-h-[40vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sheetComanda.detalles.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center text-neutral-500 py-8"
                          >
                            <ShoppingCart className="h-8 w-8 mx-auto mb-1 opacity-30" />
                            Sin items. Agrega uno para empezar.
                          </TableCell>
                        </TableRow>
                      ) : (
                        sheetComanda.detalles.map((d) => {
                          const stInfo = ESTADO_ITEM[d.estado];
                          const isPending =
                            d.estado === "solicitado" ||
                            d.estado === "preparando";
                          const isReady = d.estado === "listo";
                          return (
                            <TableRow
                              key={d.id}
                              className={
                                isPending
                                  ? "bg-amber-50/40 dark:bg-amber-950/10"
                                  : isReady
                                    ? "bg-emerald-50/40 dark:bg-emerald-950/10"
                                    : ""
                              }
                            >
                              <TableCell>
                                <div className="font-medium">{d.descripcion}</div>
                                {d.observaciones && (
                                  <div className="text-[10px] text-neutral-500 mt-0.5">
                                    Obs: {d.observaciones}
                                  </div>
                                )}
                                <div className="text-[10px] text-neutral-400 mt-0.5">
                                  Solicitado {fmtFechaHora(d.horaSolicitud)}
                                  {d.horaListo &&
                                    ` · Listo ${fmtFechaHora(d.horaListo)}`}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {d.cantidad}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(d.precioUnitario)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {d.estado === "anulado" ? (
                                  <span className="text-neutral-400 line-through">
                                    {formatCurrency(d.subtotal)}
                                  </span>
                                ) : (
                                  formatCurrency(d.subtotal)
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={`gap-1 ${stInfo.color}`}
                                >
                                  <stInfo.Icon className="h-3 w-3" />
                                  {stInfo.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {d.estado === "solicitado" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() =>
                                        cambiarEstadoItem(d.id, "preparando")
                                      }
                                    >
                                      <ChefHat className="h-3 w-3" /> Preparar
                                    </Button>
                                  )}
                                  {(d.estado === "solicitado" ||
                                    d.estado === "preparando") && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                      onClick={() =>
                                        cambiarEstadoItem(d.id, "listo")
                                      }
                                    >
                                      <CheckCircle2 className="h-3 w-3" /> Listo
                                    </Button>
                                  )}
                                  {d.estado === "listo" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                                      onClick={() =>
                                        cambiarEstadoItem(d.id, "servido")
                                      }
                                    >
                                      <UtensilsCrossed className="h-3 w-3" /> Servir
                                    </Button>
                                  )}
                                  {d.estado !== "anulado" &&
                                    d.estado !== "servido" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                        onClick={() =>
                                          cambiarEstadoItem(d.id, "anulado")
                                        }
                                      >
                                        <Ban className="h-3 w-3" /> Anular
                                      </Button>
                                    )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFAggProductoId("");
                      setFAggDescripcion("");
                      setFAggCantidad(1);
                      setFAggPrecio(0);
                      setFAggObs("");
                      setDialogAgregarItemOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Agregar item
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900"
                    onClick={anularComanda}
                  >
                    <Ban className="h-4 w-4" /> Anular comanda
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={() => setDialogFacturarOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileText className="h-4 w-4" /> Facturar ·{" "}
                  {formatCurrency(sheetComanda.total)}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ============== DIALOG: Nueva mesa ============== */}
      <Dialog
        open={dialogNuevaMesaOpen}
        onOpenChange={setDialogNuevaMesaOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Plus className="h-4 w-4" /> Nueva mesa
            </DialogTitle>
            <DialogDescription>
              Define código, capacidad y posición en el mapa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código *</Label>
                <Input
                  value={fMesaCodigo}
                  onChange={(e) => setFMesaCodigo(e.target.value)}
                  placeholder="M01"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nombre *</Label>
                <Input
                  value={fMesaNombre}
                  onChange={(e) => setFMesaNombre(e.target.value)}
                  placeholder="Mesa 1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={fMesaCapacidad}
                  onChange={(e) =>
                    setFMesaCapacidad(Number(e.target.value) || 1)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pos. X</Label>
                <Input
                  type="number"
                  value={fMesaPosX}
                  onChange={(e) => setFMesaPosX(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pos. Y</Label>
                <Input
                  type="number"
                  value={fMesaPosY}
                  onChange={(e) => setFMesaPosY(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ubicación / Salón</Label>
              <Input
                value={fMesaUbicacion}
                onChange={(e) => setFMesaUbicacion(e.target.value)}
                placeholder="Salón, Terraza, Barra..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogNuevaMesaOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={crearMesa}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Save className="h-4 w-4" /> Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== DIALOG: Editar mesa ============== */}
      <Dialog
        open={dialogEditarMesaOpen}
        onOpenChange={setDialogEditarMesaOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Edit3 className="h-4 w-4" /> Editar mesa
            </DialogTitle>
            <DialogDescription>
              {mesaSeleccionada?.codigo} — ajusta posición y propiedades.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código</Label>
                <Input
                  value={fMesaCodigo}
                  onChange={(e) => setFMesaCodigo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={fMesaNombre}
                  onChange={(e) => setFMesaNombre(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={fMesaCapacidad}
                  onChange={(e) =>
                    setFMesaCapacidad(Number(e.target.value) || 1)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pos. X</Label>
                <Input
                  type="number"
                  value={fMesaPosX}
                  onChange={(e) => setFMesaPosX(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pos. Y</Label>
                <Input
                  type="number"
                  value={fMesaPosY}
                  onChange={(e) => setFMesaPosY(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ubicación</Label>
              <Input
                value={fMesaUbicacion}
                onChange={(e) => setFMesaUbicacion(e.target.value)}
              />
            </div>
            {mesaSeleccionada && (
              <div className="space-y-1">
                <Label className="text-xs">Estado</Label>
                <Select
                  value={mesaSeleccionada.estado}
                  onValueChange={(v) =>
                    setMesaSeleccionada({
                      ...mesaSeleccionada,
                      estado: v as Mesa["estado"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponible">Disponible</SelectItem>
                    <SelectItem value="ocupada">Ocupada</SelectItem>
                    <SelectItem value="reservada">Reservada</SelectItem>
                    <SelectItem value="inactiva">Inactiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogEditarMesaOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!mesaSeleccionada) return;
                await actualizarMesa(mesaSeleccionada.id, {
                  codigo: fMesaCodigo,
                  nombre: fMesaNombre,
                  capacidad: Number(fMesaCapacidad) || 1,
                  ubicacion: fMesaUbicacion || null,
                  posicionX: Number(fMesaPosX) || 0,
                  posicionY: Number(fMesaPosY) || 0,
                  estado: mesaSeleccionada.estado,
                });
                setDialogEditarMesaOpen(false);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Save className="h-4 w-4" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== DIALOG: Nueva comanda ============== */}
      <Dialog
        open={dialogNuevaComandaOpen}
        onOpenChange={setDialogNuevaComandaOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <UtensilsCrossed className="h-4 w-4" /> Nueva comanda
              {mesaSeleccionada && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 ml-1"
                >
                  {mesaSeleccionada.nombre}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Agrega productos o items libres y abre la comanda en la mesa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Mesero (opcional)</Label>
              <Select value={fComMesero} onValueChange={setFComMesero}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {meseros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Items</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setFComItems([
                      ...fComItems,
                      { descripcion: "", cantidad: 1, precioUnitario: 0 },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> Agregar línea
                </Button>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[180px]">Producto</TableHead>
                      <TableHead className="min-w-[140px]">Descripción</TableHead>
                      <TableHead className="text-center w-[80px]">Cant.</TableHead>
                      <TableHead className="text-right min-w-[120px]">
                        Precio
                      </TableHead>
                      <TableHead className="text-right min-w-[120px]">
                        Subtotal
                      </TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fComItems.map((it, idx) => {
                      const subtotal =
                        (Number(it.cantidad) || 0) *
                        (Number(it.precioUnitario) || 0);
                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <Select
                              value={it.productoId ?? ""}
                              onValueChange={(v) => {
                                const prod = productos.find(
                                  (p) => p.id === v,
                                );
                                const copy = [...fComItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  productoId: v,
                                  descripcion: prod?.nombre ?? copy[idx].descripcion,
                                  precioUnitario: prod?.precio1 ?? copy[idx].precioUnitario,
                                };
                                setFComItems(copy);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Libre" />
                              </SelectTrigger>
                              <SelectContent>
                                {productos.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.codigo} · {p.nombre} ({formatCurrency(p.precio1)})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-xs"
                              value={it.descripcion}
                              onChange={(e) => {
                                const copy = [...fComItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  descripcion: e.target.value,
                                };
                                setFComItems(copy);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              className="h-8 text-xs text-center"
                              value={it.cantidad}
                              onChange={(e) => {
                                const copy = [...fComItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  cantidad: Number(e.target.value) || 1,
                                };
                                setFComItems(copy);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              className="h-8 text-xs text-right"
                              value={it.precioUnitario}
                              onChange={(e) => {
                                const copy = [...fComItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  precioUnitario: Number(e.target.value) || 0,
                                };
                                setFComItems(copy);
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs">
                            {formatCurrency(subtotal)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-rose-700 dark:text-rose-300"
                              onClick={() => {
                                const copy = fComItems.filter(
                                  (_, i) => i !== idx,
                                );
                                setFComItems(
                                  copy.length === 0
                                    ? [
                                        {
                                          descripcion: "",
                                          cantidad: 1,
                                          precioUnitario: 0,
                                        },
                                      ]
                                    : copy,
                                );
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Total:{" "}
                  {formatCurrency(
                    fComItems.reduce(
                      (acc, i) =>
                        acc + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0),
                      0,
                    ),
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Input
                value={fComObs}
                onChange={(e) => setFComObs(e.target.value)}
                placeholder="Mesa cumpleaños, cliente VIP, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogNuevaComandaOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={crearComanda}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <UtensilsCrossed className="h-4 w-4" /> Abrir comanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== DIALOG: Agregar item ============== */}
      <Dialog
        open={dialogAgregarItemOpen}
        onOpenChange={setDialogAgregarItemOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Plus className="h-4 w-4" /> Agregar item
            </DialogTitle>
            <DialogDescription>
              Agrega un producto o un item libre a la comanda abierta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Producto (opcional)</Label>
              <Select
                value={fAggProductoId}
                onValueChange={(v) => {
                  setFAggProductoId(v);
                  const prod = productos.find((p) => p.id === v);
                  if (prod) {
                    setFAggDescripcion(prod.nombre);
                    setFAggPrecio(prod.precio1);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Producto del catálogo" />
                </SelectTrigger>
                <SelectContent>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} · {p.nombre} ({formatCurrency(p.precio1)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción *</Label>
              <Input
                value={fAggDescripcion}
                onChange={(e) => setFAggDescripcion(e.target.value)}
                placeholder="Hamburguesa doble..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cantidad *</Label>
                <Input
                  type="number"
                  min={1}
                  value={fAggCantidad}
                  onChange={(e) => setFAggCantidad(Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Precio unitario</Label>
                <Input
                  type="number"
                  min={0}
                  value={fAggPrecio}
                  onChange={(e) => setFAggPrecio(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Input
                value={fAggObs}
                onChange={(e) => setFAggObs(e.target.value)}
                placeholder="Sin cebolla, extra queso..."
              />
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500">Subtotal:</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(
                  (Number(fAggCantidad) || 0) * (Number(fAggPrecio) || 0),
                )}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogAgregarItemOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={agregarItem}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== DIALOG: Facturar ============== */}
      <Dialog
        open={dialogFacturarOpen}
        onOpenChange={setDialogFacturarOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <FileText className="h-4 w-4" /> Facturar comanda
            </DialogTitle>
            <DialogDescription>
              {sheetComanda &&
                `Total a facturar: ${formatCurrency(sheetComanda.total)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Cliente (opcional)</Label>
              <Select
                value={fFacTerceroId}
                onValueChange={(v) => {
                  setFFacTerceroId(v);
                  const t = terceros.find((x) => x.id === v);
                  if (t) {
                    setFFacNombreCliente(t.nombre);
                    setFFacNitCliente(t.numeroDocumento);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cliente Mostrador" />
                </SelectTrigger>
                <SelectContent>
                  {terceros.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre} · {t.numeroDocumento}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nombre cliente</Label>
                <Input
                  value={fFacNombreCliente}
                  onChange={(e) => setFFacNombreCliente(e.target.value)}
                  placeholder="Cliente Mostrador"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">NIT/CC</Label>
                <Input
                  value={fFacNitCliente}
                  onChange={(e) => setFFacNitCliente(e.target.value)}
                  placeholder="222222222"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Forma de pago</Label>
              <Select value={fFacFormaPago} onValueChange={setFFacFormaPago}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="mixto">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200">
              Se generará una factura POS desde la resolución DIAN activa y
              la mesa quedará libre.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogFacturarOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={facturarComanda}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileText className="h-4 w-4" /> Generar factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Subcomponentes ----------

function MesaCard({
  mesa,
  onClick,
}: {
  mesa: Mesa;
  onClick: () => void;
}) {
  const stInfo = ESTADO_MESA[mesa.estado];
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition-all hover:shadow-md hover:scale-[1.02] ${stInfo.color}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-sm">{mesa.nombre}</div>
          <div className="text-[10px] opacity-70 font-mono">{mesa.codigo}</div>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full ${stInfo.dot}`} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] opacity-80">
        <Users className="h-3 w-3" />
        <span>{mesa.capacidad} personas</span>
      </div>
      {mesa.estado === "ocupada" && mesa.comandaActiva && (
        <div className="mt-2 text-[10px] font-semibold">
          Total: {formatCurrency(mesa.comandaActiva.total)}
        </div>
      )}
      <div className="mt-2 text-[10px] uppercase tracking-wider opacity-70">
        {stInfo.label}
      </div>
    </button>
  );
}

function EstadoComandaBadge({ estado }: { estado: string }) {
  const info = ESTADO_COMANDA[estado] ?? ESTADO_COMANDA.abierta;
  const Icon = info.Icon;
  return (
    <Badge variant="outline" className={`gap-1 ${info.color}`}>
      <Icon className="h-3 w-3" /> {info.label}
    </Badge>
  );
}

function ConfiguracionMesas({
  mesas,
  loading,
  onEdit,
  onDesactivar,
  onCambiarEstado,
  onNueva,
}: {
  mesas: Mesa[];
  loading: boolean;
  onEdit: (m: Mesa) => void;
  onDesactivar: (id: string) => void;
  onCambiarEstado: (m: Mesa, estado: Mesa["estado"]) => void;
  onNueva: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">
          Edita posición (X/Y), capacidad, ubicación y estado de cada mesa.
        </div>
        <Button size="sm" onClick={onNueva} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4" /> Nueva mesa
        </Button>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : mesas.length === 0 ? (
        <div className="text-center py-10 text-neutral-500">
          <Settings2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
          No hay mesas para configurar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {mesas.map((m) => {
            const st = ESTADO_MESA[m.estado];
            return (
              <div
                key={m.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold shrink-0 ${st.dot}`}
                  >
                    {m.capacidad}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{m.nombre}</div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                      {m.codigo} · {m.ubicacion ?? "—"} · X={m.posicionX} Y=
                      {m.posicionY}
                    </div>
                    <Badge
                      variant="outline"
                      className={`mt-1 text-[10px] gap-1 ${st.color}`}
                    >
                      <CircleDot className="h-2.5 w-2.5" /> {st.label}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Select
                    value={m.estado}
                    onValueChange={(v) =>
                      onCambiarEstado(m, v as Mesa["estado"])
                    }
                  >
                    <SelectTrigger className="h-8 text-xs w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disponible">Disponible</SelectItem>
                      <SelectItem value="ocupada">Ocupada</SelectItem>
                      <SelectItem value="reservada">Reservada</SelectItem>
                      <SelectItem value="inactiva">Inactiva</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onEdit(m)}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-rose-700 dark:text-rose-300"
                    onClick={() => onDesactivar(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RestauranteView;
