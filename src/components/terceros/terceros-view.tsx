"use client";

// ============================================================
// ERP Marsella — Vista de Terceros
// Componente: TercerosView
// Listado + búsqueda + filtro por tipo + CRUD completo
// Accento visual: emerald/teal (sin azul/índigo)
// ============================================================

import { useEffect, useState, useCallback, useRef } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  UserPlus,
  Building2,
  Truck,
  Handshake,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

// ---------- Tipos ----------
type TipoTercero = "cliente" | "proveedor" | "empleado" | "socio";
type TipoFiltro = "todos" | TipoTercero;

interface CiudadOption {
  id: string;
  codigoDane: string;
  nombre: string;
  departamento: string;
}

interface Tercero {
  id: string;
  tipo: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  apellido1?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  ciudadId?: string | null;
  regimenTributario?: string;
  cupoCredito?: number;
  diasPlazo?: number;
  saldoCartera?: number;
  activo?: boolean;
  createdAt?: string;
  ciudad?: { id: string; nombre: string; departamento: string } | null;
}

// ---------- Helpers ----------
const formatCOP = (n: number | undefined | null): string => {
  const value = Number(n ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const TIPO_LABEL: Record<string, string> = {
  cliente: "Cliente",
  proveedor: "Proveedor",
  empleado: "Empleado",
  socio: "Socio",
  todos: "Todos",
};

const TIPO_ICON: Record<TipoTercero, typeof Users> = {
  cliente: Users,
  proveedor: Truck,
  empleado: UserPlus,
  socio: Handshake,
};

const TIPOS: TipoTercero[] = ["cliente", "proveedor", "empleado", "socio"];

const TIPO_DOC_OPTIONS = [
  { value: "CC", label: "C.C. — Cédula de ciudadanía" },
  { value: "NIT", label: "NIT — Registro tributario" },
  { value: "CE", label: "C.E. — Cédula de extranjería" },
  { value: "TI", label: "T.I. — Tarjeta de identidad" },
  { value: "PT", label: "P.T. — Pasaporte" },
];

const REGIMEN_OPTIONS = [
  { value: "simple", label: "Régimen Simple" },
  { value: "comun", label: "Común" },
  { value: "gran_contribuyente", label: "Gran Contribuyente" },
  { value: "no_responsable", label: "No responsable" },
];

const TIPO_BADGE_CLASS: Record<string, string> = {
  cliente:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  proveedor:
    "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900",
  empleado:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  socio:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900",
};

// ---------- Estado del formulario ----------
interface FormState {
  tipo: TipoTercero;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  apellido1: string;
  direccion: string;
  telefono: string;
  email: string;
  ciudadId: string; // "" => sin ciudad
  regimenTributario: string;
  cupoCredito: string;
  diasPlazo: string;
}

const emptyForm: FormState = {
  tipo: "cliente",
  tipoDocumento: "CC",
  numeroDocumento: "",
  nombre: "",
  apellido1: "",
  direccion: "",
  telefono: "",
  email: "",
  ciudadId: "",
  regimenTributario: "comun",
  cupoCredito: "0",
  diasPlazo: "0",
};

function toFormState(t: Tercero): FormState {
  return {
    tipo: (t.tipo as TipoTercero) || "cliente",
    tipoDocumento: t.tipoDocumento || "CC",
    numeroDocumento: t.numeroDocumento || "",
    nombre: t.nombre || "",
    apellido1: t.apellido1 || "",
    direccion: t.direccion || "",
    telefono: t.telefono || "",
    email: t.email || "",
    ciudadId: t.ciudadId || "",
    regimenTributario: t.regimenTributario || "comun",
    cupoCredito: String(t.cupoCredito ?? 0),
    diasPlazo: String(t.diasPlazo ?? 0),
  };
}

// ============================================================
// Componente principal
// ============================================================
export function TercerosView() {
  const [items, setItems] = useState<Tercero[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");

  const [ciudades, setCiudades] = useState<CiudadOption[]>([]);
  const [ciudadesLoading, setCiudadesLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tercero | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<Tercero | null>(null);
  const [deleting, setDeleting] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Debounce búsqueda ----------
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchDebounced(search.trim());
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // ---------- Cargar ciudades ----------
  const loadCiudades = useCallback(async () => {
    setCiudadesLoading(true);
    try {
      const r = await fetch("/api/ciudades");
      const d = await r.json();
      setCiudades(Array.isArray(d) ? d : []);
    } catch {
      toast.error("No se pudieron cargar las ciudades");
      setCiudades([]);
    } finally {
      setCiudadesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCiudades();
  }, [loadCiudades]);

  // ---------- Cargar terceros ----------
  const loadTerceros = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tipoFiltro !== "todos") params.set("tipo", tipoFiltro);
      if (searchDebounced) params.set("q", searchDebounced);
      params.set("pageSize", "100");
      const r = await fetch(`/api/terceros?${params.toString()}`);
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al cargar terceros");
        setItems([]);
      } else {
        setItems(d.items ?? []);
        setTotal(d.total ?? 0);
      }
    } catch {
      toast.error("Error de red al cargar terceros");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tipoFiltro, searchDebounced]);

  useEffect(() => {
    loadTerceros();
  }, [loadTerceros]);

  // ---------- Handlers ----------
  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(t: Tercero) {
    setEditing(t);
    setForm(toFormState(t));
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Validación mínima cliente
    if (!form.numeroDocumento.trim()) {
      toast.error("El número de documento es obligatorio");
      return;
    }
    if (!form.nombre.trim()) {
      toast.error("El nombre / razón social es obligatorio");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("El email no es válido");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tipo: form.tipo,
        tipoDocumento: form.tipoDocumento,
        numeroDocumento: form.numeroDocumento.trim(),
        nombre: form.nombre.trim(),
        apellido1: form.apellido1.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        email: form.email.trim() || "",
        ciudadId: form.ciudadId || undefined,
        regimenTributario: form.regimenTributario,
        cupoCredito: Number(form.cupoCredito || 0),
        diasPlazo: Number(form.diasPlazo || 0),
      };

      const isEdit = !!editing;
      const r = await fetch("/api/terceros", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: editing!.id, ...payload } : payload),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al guardar tercero");
        return;
      }
      toast.success(
        isEdit
          ? `Tercero «${payload.nombre}» actualizado`
          : `Tercero «${payload.nombre}» creado`,
      );
      setDialogOpen(false);
      await loadTerceros();
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/terceros?id=${encodeURIComponent(toDelete.id)}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al eliminar");
        return;
      }
      toast.success(`Tercero «${toDelete.nombre}» desactivado`);
      setToDelete(null);
      await loadTerceros();
    } catch {
      toast.error("Error de red al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  // ---------- Render ----------
  const totalActivos = items.filter((i) => i.activo).length;
  const totalInactivos = items.length - totalActivos;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header + métricas */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Terceros
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Clientes, proveedores, empleados y socios unificados
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
              {total}
            </span>
            <span className="text-emerald-600/80 dark:text-emerald-400/80 ml-1">
              total
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <span className="font-semibold text-neutral-800 dark:text-neutral-100">
              {totalActivos}
            </span>
            <span className="text-neutral-500 dark:text-neutral-400 ml-1">
              activos
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <span className="font-semibold text-neutral-800 dark:text-neutral-100">
              {totalInactivos}
            </span>
            <span className="text-neutral-500 dark:text-neutral-400 ml-1">
              inactivos
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar: búsqueda + filtros tipo + acción */}
      <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Búsqueda */}
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Buscar por nombre, NIT o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Buscar terceros"
              />
            </div>

            {/* Filtros tipo (toggle) */}
            <div
              className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1"
              role="group"
              aria-label="Filtrar por tipo"
            >
              <TipoToggleButton
                active={tipoFiltro === "todos"}
                onClick={() => setTipoFiltro("todos")}
              >
                Todos
              </TipoToggleButton>
              {TIPOS.map((t) => {
                const Icon = TIPO_ICON[t];
                const active = tipoFiltro === t;
                return (
                  <TipoToggleButton
                    key={t}
                    active={active}
                    onClick={() => setTipoFiltro(t)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {TIPO_LABEL[t]}
                  </TipoToggleButton>
                );
              })}
            </div>

            {/* Acción principal */}
            <Button
              onClick={openCreate}
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 w-full lg:w-auto"
            >
              <Plus className="h-4 w-4" />
              Nuevo tercero
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Listado de terceros
          </CardTitle>
          <CardDescription>
            {loading
              ? "Cargando..."
              : `${items.length} de ${total} registros mostrados`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-32" />
                  <Skeleton className="h-9 w-48" />
                  <Skeleton className="h-9 w-20" />
                  <Skeleton className="h-9 w-32" />
                  <Skeleton className="h-9 w-28 ml-auto" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-3">
                <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                No hay terceros registrados
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {searchDebounced || tipoFiltro !== "todos"
                  ? "Ajusta la búsqueda o los filtros para ver resultados."
                  : "Crea el primer tercero con el botón «Nuevo tercero»."}
              </p>
              <Button
                variant="outline"
                onClick={openCreate}
                className="mt-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              >
                <Plus className="h-4 w-4" />
                Crear tercero
              </Button>
            </div>
          ) : (
            <div className="max-h-[calc(100vh-22rem)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgb(168_162_158)_transparent]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                  <TableRow className="border-neutral-200 dark:border-neutral-800 hover:bg-transparent">
                    <TableHead className="min-w-[140px]">Documento</TableHead>
                    <TableHead className="min-w-[200px]">Nombre</TableHead>
                    <TableHead className="min-w-[120px]">Tipo</TableHead>
                    <TableHead className="min-w-[140px]">Teléfono</TableHead>
                    <TableHead className="min-w-[200px]">Email</TableHead>
                    <TableHead className="min-w-[160px]">Ciudad</TableHead>
                    <TableHead className="min-w-[140px] text-right">
                      Saldo cartera
                    </TableHead>
                    <TableHead className="min-w-[100px]">Estado</TableHead>
                    <TableHead className="min-w-[90px] text-right">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((t) => {
                    const TipoIcon =
                      TIPO_ICON[t.tipo as TipoTercero] ?? Building2;
                    return (
                      <TableRow
                        key={t.id}
                        className="border-neutral-100 dark:border-neutral-800/60"
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                              {t.tipoDocumento}
                            </span>
                            <span className="font-mono text-sm font-medium">
                              {t.numeroDocumento}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                              {t.nombre}
                            </span>
                            {t.apellido1 ? (
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                {t.apellido1}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`inline-flex items-center gap-1 font-medium ${
                              TIPO_BADGE_CLASS[t.tipo] ??
                              "border-neutral-200 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
                            }`}
                          >
                            <TipoIcon className="h-3 w-3" />
                            {TIPO_LABEL[t.tipo] ?? t.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {t.telefono ? (
                            <span className="inline-flex items-center gap-1 text-sm text-neutral-700 dark:text-neutral-300">
                              <Phone className="h-3 w-3 text-neutral-400" />
                              {t.telefono}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {t.email ? (
                            <span className="inline-flex items-center gap-1 text-sm text-neutral-700 dark:text-neutral-300 truncate max-w-[220px]">
                              <Mail className="h-3 w-3 text-neutral-400 shrink-0" />
                              <span className="truncate">{t.email}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {t.ciudad ? (
                            <span className="inline-flex items-center gap-1 text-sm text-neutral-700 dark:text-neutral-300">
                              <MapPin className="h-3 w-3 text-neutral-400" />
                              {t.ciudad.nombre}
                              <span className="text-xs text-neutral-400">
                                · {t.ciudad.departamento}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-mono text-sm font-semibold ${
                                (t.saldoCartera ?? 0) > 0
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-neutral-700 dark:text-neutral-300"
                              }`}
                            >
                              {formatCOP(t.saldoCartera)}
                            </span>
                            {(t.cupoCredito ?? 0) > 0 ? (
                              <span className="text-[10px] text-neutral-400">
                                Cupo {formatCOP(t.cupoCredito)}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.activo ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900 hover:bg-emerald-100">
                              Activo
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-neutral-500 dark:text-neutral-400"
                            >
                              Inactivo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-neutral-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                              onClick={() => openEdit(t)}
                              aria-label={`Editar ${t.nombre}`}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                              onClick={() => setToDelete(t)}
                              aria-label={`Eliminar ${t.nombre}`}
                              title="Desactivar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto [scrollbar-width:thin]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <UserPlus className="h-4 w-4" />
              </span>
              {editing ? "Editar tercero" : "Nuevo tercero"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifica los datos del tercero seleccionado."
                : "Completa el formulario para registrar un nuevo tercero."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Sección: Identificación */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Identificación
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-tipo">Tipo de tercero *</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, tipo: v as TipoTercero }))
                    }
                  >
                    <SelectTrigger id="f-tipo" className="w-full">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => {
                        const Icon = TIPO_ICON[t];
                        return (
                          <SelectItem key={t} value={t}>
                            <Icon className="h-3.5 w-3.5" />
                            {TIPO_LABEL[t]}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-tipoDoc">Tipo de documento *</Label>
                  <Select
                    value={form.tipoDocumento}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, tipoDocumento: v }))
                    }
                  >
                    <SelectTrigger id="f-tipoDoc" className="w-full">
                      <SelectValue placeholder="Tipo documento" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_DOC_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-doc">Número de documento *</Label>
                  <Input
                    id="f-doc"
                    value={form.numeroDocumento}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        numeroDocumento: e.target.value,
                      }))
                    }
                    placeholder="800.123.456-7"
                    className="font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-nombre">Nombre / Razón social *</Label>
                  <Input
                    id="f-nombre"
                    value={form.nombre}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nombre: e.target.value }))
                    }
                    placeholder="Comercializadora Marsella S.A.S."
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-apellido1">Apellido (si persona natural)</Label>
                  <Input
                    id="f-apellido1"
                    value={form.apellido1}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, apellido1: e.target.value }))
                    }
                    placeholder="Pérez"
                  />
                </div>
              </div>
            </fieldset>

            {/* Sección: Contacto */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Contacto
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="f-direccion">Dirección</Label>
                  <Input
                    id="f-direccion"
                    value={form.direccion}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, direccion: e.target.value }))
                    }
                    placeholder="Cll 50 # 45-23, Of 401"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-tel">Teléfono</Label>
                  <Input
                    id="f-tel"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefono: e.target.value }))
                    }
                    placeholder="+57 300 000 0000"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-email">Email</Label>
                  <Input
                    id="f-email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    placeholder="cliente@correo.com"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="f-ciudad">Ciudad</Label>
                  <Select
                    value={form.ciudadId}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, ciudadId: v === "__none__" ? "" : v }))
                    }
                  >
                    <SelectTrigger id="f-ciudad" className="w-full">
                      <SelectValue
                        placeholder={
                          ciudadesLoading
                            ? "Cargando ciudades..."
                            : "Sin ciudad"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-neutral-400">— Sin ciudad —</span>
                      </SelectItem>
                      {ciudades.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre} · {c.departamento}
                          <span className="text-xs text-neutral-400 ml-1">
                            ({c.codigoDane})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </fieldset>

            {/* Sección: Fiscal / Crédito */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Fiscal y crédito
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-regimen">Régimen tributario</Label>
                  <Select
                    value={form.regimenTributario}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, regimenTributario: v }))
                    }
                  >
                    <SelectTrigger id="f-regimen" className="w-full">
                      <SelectValue placeholder="Régimen" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIMEN_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-cupo">Cupo de crédito (COP)</Label>
                  <Input
                    id="f-cupo"
                    type="number"
                    min={0}
                    step={1000}
                    value={form.cupoCredito}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cupoCredito: e.target.value }))
                    }
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="f-plazo">Días de plazo</Label>
                  <Input
                    id="f-plazo"
                    type="number"
                    min={0}
                    step={1}
                    value={form.diasPlazo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, diasPlazo: e.target.value }))
                    }
                    className="font-mono"
                  />
                </div>
              </div>
            </fieldset>

            <DialogFooter className="pt-2 border-t border-neutral-100 dark:border-neutral-800 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear tercero"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación (soft delete) */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar tercero?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción desactiva a{" "}
              <span className="font-semibold text-neutral-800 dark:text-neutral-100">
                {toDelete?.nombre}
              </span>{" "}
              ({toDelete?.tipoDocumento} {toDelete?.numeroDocumento}). El
              registro se conserva y puede reactivarse desde la base de datos.
              No afecta los saldos históricos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
            >
              {deleting ? "Desactivando..." : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Subcomponente: botón toggle de filtro de tipo
// ============================================================
function TipoToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-emerald-700 shadow-sm dark:bg-neutral-800 dark:text-emerald-300"
          : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
