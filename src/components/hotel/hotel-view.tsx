"use client";

// ============================================================
// ERP Marsella — Vista de Hotelería
// Tabs: Mapa de habitaciones | Reservas | Habitaciones | Tarifas
// Acento emerald/teal, dark mode, responsive mobile-first.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Plus,
  RefreshCw,
  Grid3x3,
  CalendarDays,
  Building2,
  Tag,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  LogIn,
  LogOut,
  Ban,
  Edit3,
  Save,
  Trash2,
  CircleDot,
  ArrowRightCircle,
  DollarSign,
  Percent,
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

const fmtFechaHora = (iso: string | Date | null | undefined) => {
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
interface Habitacion {
  id: string;
  codigo: string;
  numero: string;
  tipo: "sencilla" | "doble" | "suite" | "matrimonial";
  capacidad: number;
  precioBase: number;
  planta: number;
  estado: "disponible" | "ocupada" | "sucia" | "mantenimiento";
  reservaActiva?: Reserva | null;
}

interface Reserva {
  id: string;
  habitacionId: string;
  terceroId?: string | null;
  fechaCheckin: string;
  fechaCheckout: string;
  noches: number;
  tarifaNoche: number;
  tarifaTotal: number;
  estado: "confirmada" | "checkin" | "checkout" | "cancelada" | "no_show";
  observaciones?: string | null;
  habitacion?: Habitacion;
  tercero?: { id: string; nombre: string; numeroDocumento: string } | null;
}

interface Tercero {
  id: string;
  nombre: string;
  numeroDocumento: string;
  tipo: string;
}

// ---------- Constantes ----------
const ESTADO_HAB: Record<
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
  sucia: {
    label: "Sucia",
    color:
      "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  mantenimiento: {
    label: "Mantenimiento",
    color:
      "bg-neutral-100 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400",
    dot: "bg-neutral-500",
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
      "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500",
    dot: "bg-neutral-400",
  },
  _default: {
    label: "Desconocido",
    color:
      "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-500",
    dot: "bg-neutral-400",
  },
};

// Helper para acceso seguro a ESTADO_HAB (evita bug de Turbopack con corchetes literales)
function getEstadoHab(estado: string) {
  return ESTADO_HAB[estado] ?? ESTADO_HAB._default;
}

function getTipoHab(tipo: string) {
  return TIPO_HAB[tipo] ?? TIPO_HAB.sencilla;
}

const ESTADO_RESERVA: Record<
  string,
  { label: string; color: string; Icon: React.ElementType }
> = {
  confirmada: {
    label: "Confirmada",
    color:
      "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
    Icon: CheckCircle2,
  },
  checkin: {
    label: "Check-in",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    Icon: LogIn,
  },
  checkout: {
    label: "Check-out",
    color:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
    Icon: LogOut,
  },
  cancelada: {
    label: "Cancelada",
    color:
      "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    Icon: XCircle,
  },
  no_show: {
    label: "No show",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    Icon: Clock,
  },
};

const TIPO_HAB: Record<
  string,
  { label: string; Icon: React.ElementType }
