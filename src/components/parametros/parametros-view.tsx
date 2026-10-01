"use client";

// ============================================================
// ERP Marsella — Vista de Parámetros
// Empresa | Resolución DIAN | Usuarios y roles | Tipos de documento | Info sistema
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Save,
  Plus,
  Users,
  FileText,
  Info,
  Hash,
  Calendar,
  Settings2,
  ShieldCheck,
  Server,
  Cpu,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Mail,
  Lock,
  UserCircle,
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
import { Switch } from "@/components/ui/switch";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ---------- Tipos ----------
type RegimenTributario = "simple" | "comun" | "gran_contribuyente";
type Responsabilidad = "iva" | "no_responsable";
type Moneda = "COP" | "USD" | "EUR" | "MXN" | "ARS";
type TipoOperacion = "estandar" | "pos" | "exportacion" | "no_dian";
type Ambiente = "pruebas" | "produccion";
type Rol = "admin" | "contador" | "cajero" | "vendedor" | "bodeguero";

interface EmpresaForm {
  id?: string;
  nit: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  telefono: string;
  ciudad: string;
  email: string;
  website: string;
  representanteLegal: string;
  regimenTributario: RegimenTributario;
  responsabilidad: Responsabilidad;
  moneda: Moneda;
  decimales: number;
  zonaHoraria: string;
  logo: string;
}

interface ResolucionDian {
  id?: string;
  numeroResolucion: string;
  fechaResolucion: string;
  fechaInicioVigencia: string;
  fechaFinVigencia: string;
  prefijo: string;
  rangoInicio: number;
  rangoFin: number;
  consecutivoSiguiente: number;
  tipoOperacion: TipoOperacion;
  ambiente: Ambiente;
  activa: boolean;
}

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  telefono?: string | null;
  cargo?: string | null;
  ultimoLogin?: string | null;
  createdAt?: string;
}

interface TipoDocumento {
  id: string;
  codigo: string;
  nombre: string;
  naturaleza: string;
  afectaCartera: string;
  afectaInventario: string;
  consecutivoSiguiente: number;
}

// ---------- Helpers UI ----------
const REGIMEN_LABEL: Record<RegimenTributario, string> = {
  simple: "Simple",
  comun: "Común",
  gran_contribuyente: "Gran Contribuyente",
};

const RESP_LABEL: Record<Responsabilidad, string> = {
  iva: "Responsable de IVA",
  no_responsable: "No Responsable",
};

const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  contador: "Contador",
  cajero: "Cajero",
  vendedor: "Vendedor",
  bodeguero: "Bodeguero",
};

const ROL_VARIANT: Record<Rol, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "default",
  contador: "secondary",
  cajero: "outline",
  vendedor: "outline",
  bodeguero: "outline",
};

function toIsoDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ============================================================
// Componente principal
// ============================================================
export function ParametrosView({
  empresa,
  usuario,
  onReload,
}: {
  empresa?: any;
  usuario?: any;
  onReload?: () => void;
}) {
  const [tab, setTab] = useState<
    "empresa" | "resolucion" | "usuarios" | "tipos" | "sistema"
  >("empresa");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Settings2 className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Configuración
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Parámetros del ERP
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Gestione la información de su empresa, resoluciones DIAN, usuarios
            y catálogos del sistema.
          </p>
        </div>
        {usuario && (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Sesión: {usuario?.email ?? "—"}
          </Badge>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as any)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 lg:max-w-3xl">
          <TabsTrigger value="empresa" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Empresa</span>
            <span className="sm:hidden">Empresa</span>
          </TabsTrigger>
          <TabsTrigger value="resolucion" className="gap-1.5">
            <Hash className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Resolución DIAN</span>
            <span className="sm:hidden">DIAN</span>
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Usuarios y roles</span>
            <span className="sm:hidden">Usuarios</span>
          </TabsTrigger>
          <TabsTrigger value="tipos" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tipos de documento</span>
            <span className="sm:hidden">Tipos</span>
          </TabsTrigger>
          <TabsTrigger value="sistema" className="gap-1.5">
            <Info className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sistema</span>
            <span className="sm:hidden">Sistema</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empresa" className="mt-4">
          <EmpresaTab empresa={empresa} onReload={onReload} />
        </TabsContent>

        <TabsContent value="resolucion" className="mt-4">
          <ResolucionTab />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4">
          <UsuariosTab />
        </TabsContent>

        <TabsContent value="tipos" className="mt-4">
          <TiposDocumentoTab />
        </TabsContent>

        <TabsContent value="sistema" className="mt-4">
          <SistemaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Tab 1 — Empresa
// ============================================================
function EmpresaTab({
  empresa,
  onReload,
}: {
  empresa?: any;
  onReload?: () => void;
}) {
  const [form, setForm] = useState<EmpresaForm>({
    nit: "",
    razonSocial: "",
    nombreComercial: "",
    direccion: "",
    telefono: "",
    ciudad: "",
    email: "",
    website: "",
    representanteLegal: "",
    regimenTributario: "comun",
    responsabilidad: "iva",
    moneda: "COP",
    decimales: 2,
    zonaHoraria: "America/Bogota",
    logo: "",
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync prop → state cuando llega / cambia la empresa
  useEffect(() => {
    if (!empresa) return;
    setForm({
      id: empresa.id,
      nit: empresa.nit ?? "",
      razonSocial: empresa.razonSocial ?? "",
      nombreComercial: empresa.nombreComercial ?? "",
      direccion: empresa.direccion ?? "",
      telefono: empresa.telefono ?? "",
      ciudad: empresa.ciudad ?? "",
      email: empresa.email ?? "",
      website: empresa.website ?? "",
      representanteLegal: empresa.representanteLegal ?? "",
      regimenTributario:
        (empresa.regimenTributario as RegimenTributario) ?? "comun",
      responsabilidad:
        (empresa.responsabilidad as Responsabilidad) ?? "iva",
      moneda: (empresa.moneda as Moneda) ?? "COP",
      decimales: empresa.decimales ?? 2,
      zonaHoraria: empresa.zonaHoraria ?? "America/Bogota",
      logo: empresa.logo ?? "",
    });
    setDirty(false);
  }, [empresa]);

  const update = useCallback(
    <K extends keyof EmpresaForm>(key: K, value: EmpresaForm[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
      setDirty(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!form.id) {
      toast.error("No hay empresa cargada para guardar");
      return;
    }
    if (!form.nit.trim() || !form.razonSocial.trim()) {
      toast.error("NIT y razón social son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/empresas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          nit: form.nit,
          razonSocial: form.razonSocial,
          nombreComercial: form.nombreComercial || null,
          direccion: form.direccion || null,
          telefono: form.telefono || null,
          ciudad: form.ciudad || null,
          email: form.email || null,
          website: form.website || null,
          representanteLegal: form.representanteLegal || null,
          regimenTributario: form.regimenTributario,
          responsabilidad: form.responsabilidad,
          moneda: form.moneda,
          decimales: Number(form.decimales),
          zonaHoraria: form.zonaHoraria,
          logo: form.logo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al guardar la empresa");
        return;
      }
      toast.success("Empresa actualizada correctamente");
      setDirty(false);
      onReload?.();
    } catch (e) {
      toast.error("Error de red al guardar la empresa");
    } finally {
      setSaving(false);
    }
  }, [form, onReload]);

  return (
    <Card className="border-neutral-200 dark:border-neutral-800">
      <CardHeader className="border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Building2 className="h-4 w-4" />
              Datos de la empresa
            </CardTitle>
            <CardDescription className="mt-1">
              Información legal y tributaria usada en documentos fiscales.
            </CardDescription>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="NIT *" htmlFor="nit">
            <Input
              id="nit"
              value={form.nit}
              onChange={(e) => update("nit", e.target.value)}
              placeholder="900.123.456-7"
            />
          </Field>
          <Field label="Razón social *" htmlFor="razon">
            <Input
              id="razon"
              value={form.razonSocial}
              onChange={(e) => update("razonSocial", e.target.value)}
              placeholder="Marsella SAS"
            />
          </Field>
          <Field label="Nombre comercial" htmlFor="nombreCom">
            <Input
              id="nombreCom"
              value={form.nombreComercial}
              onChange={(e) => update("nombreComercial", e.target.value)}
              placeholder="Distribuidora Marsella"
            />
          </Field>
          <Field label="Dirección" htmlFor="dir">
            <Input
              id="dir"
              value={form.direccion}
              onChange={(e) => update("direccion", e.target.value)}
              placeholder="Calle 80 # 45-23"
            />
          </Field>
          <Field label="Teléfono" htmlFor="tel">
            <Input
              id="tel"
              value={form.telefono}
              onChange={(e) => update("telefono", e.target.value)}
              placeholder="+57 300 000 0000"
            />
          </Field>
          <Field label="Ciudad" htmlFor="ciu">
            <Input
              id="ciu"
              value={form.ciudad}
              onChange={(e) => update("ciudad", e.target.value)}
              placeholder="Bogotá D.C."
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="facturacion@marsella.co"
            />
          </Field>
          <Field label="Website" htmlFor="web">
            <Input
              id="web"
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://marsella.co"
            />
          </Field>
          <Field label="Representante legal" htmlFor="rep">
            <Input
              id="rep"
              value={form.representanteLegal}
              onChange={(e) => update("representanteLegal", e.target.value)}
              placeholder="Juan Pérez"
            />
          </Field>
          <Field label="Régimen tributario" htmlFor="regimen">
            <Select
              value={form.regimenTributario}
              onValueChange={(v) => update("regimenTributario", v as RegimenTributario)}
            >
              <SelectTrigger id="regimen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="comun">Común</SelectItem>
                <SelectItem value="gran_contribuyente">
                  Gran Contribuyente
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Responsabilidad" htmlFor="resp">
            <Select
              value={form.responsabilidad}
              onValueChange={(v) => update("responsabilidad", v as Responsabilidad)}
            >
              <SelectTrigger id="resp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iva">Responsable de IVA</SelectItem>
                <SelectItem value="no_responsable">
                  No Responsable
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Moneda" htmlFor="mon">
            <Select
              value={form.moneda}
              onValueChange={(v) => update("moneda", v as Moneda)}
            >
              <SelectTrigger id="mon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COP">COP — Peso colombiano</SelectItem>
                <SelectItem value="USD">USD — Dólar</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="MXN">MXN — Peso mexicano</SelectItem>
                <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Decimales" htmlFor="dec">
            <Input
              id="dec"
              type="number"
              min={0}
              max={6}
              value={form.decimales}
              onChange={(e) =>
                update("decimales", parseInt(e.target.value || "0", 10))
              }
            />
          </Field>
          <Field label="Zona horaria" htmlFor="zh">
            <Select
              value={form.zonaHoraria}
              onValueChange={(v) => update("zonaHoraria", v)}
            >
              <SelectTrigger id="zh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Bogota">America/Bogota</SelectItem>
                <SelectItem value="America/Mexico_City">
                  America/Mexico_City
                </SelectItem>
                <SelectItem value="America/Argentina/Buenos_Aires">
                  America/Argentina/Buenos_Aires
                </SelectItem>
                <SelectItem value="America/Lima">America/Lima</SelectItem>
                <SelectItem value="America/Santiago">America/Santiago</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Logo (URL o base64)" htmlFor="logo">
            <Input
              id="logo"
              value={form.logo}
              onChange={(e) => update("logo", e.target.value)}
              placeholder="https://.../logo.png"
            />
          </Field>
        </div>

        {dirty && (
          <Alert className="mt-6 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Cambios sin guardar</AlertTitle>
            <AlertDescription>
              Pulse «Guardar» para persistir las modificaciones.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ============================================================
// Tab 2 — Resolución DIAN
// ============================================================
const TIPO_OP_LABEL: Record<TipoOperacion, string> = {
  estandar: "Estándar",
  pos: "POS",
  exportacion: "Exportación",
  no_dian: "Sin DIAN",
};

function ResolucionTab() {
  const [items, setItems] = useState<ResolucionDian[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/resolucion-dian");
      const d = await r.json();
      if (Array.isArray(d)) {
        setItems(
          d.map((x: any) => ({
            id: x.id,
            numeroResolucion: x.numeroResolucion ?? "",
            fechaResolucion: toIsoDate(x.fechaResolucion),
            fechaInicioVigencia: toIsoDate(x.fechaInicioVigencia),
            fechaFinVigencia: toIsoDate(x.fechaFinVigencia),
            prefijo: x.prefijo ?? "",
            rangoInicio: x.rangoInicio ?? 0,
            rangoFin: x.rangoFin ?? 0,
            consecutivoSiguiente: x.consecutivoSiguiente ?? 0,
            tipoOperacion: (x.tipoOperacion as TipoOperacion) ?? "estandar",
            ambiente: (x.ambiente as Ambiente) ?? "produccion",
            activa: !!x.activa,
          })),
        );
      } else {
        setItems([]);
      }
    } catch {
      toast.error("Error al cargar resoluciones DIAN");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="border-neutral-200 dark:border-neutral-800">
      <CardHeader className="border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Hash className="h-4 w-4" />
              Resoluciones DIAN
            </CardTitle>
            <CardDescription className="mt-1">
              Numeración autorizada para facturación electrónica.
            </CardDescription>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Nueva resolución
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 w-full animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Sin resoluciones</AlertTitle>
            <AlertDescription>
              Registre su primera resolución DIAN para comenzar a facturar.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((r) => (
              <ResolucionCard key={r.id ?? r.numeroResolucion} r={r} />
            ))}
          </div>
        )}
      </CardContent>

      <NuevaResolucionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
      />
    </Card>
  );
}

function ResolucionCard({ r }: { r: ResolucionDian }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {r.prefijo || "—"}
          </div>
          <div className="mt-0.5 text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Resolución {r.numeroResolucion}
          </div>
        </div>
        {r.activa ? (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Activa
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="mr-1 h-3 w-3" />
            Inactiva
          </Badge>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" /> Resolución
        </span>
        <span className="text-right font-medium text-neutral-900 dark:text-neutral-100">
          {formatDate(r.fechaResolucion)}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" /> Vigencia
        </span>
        <span className="text-right font-medium text-neutral-900 dark:text-neutral-100">
          {formatDate(r.fechaInicioVigencia)} → {formatDate(r.fechaFinVigencia)}
        </span>
        <span className="flex items-center gap-1">
          <Hash className="h-3 w-3" /> Rango
        </span>
        <span className="text-right font-medium text-neutral-900 dark:text-neutral-100">
          {r.rangoInicio.toLocaleString("es-CO")} -{" "}
          {r.rangoFin.toLocaleString("es-CO")}
        </span>
        <span>Siguiente #</span>
        <span className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-300">
          {r.consecutivoSiguiente.toLocaleString("es-CO")}
        </span>
        <span>Tipo</span>
        <span className="text-right font-medium text-neutral-900 dark:text-neutral-100">
          {TIPO_OP_LABEL[r.tipoOperacion]}
        </span>
        <span>Ambiente</span>
        <span className="text-right font-medium text-neutral-900 dark:text-neutral-100">
          {r.ambiente === "produccion" ? "Producción" : "Pruebas"}
        </span>
      </div>
    </div>
  );
}

function NuevaResolucionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const empty: ResolucionDian = {
    numeroResolucion: "",
    fechaResolucion: toIsoDate(new Date()),
    fechaInicioVigencia: toIsoDate(new Date()),
    fechaFinVigencia: "",
    prefijo: "FEL",
    rangoInicio: 1,
    rangoFin: 1000,
    consecutivoSiguiente: 1,
    tipoOperacion: "estandar",
    ambiente: "produccion",
    activa: true,
  };
  const [form, setForm] = useState<ResolucionDian>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(empty);
  }, [open]);

  const update = <K extends keyof ResolucionDian>(
    k: K,
    v: ResolucionDian[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.numeroResolucion.trim()) {
      toast.error("Número de resolución obligatorio");
      return;
    }
    if (!form.fechaResolucion || !form.fechaInicioVigencia || !form.fechaFinVigencia) {
      toast.error("Las fechas son obligatorias");
      return;
    }
    if (!form.prefijo.trim()) {
      toast.error("Prefijo obligatorio");
      return;
    }
    if (form.rangoFin <= form.rangoInicio) {
      toast.error("Rango fin debe ser mayor que rango inicio");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/resolucion-dian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data?.error ?? "Error al crear resolución");
        return;
      }
      toast.success("Resolución DIAN creada");
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Hash className="h-4 w-4" />
            Nueva resolución DIAN
          </DialogTitle>
          <DialogDescription>
            Registre la numeración autorizada por la DIAN para facturación.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Número de resolución *" htmlFor="nr">
            <Input
              id="nr"
              value={form.numeroResolucion}
              onChange={(e) => update("numeroResolucion", e.target.value)}
              placeholder="18764000"
            />
          </Field>
          <Field label="Prefijo *" htmlFor="pf">
            <Input
              id="pf"
              value={form.prefijo}
              onChange={(e) => update("prefijo", e.target.value.toUpperCase())}
              placeholder="FEL"
              maxLength={8}
            />
          </Field>
          <Field label="Fecha resolución" htmlFor="fr">
            <Input
              id="fr"
              type="date"
              value={form.fechaResolucion}
              onChange={(e) => update("fechaResolucion", e.target.value)}
            />
          </Field>
          <Field label="Fecha inicio vigencia" htmlFor="fi">
            <Input
              id="fi"
              type="date"
              value={form.fechaInicioVigencia}
              onChange={(e) => update("fechaInicioVigencia", e.target.value)}
            />
          </Field>
          <Field label="Fecha fin vigencia" htmlFor="ff">
            <Input
              id="ff"
              type="date"
              value={form.fechaFinVigencia}
              onChange={(e) => update("fechaFinVigencia", e.target.value)}
            />
          </Field>
          <Field label="Tipo operación" htmlFor="to">
            <Select
              value={form.tipoOperacion}
              onValueChange={(v) => update("tipoOperacion", v as TipoOperacion)}
            >
              <SelectTrigger id="to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="estandar">Estándar</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="exportacion">Exportación</SelectItem>
                <SelectItem value="no_dian">Sin DIAN</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rango inicio" htmlFor="ri">
            <Input
              id="ri"
              type="number"
              min={1}
              value={form.rangoInicio}
              onChange={(e) =>
                update("rangoInicio", parseInt(e.target.value || "1", 10))
              }
            />
          </Field>
          <Field label="Rango fin" htmlFor="rf">
            <Input
              id="rf"
              type="number"
              min={1}
              value={form.rangoFin}
              onChange={(e) =>
                update("rangoFin", parseInt(e.target.value || "1", 10))
              }
            />
          </Field>
          <Field label="Ambiente" htmlFor="am">
            <Select
              value={form.ambiente}
              onValueChange={(v) => update("ambiente", v as Ambiente)}
            >
              <SelectTrigger id="am">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="produccion">Producción</SelectItem>
                <SelectItem value="pruebas">Pruebas</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="activa"
              checked={form.activa}
              onCheckedChange={(v) => update("activa", v)}
            />
            <Label htmlFor="activa" className="text-sm">
              Marcar como activa (desactiva las demás)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar resolución
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Tab 3 — Usuarios y roles
// ============================================================
function UsuariosTab() {
  const [items, setItems] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/usuarios");
      const d = await r.json();
      if (Array.isArray(d)) setItems(d);
      else setItems([]);
    } catch {
      toast.error("Error al cargar usuarios");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="border-neutral-200 dark:border-neutral-800">
      <CardHeader className="border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Users className="h-4 w-4" />
              Usuarios y roles
            </CardTitle>
            <CardDescription className="mt-1">
              Gestione el acceso del equipo al ERP (RBAC granular).
            </CardDescription>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 w-full animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Último login</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-neutral-500"
                    >
                      No hay usuarios registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          {u.email}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-neutral-900 dark:text-neutral-100">
                        {u.nombre}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ROL_VARIANT[u.rol]}>
                          {ROL_LABEL[u.rol]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-neutral-600 dark:text-neutral-400">
                        {formatDateTime(u.ultimoLogin)}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.activo ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="mr-1 h-3 w-3" />
                            Inactivo
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <NuevoUsuarioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
      />
    </Card>
  );
}

function NuevoUsuarioDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    nombre: "",
    rol: "vendedor" as Rol,
    password: "",
    telefono: "",
    cargo: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        email: "",
        nombre: "",
        rol: "vendedor",
        password: "",
        telefono: "",
        cargo: "",
      });
    }
  }, [open]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.email.trim() || !form.nombre.trim() || !form.password) {
      toast.error("Email, nombre y contraseña son obligatorios");
      return;
    }
    if (form.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          nombre: form.nombre,
          rol: form.rol,
          password: form.password,
          telefono: form.telefono || undefined,
          cargo: form.cargo || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data?.error ?? "Error al crear usuario");
        return;
      }
      toast.success("Usuario creado correctamente");
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Users className="h-4 w-4" />
            Nuevo usuario
          </DialogTitle>
          <DialogDescription>
            Cree una cuenta para un miembro del equipo. La contraseña se
            almacena hasheada con bcrypt (12 rounds).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email *" htmlFor="uemail">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                id="uemail"
                type="email"
                className="pl-8"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="ana@marsella.co"
              />
            </div>
          </Field>
          <Field label="Nombre completo *" htmlFor="unombre">
            <div className="relative">
              <UserCircle className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                id="unombre"
                className="pl-8"
                value={form.nombre}
                onChange={(e) => update("nombre", e.target.value)}
                placeholder="Ana Pérez"
              />
            </div>
          </Field>
          <Field label="Rol *" htmlFor="urol">
            <Select
              value={form.rol}
              onValueChange={(v) => update("rol", v as Rol)}
            >
              <SelectTrigger id="urol">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROL_LABEL) as Rol[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROL_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contraseña *" htmlFor="upass">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                id="upass"
                type="password"
                className="pl-8"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </Field>
          <Field label="Teléfono" htmlFor="utel">
            <Input
              id="utel"
              value={form.telefono}
              onChange={(e) => update("telefono", e.target.value)}
              placeholder="+57 300..."
            />
          </Field>
          <Field label="Cargo" htmlFor="ucargo">
            <Input
              id="ucargo"
              value={form.cargo}
              onChange={(e) => update("cargo", e.target.value)}
              placeholder="Asesor comercial"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Tab 4 — Tipos de documento (read-only)
// ============================================================
function TiposDocumentoTab() {
  const [items, setItems] = useState<TipoDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/empresas?op=tipos-documento");
        const d = await r.json();
        if (Array.isArray(d)) setItems(d);
        else setItems([]);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const natLabel = (n: string) =>
    n === "debito" ? "Débito" : n === "credito" ? "Crédito" : n;
  const carteraLabel = (n: string) =>
    n === "cxc" ? "Cartera por cobrar" : n === "cxp" ? "Cartera por pagar" : "No afecta";
  const invLabel = (n: string) =>
    n === "entrada" ? "Entrada" : n === "salida" ? "Salida" : "No afecta";

  return (
    <Card className="border-neutral-200 dark:border-neutral-800">
      <CardHeader className="border-b border-neutral-100 dark:border-neutral-800">
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <FileText className="h-4 w-4" />
          Tipos de documento
        </CardTitle>
        <CardDescription className="mt-1">
          Catálogo informativo. Define el comportamiento fiscal y de inventario
          de cada operación. (Sólo lectura en esta fase.)
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Naturaleza</TableHead>
                  <TableHead>Afecta cartera</TableHead>
                  <TableHead>Afecta inventario</TableHead>
                  <TableHead className="text-right">Consecutivo siguiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-neutral-500">
                      No hay tipos de documento registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-emerald-300 font-mono text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                        >
                          {t.codigo}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-neutral-900 dark:text-neutral-100">
                        {t.nombre}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={t.naturaleza === "debito" ? "default" : "secondary"}
                          className={
                            t.naturaleza === "debito"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : ""
                          }
                        >
                          {natLabel(t.naturaleza)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{carteraLabel(t.afectaCartera)}</TableCell>
                      <TableCell className="text-xs">{invLabel(t.afectaInventario)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                        {t.consecutivoSiguiente.toLocaleString("es-CO")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 5 — Información del sistema
// ============================================================
function SistemaTab() {
  const [restableciendo, setRestableciendo] = useState(false);

  const handleReset = async () => {
    setRestableciendo(true);
    // Demo: no operación destructiva real — sólo toast informativo.
    await new Promise((r) => setTimeout(r, 700));
    toast.success(
      "Solicitud de restablecimiento de datos demo registrada (modo demostración).",
    );
    setRestableciendo(false);
  };

  const features = [
    "Multi-tenant real (Empresa + RBAC) — Hermes era single-tenant",
    "Hash bcrypt + JWT (12 rounds) en lugar de MD5/sesión en memoria",
    "Prisma ORM con FK formales (Hermes usaba joins implícitos)",
    "Facturación electrónica DIAN nativa (CUFE/JSON/Evento)",
    "PUC jerárquico + asientos con validación de cuadre",
    "Auditoría con trazabilidad por usuario y timestamp",
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="border-neutral-200 dark:border-neutral-800 lg:col-span-2">
        <CardHeader className="border-b border-neutral-100 dark:border-neutral-800">
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Server className="h-4 w-4" />
            Información del sistema
          </CardTitle>
          <CardDescription>
            Metadatos de la build y stack tecnológico.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
            <InfoRow label="Versión" value="Marsella ERP 1.0.0" />
            <InfoRow label="Fecha de build" value={formatDate(new Date())} />
            <InfoRow
              label="Tecnología"
              value="Next.js 16 · TypeScript 5 · Prisma · SQLite"
            />
            <InfoRow
              label="Autenticación"
              value="JWT (HS256) + bcryptjs"
            />
            <InfoRow
              label="Patrón UI"
              value="Tailwind 4 + shadcn/ui (New York)"
            />
            <InfoRow label="Zona horaria" value="America/Bogota" />
          </dl>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-4 w-4" />
            Datos demo
          </CardTitle>
          <CardDescription>
            Restablezca el conjunto de datos de demostración.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Esta acción recarga los registros demo (empresa, terceros,
            productos, comprobantes) sin afectar usuarios ni resoluciones
            DIAN activas. En esta fase es una acción informativa.
          </p>
          <Button
            onClick={handleReset}
            disabled={restableciendo}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {restableciendo ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Restablecer datos demo
          </Button>
        </CardContent>
      </Card>

      <Card className="border-neutral-200 dark:border-neutral-800 lg:col-span-3">
        <CardHeader className="border-b border-neutral-100 dark:border-neutral-800">
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Cpu className="h-4 w-4" />
            Mejoras vs. SG Hermes
          </CardTitle>
          <CardDescription>
            Resumen del delta funcional frente a la base Hermes 9.2.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-neutral-700 dark:text-neutral-300">
                  {f}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="font-medium text-neutral-900 dark:text-neutral-100">
        {value}
      </dd>
    </div>
  );
}
