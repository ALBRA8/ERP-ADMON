"use client";

// ============================================================
// ERP Marsella — Vista de Administración multi-tenant
// Tabs: Plan y límites | Auditoría multi-tenant
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Settings2,
  Sparkles,
  RefreshCw,
  History,
  CheckCircle2,
  AlertTriangle,
  Crown,
  Users,
  Package,
  FileText,
  CalendarClock,
  Activity,
  Network,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- Helpers ----------
const fmtFecha = (iso: string | Date) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
};

const fmtFechaInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// ---------- Tipos ----------
interface PlanInfo {
  plan: string;
  label: string;
  estado: string;
  vigenteHasta: string | null;
  modulos: string[];
  modulosDisponibles: string[];
  limites: {
    usuarios: number;
    terceros: number;
    productos: number;
    facturasMes: number;
  };
  uso: {
    usuarios: number;
    terceros: number;
    productos: number;
    facturasMes: number;
  };
}

interface AuditoriaItem {
  id: string;
  empresaId: string;
  userId: string | null;
  accion: string;
  entidad: string | null;
  entityId: string | null;
  detalles: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ---------- Badges ----------
function planBadge(plan: string) {
  const colors: Record<string, string> = {
    free: "border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    basic: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    pro: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
    enterprise: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  };
  return (
    <Badge variant="outline" className={colors[plan] ?? ""}>
      {plan.toUpperCase()}
    </Badge>
  );
}

function estadoPlanBadge(estado: string) {
  const colors: Record<string, string> = {
    activo:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    suspendido:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    cancelado:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <Badge variant="outline" className={colors[estado] ?? ""}>
      {estado}
    </Badge>
  );
}

// ============================================================
// Componente principal
// ============================================================
export function AdminView() {
  const [tab, setTab] = useState<string>("plan");

  // Plan
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Auditoría
  const [auditoria, setAuditoria] = useState<AuditoriaItem[]>([]);
  const [loadingAud, setLoadingAud] = useState(false);
  const [filtroAccion, setFiltroAccion] = useState<string>("");
  const [filtroFechaInicio, setFiltroFechaInicio] = useState<string>("");
  const [filtroFechaFin, setFiltroFechaFin] = useState<string>("");
  const [accionesDisp, setAccionesDisp] = useState<string[]>([]);
  const [audPage, setAudPage] = useState(1);
  const [audTotal, setAudTotal] = useState(0);
  const audPageSize = 50;

  // Sheet detalle auditoría
  const [audDetalleOpen, setAudDetalleOpen] = useState(false);
  const [audDetalle, setAudDetalle] = useState<AuditoriaItem | null>(null);

  // ---------- Carga de plan ----------
  const cargarPlan = useCallback(async () => {
    setLoadingPlan(true);
    try {
      const r = await fetch("/api/empresa/plan", { cache: "no-store" });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPlan(d);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el plan");
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  // ---------- Carga de auditoría ----------
  const cargarAuditoria = useCallback(async () => {
    setLoadingAud(true);
    try {
      const params = new URLSearchParams();
      if (filtroAccion) params.set("accion", filtroAccion);
      if (filtroFechaInicio) params.set("fechaInicio", filtroFechaInicio);
      if (filtroFechaFin) params.set("fechaFin", filtroFechaFin);
      params.set("page", String(audPage));
      params.set("pageSize", String(audPageSize));
      const r = await fetch(
        `/api/empresa/auditoria?${params.toString()}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setAuditoria(d.items ?? []);
      setAudTotal(d.total ?? 0);
      if (d.accionesDisponibles?.length) setAccionesDisp(d.accionesDisponibles);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar la auditoría");
    } finally {
      setLoadingAud(false);
    }
  }, [filtroAccion, filtroFechaInicio, filtroFechaFin, audPage]);

  useEffect(() => {
    cargarPlan();
  }, [cargarPlan]);

  useEffect(() => {
    cargarAuditoria();
  }, [cargarAuditoria]);

  // ---------- Solicitar upgrade (mock) ----------
  const solicitarUpgrade = () => {
    toast.success(
      "Solicitud de upgrade enviada. Un asesor le contactará pronto.",
      { duration: 4000 },
    );
  };

  // ---------- Render barras de uso ----------
  const BarraUso = ({
    label,
    icon,
    actual,
    limite,
  }: {
    label: string;
    icon: React.ReactNode;
    actual: number;
    limite: number;
  }) => {
    const pct = limite > 0 ? Math.min(100, (actual / limite) * 100) : 0;
    const color = pct >= 90 ? "rose" : pct >= 70 ? "amber" : "emerald";
    const colorClass = {
      emerald:
        "bg-emerald-500 dark:bg-emerald-400",
      amber: "bg-amber-500 dark:bg-amber-400",
      rose: "bg-rose-500 dark:bg-rose-400",
    }[color];
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
            {icon}
            {label}
          </span>
          <span className="font-mono text-xs">
            <span
              className={
                pct >= 90
                  ? "text-rose-600 dark:text-rose-400 font-bold"
                  : pct >= 70
                    ? "text-amber-600 dark:text-amber-400 font-bold"
                    : "text-emerald-700 dark:text-emerald-300 font-bold"
              }
            >
              {actual}
            </span>
            <span className="text-neutral-400"> / {limite}</span>
          </span>
        </div>
        <Progress
          value={pct}
          className={`h-2 [&>div]:${colorClass}`}
        />
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          {pct.toFixed(1)}% utilizado
          {pct >= 90 && " · Cuota casi agotada"}
        </div>
      </div>
    );
  };

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Administración
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Plan de suscripción, límites y auditoría multi-tenant
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (tab === "plan" ? cargarPlan() : cargarAuditoria())}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              (tab === "plan" ? loadingPlan : loadingAud) ? "animate-spin" : ""
            }`}
          />
          Actualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="plan" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Plan y límites
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-2">
            <History className="h-4 w-4" />
            Auditoría
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: Plan y límites ===== */}
        <TabsContent value="plan" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card: Plan actual */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-500" />
                  Plan actual
                </CardTitle>
                <CardDescription>Suscripción de la empresa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingPlan || !plan ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {planBadge(plan.plan)}
                      {estadoPlanBadge(plan.estado)}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Plan:</span>
                        <span className="font-medium">{plan.label}</span>
                      </div>
                      {plan.vigenteHasta && (
                        <div className="flex justify-between">
                          <span className="text-neutral-500 flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" /> Vigente hasta:
                          </span>
                          <span className="font-medium">
                            {fmtFechaInput(new Date(plan.vigenteHasta))}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={solicitarUpgrade}
                    >
                      <Sparkles className="h-4 w-4" />
                      Solicitar upgrade
                    </Button>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      El upgrade será procesado por un asesor comercial.
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Card: Límites y uso */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Límites y uso actual
                </CardTitle>
                <CardDescription>
                  Control de cuotas por categoría. Las barras se ponen rojas al
                  superar 90%.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {loadingPlan || !plan ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <BarraUso
                      label="Usuarios"
                      icon={<Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                      actual={plan.uso.usuarios}
                      limite={plan.limites.usuarios}
                    />
                    <BarraUso
                      label="Terceros"
                      icon={<Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
                      actual={plan.uso.terceros}
                      limite={plan.limites.terceros}
                    />
                    <BarraUso
                      label="Productos"
                      icon={<Package className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
                      actual={plan.uso.productos}
                      limite={plan.limites.productos}
                    />
                    <BarraUso
                      label="Facturas / mes"
                      icon={<FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                      actual={plan.uso.facturasMes}
                      limite={plan.limites.facturasMes}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Card: Módulos activos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Módulos activos
              </CardTitle>
              <CardDescription>
                Módulos del sistema disponibles en su plan actual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPlan || !plan ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {plan.modulosDisponibles.map((m) => {
                    const activo = plan.modulos.includes(m);
                    return (
                      <Badge
                        key={m}
                        variant="outline"
                        className={
                          activo
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500"
                        }
                      >
                        {activo && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {m}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: Auditoría ===== */}
        <TabsContent value="auditoria" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Auditoría multi-tenant
              </CardTitle>
              <CardDescription>
                Registro de acciones sensibles por empresa. Click en una fila
                para ver detalles JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Acción</Label>
                  <Select
                    value={filtroAccion || "todas"}
                    onValueChange={(v) => {
                      setFiltroAccion(v === "todas" ? "" : v);
                      setAudPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {accionesDisp.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input
                    type="date"
                    value={filtroFechaInicio}
                    onChange={(e) => {
                      setFiltroFechaInicio(e.target.value);
                      setAudPage(1);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input
                    type="date"
                    value={filtroFechaFin}
                    onChange={(e) => {
                      setFiltroFechaFin(e.target.value);
                      setAudPage(1);
                    }}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFiltroAccion("");
                      setFiltroFechaInicio("");
                      setFiltroFechaFin("");
                      setAudPage(1);
                    }}
                    className="w-full"
                  >
                    Limpiar filtros
                  </Button>
                </div>
              </div>

              {/* Tabla */}
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 max-h-[600px] overflow-y-auto custom-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Acción</TableHead>
                      <TableHead>Entidad</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingAud ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={5}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : auditoria.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-neutral-500 py-8"
                        >
                          No hay registros de auditoría para los filtros
                          aplicados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditoria.map((a) => (
                        <TableRow
                          key={a.id}
                          className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                          onClick={() => {
                            setAudDetalle(a);
                            setAudDetalleOpen(true);
                          }}
                        >
                          <TableCell className="text-xs">
                            {fmtFecha(a.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {a.userId ? a.userId.slice(-8) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                            >
                              {a.accion}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {a.entidad ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {a.ip ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Paginación */}
              {audTotal > audPageSize && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Página {audPage} de {Math.ceil(audTotal / audPageSize)} ·{" "}
                    {audTotal} registros
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={audPage <= 1 || loadingAud}
                      onClick={() => setAudPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        audPage >= Math.ceil(audTotal / audPageSize) ||
                        loadingAud
                      }
                      onClick={() => setAudPage((p) => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Sheet Detalle Auditoría ===== */}
      <Sheet open={audDetalleOpen} onOpenChange={setAudDetalleOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg lg:max-w-xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Detalle de auditoría
            </SheetTitle>
            <SheetDescription>
              {audDetalle?.accion} · {audDetalle ? fmtFecha(audDetalle.createdAt) : ""}
            </SheetDescription>
          </SheetHeader>
          {audDetalle && (
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-neutral-500">
                    Usuario ID
                  </Label>
                  <div className="font-mono break-all">
                    {audDetalle.userId ?? "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-neutral-500">
                    Fecha
                  </Label>
                  <div>{fmtFecha(audDetalle.createdAt)}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-neutral-500">
                    Entidad
                  </Label>
                  <div>{audDetalle.entidad ?? "—"}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-neutral-500">
                    Entity ID
                  </Label>
                  <div className="font-mono break-all">
                    {audDetalle.entityId ?? "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-neutral-500">
                    IP
                  </Label>
                  <div className="font-mono">{audDetalle.ip ?? "—"}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-neutral-500">
                    User Agent
                  </Label>
                  <div className="font-mono text-[10px] break-all">
                    {audDetalle.userAgent ?? "—"}
                  </div>
                </div>
              </div>
              {audDetalle.detalles && (
                <div className="space-y-1 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <Label className="text-[10px] uppercase text-neutral-500">
                    Detalles (JSON)
                  </Label>
                  <pre className="text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap break-all">
                    {(() => {
                      try {
                        return JSON.stringify(
                          JSON.parse(audDetalle.detalles),
                          null,
                          2,
                        );
                      } catch {
                        return audDetalle.detalles;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