> = {
  sencilla: { label: "Sencilla", Icon: BedDouble },
  doble: { label: "Doble", Icon: BedDouble },
  suite: { label: "Suite", Icon: Building2 },
  matrimonial: { label: "Matrimonial", Icon: BedDouble },
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

// ============================================================
// Componente principal
// ============================================================
export function HotelView() {
  const [tab, setTab] = useState<string>("mapa");

  // ---- Estados de datos ----
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);

  const [loadingHab, setLoadingHab] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);

  // ---- Sheet reserva ----
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetReserva, setSheetReserva] = useState<Reserva | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  // ---- Dialogs ----
  const [dialogNuevaHabOpen, setDialogNuevaHabOpen] = useState(false);
  const [dialogEditarHabOpen, setDialogEditarHabOpen] = useState(false);
  const [dialogNuevaReservaOpen, setDialogNuevaReservaOpen] = useState(false);

  // ---- Habitación / reserva seleccionada ----
  const [habSeleccionada, setHabSeleccionada] =
    useState<Habitacion | null>(null);

  // ---- Formularios ----
  // Habitación
  const [fHabCodigo, setFHabCodigo] = useState("");
  const [fHabNumero, setFHabNumero] = useState("");
  const [fHabTipo, setFHabTipo] = useState<Habitacion["tipo"]>("sencilla");
  const [fHabCapacidad, setFHabCapacidad] = useState(2);
  const [fHabPrecio, setFHabPrecio] = useState(0);
  const [fHabPlanta, setFHabPlanta] = useState(1);

  // Nueva reserva
  const [fResHabId, setFResHabId] = useState("");
  const [fResTerceroId, setFResTerceroId] = useState("");
  const [fResNombreHuesped, setFResNombreHuesped] = useState("");
  const [fResCheckin, setFResCheckin] = useState("");
  const [fResCheckout, setFResCheckout] = useState("");
  const [fResTarifa, setFResTarifa] = useState(0);
  const [fResObs, setFResObs] = useState("");

  // ---------- Cargas ----------
  const cargarHabitaciones = useCallback(async () => {
    setLoadingHab(true);
    try {
      const data = await apiGet<{ items: Habitacion[] }>("/api/habitaciones");
      setHabitaciones(data.items ?? []);
    } catch (e: any) {
      toast.error("Error al cargar habitaciones", { description: e.message });
    } finally {
      setLoadingHab(false);
    }
  }, []);

  const cargarReservas = useCallback(async () => {
    setLoadingRes(true);
    try {
      const data = await apiGet<{ items: Reserva[] }>(
        "/api/reservas-hotel?pageSize=500",
      );
      setReservas(data.items ?? []);
    } catch (e: any) {
      toast.error("Error al cargar reservas", { description: e.message });
    } finally {
      setLoadingRes(false);
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

  // Carga inicial
  useEffect(() => {
    cargarHabitaciones();
    cargarReservas();
    cargarTerceros();
  }, [cargarHabitaciones, cargarReservas, cargarTerceros]);

  // ---------- Derivados ----------
  const plantas = useMemo(() => {
    const set = new Set<number>();
    habitaciones.forEach((h) => set.add(h.planta));
    return Array.from(set).sort((a, b) => a - b);
  }, [habitaciones]);

  const stats = useMemo(() => {
    const total = habitaciones.length;
    const disponibles = habitaciones.filter(
      (h) => h.estado === "disponible",
    ).length;
    const ocupadas = habitaciones.filter(
      (h) => h.estado === "ocupada",
    ).length;
    const sucias = habitaciones.filter((h) => h.estado === "sucia").length;
    const mantenimiento = habitaciones.filter(
      (h) => h.estado === "mantenimiento",
    ).length;
    return { total, disponibles, ocupadas, sucias, mantenimiento };
  }, [habitaciones]);

  // ---------- Acciones ----------
  const crearHabitacion = async () => {
    if (!fHabCodigo || !fHabNumero) {
      toast.error("Código y número son obligatorios");
      return;
    }
    try {
      await apiPost("/api/habitaciones", {
        codigo: fHabCodigo,
        numero: fHabNumero,
        tipo: fHabTipo,
        capacidad: Number(fHabCapacidad) || 1,
        precioBase: Number(fHabPrecio) || 0,
        planta: Number(fHabPlanta) || 1,
      });
      toast.success("Habitación creada");
      setDialogNuevaHabOpen(false);
      resetHabForm();
      await cargarHabitaciones();
    } catch (e: any) {
      toast.error("Error al crear habitación", { description: e.message });
    }
  };

  const actualizarHabitacion = async (id: string, data: any) => {
    try {
      await apiPost("/api/habitaciones", { id, ...data }, "PUT");
      toast.success("Habitación actualizada");
      await cargarHabitaciones();
    } catch (e: any) {
      toast.error("Error al actualizar habitación", {
        description: e.message,
      });
    }
  };

  const resetHabForm = () => {
    setFHabCodigo("");
    setFHabNumero("");
    setFHabTipo("sencilla");
    setFHabCapacidad(2);
    setFHabPrecio(0);
    setFHabPlanta(1);
  };

  const abrirNuevaReserva = (hab: Habitacion) => {
    if (hab.estado !== "disponible") {
      toast.error(
        `La habitación no está disponible (estado: ${hab.estado})`,
      );
      return;
    }
    setHabSeleccionada(hab);
    setFResHabId(hab.id);
    setFResTerceroId("");
    setFResNombreHuesped("");
    setFResCheckin("");
    setFResCheckout("");
    setFResTarifa(hab.precioBase);
    setFResObs("");
    setDialogNuevaReservaOpen(true);
  };

  const abrirSheetReserva = useCallback(async (reservaId: string) => {
    setSheetOpen(true);
    setSheetLoading(true);
    setSheetReserva(null);
    try {
      const data = await apiGet<Reserva>(`/api/reservas-hotel/${reservaId}`);
      setSheetReserva(data);
    } catch (e: any) {
      toast.error("Error al cargar reserva", { description: e.message });
      setSheetOpen(false);
    } finally {
      setSheetLoading(false);
    }
  }, []);

  const abrirHabitacion = useCallback(
    async (hab: Habitacion) => {
      if (hab.estado === "disponible") {
        abrirNuevaReserva(hab);
        return;
      }
      // Para ocupada, buscar reserva activa
      const activa = reservas.find(
        (r) =>
          r.habitacionId === hab.id &&
          (r.estado === "checkin" || r.estado === "confirmada"),
      );
      if (activa) {
        await abrirSheetReserva(activa.id);
      } else {
        toast.info("No se encontró reserva activa para esta habitación");
      }
    },
    [reservas, abrirSheetReserva],
  );

  const crearReserva = async () => {
    if (!fResHabId || !fResCheckin || !fResCheckout || !fResNombreHuesped) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    try {
      const res = await apiPost<Reserva>("/api/reservas-hotel", {
        habitacionId: fResHabId,
        terceroId: fResTerceroId || undefined,
        nombreHuesped: fResNombreHuesped,
        fechaCheckin: fResCheckin,
        fechaCheckout: fResCheckout,
        tarifaNoche: Number(fResTarifa) || 0,
        observaciones: fResObs || undefined,
      });
      toast.success("Reserva confirmada");
      setDialogNuevaReservaOpen(false);
      await Promise.all([cargarHabitaciones(), cargarReservas()]);
      await abrirSheetReserva(res.id);
    } catch (e: any) {
      toast.error("Error al crear reserva", { description: e.message });
    }
  };

  const hacerCheckin = async (id: string) => {
    try {
      await apiPost(`/api/reservas-hotel/${id}/checkin`, {});
      toast.success("Check-in realizado");
      await Promise.all([cargarHabitaciones(), cargarReservas()]);
      if (sheetOpen) await abrirSheetReserva(id);
    } catch (e: any) {
      toast.error("Error al hacer check-in", { description: e.message });
    }
  };

  const hacerCheckout = async (id: string) => {
    if (!confirm("¿Confirmar check-out? La habitación quedará sucia.")) return;
    try {
      const res: any = await apiPost(`/api/reservas-hotel/${id}/checkout`, {});
      toast.success("Check-out realizado", {
        description: `Noches: ${res?.resumen?.noches ?? 0} · Total: ${formatCurrency(
          res?.resumen?.tarifaTotal ?? 0,
        )}`,
      });
      await Promise.all([cargarHabitaciones(), cargarReservas()]);
      if (sheetOpen) await abrirSheetReserva(id);
    } catch (e: any) {
      toast.error("Error al hacer check-out", { description: e.message });
    }
  };

  const cancelarReserva = async (id: string) => {
    if (!confirm("¿Cancelar la reserva? Se liberará la habitación.")) return;
    try {
      await apiPost(`/api/reservas-hotel/${id}/cancelar`, {});
      toast.success("Reserva cancelada");
      await Promise.all([cargarHabitaciones(), cargarReservas()]);
      if (sheetOpen) {
        setSheetOpen(false);
        setSheetReserva(null);
      }
    } catch (e: any) {
      toast.error("Error al cancelar reserva", { description: e.message });
    }
  };

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <Card className="border-neutral-200 dark:border-neutral-800">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
                <BedDouble className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base md:text-lg">
                  Hotelería — Habitaciones & Reservas
                </CardTitle>
                <CardDescription className="text-xs">
                  Mapa por planta, reservas, habitaciones y tarifas
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cargarHabitaciones();
                  cargarReservas();
                }}
              >
                <RefreshCw className="h-4 w-4" /> Actualizar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  resetHabForm();
                  setDialogNuevaHabOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-4 w-4" /> Nueva habitación
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <KPI
              label="Total"
              value={String(stats.total)}
              icon={Building2}
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
              icon={LogIn}
              accent="amber"
            />
            <KPI
              label="Sucias"
              value={String(stats.sucias)}
              icon={XCircle}
              accent="rose"
            />
            <KPI
              label="Mantenim."
              value={String(stats.mantenimiento)}
              icon={Clock}
              accent="teal"
            />
          </div>

          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList className="h-auto flex-wrap bg-neutral-100 dark:bg-neutral-800/60">
              <TabsTrigger value="mapa" className="gap-1.5">
                <Grid3x3 className="h-4 w-4" /> Mapa
              </TabsTrigger>
              <TabsTrigger value="reservas" className="gap-1.5">
                <CalendarDays className="h-4 w-4" /> Reservas
                {reservas.filter((r) => r.estado === "confirmada" || r.estado === "checkin").length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    {
                      reservas.filter(
                        (r) =>
                          r.estado === "confirmada" || r.estado === "checkin",
                      ).length
                    }
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="habitaciones" className="gap-1.5">
                <BedDouble className="h-4 w-4" /> Habitaciones
              </TabsTrigger>
              <TabsTrigger value="tarifas" className="gap-1.5">
                <Tag className="h-4 w-4" /> Tarifas
              </TabsTrigger>
            </TabsList>

            {/* ============== TAB: MAPA ============== */}
            <TabsContent value="mapa">
              {loadingHab ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-36 w-full" />
                  ))}
                </div>
              ) : habitaciones.length === 0 ? (
                <div className="text-center py-10 text-neutral-500">
                  <BedDouble className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  No hay habitaciones configuradas. Crea una desde &quot;Nueva habitación&quot;.
                </div>
              ) : (
                <div className="space-y-5">
                  {plantas.map((p) => (
                    <div key={p}>
                      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 px-1">
                        Planta {p}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {habitaciones
                          .filter((h) => h.planta === p)
                          .map((h) => (
                            <HabitacionCard
                              key={h.id}
                              habitacion={h}
                              onClick={() => abrirHabitacion(h)}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ============== TAB: RESERVAS ============== */}
            <TabsContent value="reservas">
              <div className="space-y-3">
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      setFResHabId("");
                      setFResTerceroId("");
                      setFResNombreHuesped("");
                      setFResCheckin("");
                      setFResCheckout("");
                      setFResTarifa(0);
                      setFResObs("");
                      setHabSeleccionada(null);
                      setDialogNuevaReservaOpen(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="h-4 w-4" /> Nueva reserva
                  </Button>
                </div>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="min-w-[80px]">Hab.</TableHead>
                          <TableHead className="min-w-[160px]">Huésped</TableHead>
                          <TableHead className="min-w-[120px]">Check-in</TableHead>
                          <TableHead className="min-w-[120px]">Check-out</TableHead>
                          <TableHead className="text-center min-w-[80px]">
                            Noches
                          </TableHead>
                          <TableHead className="text-right min-w-[120px]">
                            Tarifa total
                          </TableHead>
                          <TableHead className="text-center min-w-[120px]">
                            Estado
                          </TableHead>
                          <TableHead className="text-center min-w-[260px]">
                            Acciones
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingRes ? (
                          Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 8 }).map((__, j) => (
                                <TableCell key={j}>
                                  <Skeleton className="h-5 w-full" />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : reservas.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="text-center text-neutral-500 py-10"
                            >
                              <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-30" />
                              No hay reservas registradas.
                            </TableCell>
                          </TableRow>
                        ) : (
                          reservas.map((r) => (
                            <TableRow
                              key={r.id}
                              className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 cursor-pointer"
                              onClick={() => abrirSheetReserva(r.id)}
                            >
                              <TableCell className="font-semibold text-emerald-700 dark:text-emerald-300">
                                {r.habitacion?.numero ?? "—"}
                                <div className="text-[10px] text-neutral-500 font-normal">
                                  {r.habitacion?.codigo}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">
                                  {r.tercero?.nombre ?? "—"}
                                </div>
                                <div className="text-[10px] text-neutral-500">
                                  {r.tercero?.numeroDocumento ?? "—"}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {fmtFecha(r.fechaCheckin)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {fmtFecha(r.fechaCheckout)}
                              </TableCell>
                              <TableCell className="text-center">
                                {r.noches}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(r.tarifaTotal)}
                              </TableCell>
                              <TableCell className="text-center">
                                <EstadoReservaBadge estado={r.estado} />
                              </TableCell>
                              <TableCell>
                                <div
                                  className="flex items-center justify-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {r.estado === "confirmada" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-emerald-700 dark:text-emerald-300"
                                      onClick={() => hacerCheckin(r.id)}
                                    >
                                      <LogIn className="h-3 w-3" /> Check-in
                                    </Button>
                                  )}
                                  {r.estado === "checkin" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-teal-700 dark:text-teal-300"
                                      onClick={() => hacerCheckout(r.id)}
                                    >
                                      <LogOut className="h-3 w-3" /> Check-out
                                    </Button>
                                  )}
                                  {(r.estado === "confirmada" ||
                                    r.estado === "checkin") && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-rose-700 dark:text-rose-300"
                                      onClick={() => cancelarReserva(r.id)}
                                    >
                                      <Ban className="h-3 w-3" /> Cancelar
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => abrirSheetReserva(r.id)}
                                  >
                                    <ArrowRightCircle className="h-3 w-3" /> Ver
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ============== TAB: HABITACIONES ============== */}
            <TabsContent value="habitaciones">
              <GestionHabitaciones
                habitaciones={habitaciones}
                loading={loadingHab}
                onEdit={(h) => {
                  setHabSeleccionada(h);
                  setFHabCodigo(h.codigo);
                  setFHabNumero(h.numero);
                  setFHabTipo(h.tipo);
                  setFHabCapacidad(h.capacidad);
                  setFHabPrecio(h.precioBase);
                  setFHabPlanta(h.planta);
                  setDialogEditarHabOpen(true);
                }}
                onCambiarEstado={(h, estado) =>
                  actualizarHabitacion(h.id, { estado })
                }
                onNueva={() => {
                  resetHabForm();
                  setDialogNuevaHabOpen(true);
                }}
              />
            </TabsContent>

            {/* ============== TAB: TARIFAS ============== */}
            <TabsContent value="tarifas">
              <TarifasView habitaciones={habitaciones} reservas={reservas} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ============== SHEET: Detalle de reserva ============== */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[70vw] lg:w-[60vw] overflow-y-auto"
        >
          <SheetHeader className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
            <SheetTitle className="text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              {sheetReserva ? (
                <>
                  <CalendarDays className="h-4 w-4" />
                  <span>
                    Reserva {sheetReserva.id.slice(-6).toUpperCase()} · Hab.{" "}
                    {sheetReserva.habitacion?.numero ?? "—"}
                  </span>
                </>
              ) : (
                "Detalle de reserva"
              )}
            </SheetTitle>
            <SheetDescription>
              {sheetReserva
                ? `Check-in ${fmtFecha(sheetReserva.fechaCheckin)} · Check-out ${fmtFecha(sheetReserva.fechaCheckout)}`
                : "Cargando..."}
            </SheetDescription>
          </SheetHeader>

          {sheetLoading || !sheetReserva ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* KPIs reserva */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KPI
                  label="Noches"
                  value={String(sheetReserva.noches)}
                  icon={Clock}
                  accent="neutral"
                />
                <KPI
                  label="Tarifa/noche"
                  value={formatCurrency(sheetReserva.tarifaNoche)}
                  icon={DollarSign}
                  accent="teal"
                />
                <KPI
                  label="Total"
                  value={formatCurrency(sheetReserva.tarifaTotal)}
                  icon={Tag}
                  accent="emerald"
                />
                <KPI
                  label="Estado"
                  value={
                    ESTADO_RESERVA[sheetReserva.estado]?.label ??
                    sheetReserva.estado
                  }
                  icon={
                    ESTADO_RESERVA[sheetReserva.estado]?.Icon ?? CheckCircle2
                  }
                  accent={
                    sheetReserva.estado === "checkin"
                      ? "emerald"
                      : sheetReserva.estado === "cancelada" ||
                          sheetReserva.estado === "no_show"
                        ? "rose"
                        : "teal"
                  }
                />
              </div>

              {/* Datos huésped */}
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Huésped
                </div>
                <div className="font-medium">
                  {sheetReserva.tercero?.nombre ?? "—"}
                </div>
                {sheetReserva.tercero?.numeroDocumento && (
                  <div className="text-xs text-neutral-500">
                    Doc: {sheetReserva.tercero.numeroDocumento}
                  </div>
                )}
                {sheetReserva.observaciones && (
                  <div className="text-xs text-neutral-500 pt-1">
                    Obs: {sheetReserva.observaciones}
                  </div>
                )}
              </div>

              {/* Datos habitación */}
              {sheetReserva.habitacion && (
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-neutral-500">
                    Habitación
                  </div>
                  <div className="font-medium">
                    {sheetReserva.habitacion.numero} ·{" "}
                    {TIPO_HAB[sheetReserva.habitacion.tipo]?.label ??
                      sheetReserva.habitacion.tipo}
                  </div>
                  <div className="text-xs text-neutral-500">
                    Capacidad: {sheetReserva.habitacion.capacidad} · Planta:{" "}
                    {sheetReserva.habitacion.planta} · Precio base:{" "}
                    {formatCurrency(sheetReserva.habitacion.precioBase)}
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                {sheetReserva.estado === "confirmada" && (
                  <Button
                    size="sm"
                    onClick={() => hacerCheckin(sheetReserva.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <LogIn className="h-4 w-4" /> Check-in
                  </Button>
                )}
                {sheetReserva.estado === "checkin" && (
                  <Button
                    size="sm"
                    onClick={() => hacerCheckout(sheetReserva.id)}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <LogOut className="h-4 w-4" /> Check-out
                  </Button>
                )}
                {(sheetReserva.estado === "confirmada" ||
                  sheetReserva.estado === "checkin") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900"
                    onClick={() => cancelarReserva(sheetReserva.id)}
                  >
                    <Ban className="h-4 w-4" /> Cancelar reserva
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ============== DIALOG: Nueva habitación ============== */}
      <Dialog open={dialogNuevaHabOpen} onOpenChange={setDialogNuevaHabOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Plus className="h-4 w-4" /> Nueva habitación
            </DialogTitle>
            <DialogDescription>
              Define código, número, tipo, capacidad, precio y planta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código *</Label>
                <Input
                  value={fHabCodigo}
                  onChange={(e) => setFHabCodigo(e.target.value)}
                  placeholder="H101"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Número *</Label>
                <Input
                  value={fHabNumero}
                  onChange={(e) => setFHabNumero(e.target.value)}
                  placeholder="101"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={fHabTipo}
                  onValueChange={(v) =>
                    setFHabTipo(v as Habitacion["tipo"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sencilla">Sencilla</SelectItem>
                    <SelectItem value="doble">Doble</SelectItem>
                    <SelectItem value="matrimonial">Matrimonial</SelectItem>
                    <SelectItem value="suite">Suite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={fHabCapacidad}
                  onChange={(e) =>
                    setFHabCapacidad(Number(e.target.value) || 1)
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Precio base / noche</Label>
                <Input
                  type="number"
                  min={0}
                  value={fHabPrecio}
                  onChange={(e) =>
                    setFHabPrecio(Number(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Planta</Label>
                <Input
                  type="number"
                  min={0}
                  value={fHabPlanta}
                  onChange={(e) =>
                    setFHabPlanta(Number(e.target.value) || 1)
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogNuevaHabOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={crearHabitacion}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Save className="h-4 w-4" /> Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== DIALOG: Editar habitación ============== */}
      <Dialog
        open={dialogEditarHabOpen}
        onOpenChange={setDialogEditarHabOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Edit3 className="h-4 w-4" /> Editar habitación
            </DialogTitle>
            <DialogDescription>
              {habSeleccionada?.codigo} · ajusta propiedades.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código</Label>
                <Input
                  value={fHabCodigo}
                  onChange={(e) => setFHabCodigo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Número</Label>
                <Input
                  value={fHabNumero}
                  onChange={(e) => setFHabNumero(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={fHabTipo}
                  onValueChange={(v) =>
                    setFHabTipo(v as Habitacion["tipo"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sencilla">Sencilla</SelectItem>
                    <SelectItem value="doble">Doble</SelectItem>
                    <SelectItem value="matrimonial">Matrimonial</SelectItem>
                    <SelectItem value="suite">Suite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={fHabCapacidad}
                  onChange={(e) =>
                    setFHabCapacidad(Number(e.target.value) || 1)
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Precio base</Label>
                <Input
                  type="number"
                  min={0}
                  value={fHabPrecio}
                  onChange={(e) =>
                    setFHabPrecio(Number(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Planta</Label>
                <Input
                  type="number"
                  min={0}
                  value={fHabPlanta}
                  onChange={(e) =>
                    setFHabPlanta(Number(e.target.value) || 1)
                  }
                />
              </div>
            </div>
            {habSeleccionada && (
              <div className="space-y-1">
                <Label className="text-xs">Estado</Label>
                <Select
                  value={habSeleccionada.estado}
                  onValueChange={(v) =>
                    setHabSeleccionada({
                      ...habSeleccionada,
                      estado: v as Habitacion["estado"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponible">Disponible</SelectItem>
                    <SelectItem value="ocupada">Ocupada</SelectItem>
                    <SelectItem value="sucia">Sucia</SelectItem>
                    <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogEditarHabOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!habSeleccionada) return;
                await actualizarHabitacion(habSeleccionada.id, {
                  codigo: fHabCodigo,
                  numero: fHabNumero,
                  tipo: fHabTipo,
                  capacidad: Number(fHabCapacidad) || 1,
                  precioBase: Number(fHabPrecio) || 0,
                  planta: Number(fHabPlanta) || 1,
                  estado: habSeleccionada.estado,
                });
                setDialogEditarHabOpen(false);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Save className="h-4 w-4" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== DIALOG: Nueva reserva ============== */}
      <Dialog
        open={dialogNuevaReservaOpen}
        onOpenChange={setDialogNuevaReservaOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <CalendarDays className="h-4 w-4" /> Nueva reserva
              {habSeleccionada && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 ml-1"
                >
                  Hab. {habSeleccionada.numero}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Completa huésped y fechas. Las noches se calculan automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!habSeleccionada && (
              <div className="space-y-1">
                <Label className="text-xs">Habitación *</Label>
                <Select
                  value={fResHabId}
                  onValueChange={(v) => {
                    setFResHabId(v);
                    const h = habitaciones.find((x) => x.id === v);
                    if (h) {
                      setFResTarifa(h.precioBase);
                      setHabSeleccionada(h);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona habitación disponible" />
                  </SelectTrigger>
                  <SelectContent>
                    {habitaciones
                      .filter((h) => h.estado === "disponible")
                      .map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.numero} · {h.codigo} · {formatCurrency(h.precioBase)}/noche
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Cliente (opcional)</Label>
              <Select
                value={fResTerceroId}
                onValueChange={(v) => {
                  setFResTerceroId(v);
                  const t = terceros.find((x) => x.id === v);
                  if (t) setFResNombreHuesped(t.nombre);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cliente libre" />
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
            <div className="space-y-1">
              <Label className="text-xs">Nombre huésped *</Label>
              <Input
                value={fResNombreHuesped}
                onChange={(e) => setFResNombreHuesped(e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Check-in *</Label>
                <Input
                  type="date"
                  value={fResCheckin}
                  onChange={(e) => setFResCheckin(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Check-out *</Label>
                <Input
                  type="date"
                  value={fResCheckout}
                  onChange={(e) => setFResCheckout(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tarifa/noche</Label>
                <Input
                  type="number"
                  min={0}
                  value={fResTarifa}
                  onChange={(e) =>
                    setFResTarifa(Number(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Noches</Label>
                <Input
                  disabled
                  value={computeNoches(fResCheckin, fResCheckout)}
                  className="bg-neutral-50 dark:bg-neutral-900"
                />
              </div>
            </div>
            {fResCheckin &&
              fResCheckout &&
              Number(fResTarifa) > 0 && (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-200 flex justify-between">
                  <span>Total estimado:</span>
                  <span className="font-semibold">
                    {formatCurrency(
                      computeNoches(fResCheckin, fResCheckout) *
                        (Number(fResTarifa) || 0),
                    )}
                  </span>
                </div>
              )}
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Input
                value={fResObs}
                onChange={(e) => setFResObs(e.target.value)}
                placeholder="Cuna, late check-out, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogNuevaReservaOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={crearReserva}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CalendarDays className="h-4 w-4" /> Confirmar reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Helpers ----------
function computeNoches(checkin: string, checkout: string): number {
  if (!checkin || !checkout) return 0;
  const c = new Date(checkin);
  const o = new Date(checkout);
  if (Number.isNaN(c.getTime()) || Number.isNaN(o.getTime())) return 0;
  const diff = o.getTime() - c.getTime();
  if (diff <= 0) return 0;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

// ---------- Subcomponentes ----------

function HabitacionCard({
  habitacion,
  onClick,
}: {
  habitacion: Habitacion;
  onClick: () => void;
}) {
  const stInfo = getEstadoHab(habitacion.estado);
  const tipoInfo = getTipoHab(habitacion.tipo);
  const TipoIcon = tipoInfo.Icon;
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition-all hover:shadow-md hover:scale-[1.02] ${stInfo.color}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-bold text-lg leading-tight">
            {habitacion.numero}
          </div>
          <div className="text-[10px] opacity-70 font-mono">
            {habitacion.codigo}
          </div>
        </div>
        <TipoIcon className="h-4 w-4 opacity-80" />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] opacity-80">
        <Users className="h-3 w-3" />
        <span>
          {habitacion.capacidad} pers. · {tipoInfo.label}
        </span>
      </div>
      <div className="mt-1 text-[10px] font-semibold">
        {formatCurrency(habitacion.precioBase)}/noche
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-wider opacity-70">
        {stInfo.label}
      </div>
    </button>
  );
}

function EstadoReservaBadge({ estado }: { estado: string }) {
  const info = ESTADO_RESERVA[estado] ?? ESTADO_RESERVA.confirmada;
  const Icon = info.Icon;
  return (
    <Badge variant="outline" className={`gap-1 ${info.color}`}>
      <Icon className="h-3 w-3" /> {info.label}
    </Badge>
  );
}

function GestionHabitaciones({
  habitaciones,
  loading,
  onEdit,
  onCambiarEstado,
  onNueva,
}: {
  habitaciones: Habitacion[];
  loading: boolean;
  onEdit: (h: Habitacion) => void;
  onCambiarEstado: (h: Habitacion, estado: Habitacion["estado"]) => void;
  onNueva: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">
          Edita propiedades y estado de cada habitación.
        </div>
        <Button
          size="sm"
          onClick={onNueva}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4" /> Nueva habitación
        </Button>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : habitaciones.length === 0 ? (
        <div className="text-center py-10 text-neutral-500">
          <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
          No hay habitaciones para configurar.
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[80px]">Número</TableHead>
                  <TableHead className="min-w-[80px]">Código</TableHead>
                  <TableHead className="min-w-[100px]">Tipo</TableHead>
                  <TableHead className="text-center min-w-[80px]">Cap.</TableHead>
                  <TableHead className="text-right min-w-[120px]">
                    Precio base
                  </TableHead>
                  <TableHead className="text-center min-w-[80px]">Planta</TableHead>
                  <TableHead className="text-center min-w-[120px]">Estado</TableHead>
                  <TableHead className="text-center min-w-[140px]">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {habitaciones.map((h) => {
                  const st = getEstadoHab(h.estado);
                  return (
                    <TableRow
                      key={h.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                    >
                      <TableCell className="font-bold text-emerald-700 dark:text-emerald-300">
                        {h.numero}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {h.codigo}
                      </TableCell>
                      <TableCell>
                        {getTipoHab(h.tipo).label ?? h.tipo}
                      </TableCell>
                      <TableCell className="text-center">{h.capacidad}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(h.precioBase)}
                      </TableCell>
                      <TableCell className="text-center">{h.planta}</TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <Badge
                            variant="outline"
                            className={`gap-1 ${st.color}`}
                          >
                            <CircleDot className="h-2.5 w-2.5" /> {st.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Select
                            value={h.estado}
                            onValueChange={(v) =>
                              onCambiarEstado(h, v as Habitacion["estado"])
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-[110px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="disponible">Disponible</SelectItem>
                              <SelectItem value="ocupada">Ocupada</SelectItem>
                              <SelectItem value="sucia">Sucia</SelectItem>
                              <SelectItem value="mantenimiento">
                                Mantenim.
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => onEdit(h)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function TarifasView({
  habitaciones,
  reservas,
}: {
  habitaciones: Habitacion[];
  reservas: Reserva[];
}) {
  const tipos = ["sencilla", "doble", "matrimonial", "suite"];
  const stats = tipos.map((tipo) => {
    const delTipo = habitaciones.filter((h) => h.tipo === tipo);
    const total = delTipo.length;
    if (total === 0) {
      return {
        tipo,
        total: 0,
        precioPromedio: 0,
        ocupadas: 0,
        ocupacionPct: 0,
      };
    }
    const precioPromedio =
      delTipo.reduce((acc, h) => acc + h.precioBase, 0) / total;
    const ocupadas = delTipo.filter((h) => h.estado === "ocupada").length;
    return {
      tipo,
      total,
      precioPromedio,
      ocupadas,
      ocupacionPct: Math.round((ocupadas / total) * 100),
    };
  });

  return (
    <div className="space-y-4">
      <div className="text-xs text-neutral-500">
        Resumen de tarifas y ocupación actual por tipo de habitación.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => {
          const tipoInfo = TIPO_HAB[s.tipo] ?? TIPO_HAB.sencilla;
          const TipoIcon = tipoInfo.Icon;
          return (
            <div
              key={s.tipo}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                  <TipoIcon className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold">{tipoInfo.label}</div>
                  <div className="text-[10px] text-neutral-500">
                    {s.total} hab. · {s.ocupadas} ocup.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[10px] uppercase text-neutral-500 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Precio prom.
                  </div>
                  <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {s.total > 0 ? formatCurrency(s.precioPromedio) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-neutral-500 flex items-center gap-1">
                    <Percent className="h-3 w-3" /> Ocupación
                  </div>
                  <div className="font-semibold">
                    {s.total > 0 ? `${s.ocupacionPct}%` : "—"}
                  </div>
                </div>
              </div>
              {/* Barra de ocupación */}
              <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                  style={{ width: `${s.ocupacionPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen de reservas activas */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
          Reservas activas (confirmadas + check-in)
        </div>
        <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
          {
            reservas.filter(
              (r) => r.estado === "confirmada" || r.estado === "checkin",
            ).length
          }
        </div>
        <div className="text-xs text-neutral-500 mt-1">
          {reservas.filter((r) => r.estado === "checkin").length} en
          check-in · {reservas.filter((r) => r.estado === "confirmada").length}{" "}
          confirmadas
        </div>
      </div>
    </div>
  );
}

export default HotelView;
