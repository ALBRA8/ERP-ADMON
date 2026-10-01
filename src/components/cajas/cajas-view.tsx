"use client";

// ============================================================
// ERP Marsella — Vista de Cajas POS y Arqueos
// Tabs:
//   1. Cajas POS        — grid de cards con estado + acciones
//   2. Arqueos          — tabla histórica con detalle en Sheet
//   3. Cierre de caja   — dialog de arqueo en vivo
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Plus,
  RefreshCw,
  Lock,
  Unlock,
  Pencil,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Wallet,
  Banknote,
  CreditCard,
  Send,
  Receipt,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Tipos ----------
interface Responsable {
  id: string;
  nombre: string;
  apellido1?: string;
  numeroDocumento?: string;
}

interface CajaPOS {
  id: string;
  codigo: string;
  nombre: string;
  ubicacion?: string | null;
  responsableId?: string | null;
  saldoInicial: number;
  saldoActual: number;
  estado: string; // abierta | cerrada
  activa: boolean;
  responsable?: Responsable | null;
  createdAt: string;
}

interface ArqueoCaja {
  id: string;
  empresaId: string;
  cajaId: string;
  fecha: string;
  turno: string;
  saldoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  otrosIngresos: number;
  gastosMenores: number;
  saldoFinalSistema: number;
  saldoFinalConteo: number;
  diferencia: number;
  observaciones?: string | null;
  userId?: string | null;
  caja?: CajaPOS;
}

const TURNOS: Record<string, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
  completo: "Completo",
};

const formatFecha = (f?: string | null) => {
  if (!f) return "—";
  try {
    return new Date(f).toLocaleString("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return f;
  }
};

// ============================================================
// Componente principal
// ============================================================
export function CajasView() {
  const [tab, setTab] = useState("cajas");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-emerald-600" />
            Cajas POS y Arqueos
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Gestión de cajas, apertura, cierre y arqueos de efectivo
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-neutral-100 dark:bg-neutral-900 h-auto flex-wrap">
          <TabsTrigger value="cajas" className="gap-1">
            <Store className="w-4 h-4" /> Cajas POS
          </TabsTrigger>
          <TabsTrigger value="arqueos" className="gap-1">
            <Receipt className="w-4 h-4" /> Arqueos
          </TabsTrigger>
          <TabsTrigger value="cierre" className="gap-1">
            <Lock className="w-4 h-4" /> Cierre de caja
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cajas" className="mt-4">
          <CajasTab />
        </TabsContent>
        <TabsContent value="arqueos" className="mt-4">
          <ArqueosTab />
        </TabsContent>
        <TabsContent value="cierre" className="mt-4">
          <CierreTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// TAB 1 — Cajas POS (grid de cards)
// ============================================================
function CajasTab() {
  const [cajas, setCajas] = useState<CajaPOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editCaja, setEditCaja] = useState<CajaPOS | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/cajas");
      const d = await r.json();
      if (d.items) setCajas(d.items);
    } catch {
      toast.error("Error al cargar cajas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = async (id: string) => {
    try {
      const r = await fetch(`/api/cajas/${id}/abrir`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al abrir caja");
        return;
      }
      toast.success("Caja abierta");
      cargar();
    } catch {
      toast.error("Error de red");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cargar}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
        <Button size="sm" onClick={() => setDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> Nueva caja
        </Button>
      </div>

      {cajas.length === 0 && !loading ? (
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>No hay cajas registradas</AlertTitle>
          <AlertDescription>
            Crea una caja POS para gestionar turnos y arqueos de efectivo.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cajas.map((c) => (
            <Card key={c.id} className={`border-2 ${c.estado === "abierta" ? "border-emerald-300 dark:border-emerald-700" : "border-neutral-200 dark:border-neutral-800"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center text-white ${c.estado === "abierta" ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-neutral-400 dark:bg-neutral-700"}`}>
                      <Store className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{c.nombre}</CardTitle>
                      <CardDescription className="text-xs">
                        Código {c.codigo}
                        {c.ubicacion ? ` · ${c.ubicacion}` : ""}
                      </CardDescription>
                    </div>
                  </div>
                  {c.estado === "abierta" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Abierta
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="w-3 h-3 mr-1" /> Cerrada
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-center py-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Saldo actual
                  </div>
                  <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(c.saldoActual)}
                  </div>
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Responsable:</span>
                    <span className="font-medium">
                      {c.responsable
                        ? `${c.responsable.nombre}${c.responsable.apellido1 ? ` ${c.responsable.apellido1}` : ""}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saldo inicial:</span>
                    <span className="font-mono">{formatCurrency(c.saldoInicial)}</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  {c.estado === "cerrada" ? (
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => abrir(c.id)}>
                      <Unlock className="w-3 h-3 mr-1" /> Abrir
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditCaja(c)}>
                      <Lock className="w-3 h-3 mr-1" /> Cerrar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditCaja(c)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DialogCaja
        open={dialog}
        onOpenChange={setDialog}
        onCreated={() => {
          setDialog(false);
          cargar();
        }}
      />
      <SheetCerrarCaja
        caja={editCaja}
        onOpenChange={(o) => !o && setEditCaja(null)}
        onClosed={() => {
          setEditCaja(null);
          cargar();
        }}
      />
    </div>
  );
}

function DialogCaja({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("0");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/cajas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          nombre,
          ubicacion: ubicacion || undefined,
          saldoInicial: parseFloat(saldoInicial) || 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al crear caja");
        return;
      }
      toast.success("Caja creada");
      setCodigo("");
      setNombre("");
      setUbicacion("");
      setSaldoInicial("0");
      onCreated();
    } catch (e) {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva caja POS</DialogTitle>
          <DialogDescription>
            Registra un punto de venta para gestionar turnos y arqueos.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Código *</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="POS-01" />
          </div>
          <div>
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Caja Mostrador" />
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Sala principal" />
          </div>
          <div>
            <Label>Saldo inicial</Label>
            <Input type="number" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Guardando..." : "Crear caja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetCerrarCaja({
  caja,
  onOpenChange,
  onClosed,
}: {
  caja: CajaPOS | null;
  onOpenChange: (o: boolean) => void;
  onClosed: () => void;
}) {
  // Si la caja está cerrada, mostramos solo info; si está abierta permitimos cerrar
  const [ventasEfectivo, setVentasEfectivo] = useState("0");
  const [ventasTarjeta, setVentasTarjeta] = useState("0");
  const [ventasTransferencia, setVentasTransferencia] = useState("0");
  const [otrosIngresos, setOtrosIngresos] = useState("0");
  const [gastosMenores, setGastosMenores] = useState("0");
  const [saldoFinalConteo, setSaldoFinalConteo] = useState("0");
  const [observaciones, setObservaciones] = useState("");
  const [turno, setTurno] = useState("completo");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (caja) {
      setVentasEfectivo("0");
      setVentasTarjeta("0");
      setVentasTransferencia("0");
      setOtrosIngresos("0");
      setGastosMenores("0");
      setSaldoFinalConteo(String(caja.saldoActual ?? 0));
      setObservaciones("");
      setTurno("completo");
    }
  }, [caja]);

  const saldoFinalSistema = useMemo(() => {
    const si = caja?.saldoInicial ?? 0;
    const ve = parseFloat(ventasEfectivo) || 0;
    const oi = parseFloat(otrosIngresos) || 0;
    const gm = parseFloat(gastosMenores) || 0;
    return si + ve + oi - gm;
  }, [caja, ventasEfectivo, otrosIngresos, gastosMenores]);

  const diferencia = useMemo(() => {
    const sc = parseFloat(saldoFinalConteo) || 0;
    return sc - saldoFinalSistema;
  }, [saldoFinalConteo, saldoFinalSistema]);

  const cerrar = async () => {
    if (!caja) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/cajas/${caja.id}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventasEfectivo: parseFloat(ventasEfectivo) || 0,
          ventasTarjeta: parseFloat(ventasTarjeta) || 0,
          ventasTransferencia: parseFloat(ventasTransferencia) || 0,
          otrosIngresos: parseFloat(otrosIngresos) || 0,
          gastosMenores: parseFloat(gastosMenores) || 0,
          saldoFinalConteo: parseFloat(saldoFinalConteo) || 0,
          observaciones,
          turno,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al cerrar caja");
        return;
      }
      toast.success(`Caja cerrada. Diferencia: ${formatCurrency(d.diferencia)}`);
      onClosed();
    } catch (e) {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  const esEdicion = caja && caja.estado === "abierta";

  return (
    <Sheet open={!!caja} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600" />
            {esEdicion ? "Cerrar caja" : "Detalle de caja"}
          </SheetTitle>
          <SheetDescription>
            {caja?.nombre} · {caja?.codigo}
            {caja?.ubicacion ? ` · ${caja.ubicacion}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-3 border-y border-neutral-200 dark:border-neutral-800 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Saldo inicial</div>
            <div className="font-mono text-sm">{formatCurrency(caja?.saldoInicial ?? 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Saldo actual</div>
            <div className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(caja?.saldoActual ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Estado</div>
            <div>{caja?.estado === "abierta" ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100">Abierta</Badge>
            ) : <Badge variant="secondary">Cerrada</Badge>}</div>
          </div>
        </div>

        {esEdicion ? (
          <div className="px-4 py-3 space-y-3">
            <div>
              <Label>Turno</Label>
              <Select value={turno} onValueChange={setTurno}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manana">Mañana</SelectItem>
                  <SelectItem value="tarde">Tarde</SelectItem>
                  <SelectItem value="noche">Noche</SelectItem>
                  <SelectItem value="completo">Completo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ventas efectivo</Label>
                <Input type="number" value={ventasEfectivo} onChange={(e) => setVentasEfectivo(e.target.value)} />
              </div>
              <div>
                <Label>Ventas tarjeta</Label>
                <Input type="number" value={ventasTarjeta} onChange={(e) => setVentasTarjeta(e.target.value)} />
              </div>
              <div>
                <Label>Ventas transferencia</Label>
                <Input type="number" value={ventasTransferencia} onChange={(e) => setVentasTransferencia(e.target.value)} />
              </div>
              <div>
                <Label>Otros ingresos</Label>
                <Input type="number" value={otrosIngresos} onChange={(e) => setOtrosIngresos(e.target.value)} />
              </div>
              <div>
                <Label>Gastos menores</Label>
                <Input type="number" value={gastosMenores} onChange={(e) => setGastosMenores(e.target.value)} />
              </div>
              <div>
                <Label>Conteo final (efectivo)</Label>
                <Input type="number" value={saldoFinalConteo} onChange={(e) => setSaldoFinalConteo(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Observaciones</Label>
              <textarea
                className="flex h-20 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-xs"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas del arqueo..."
              />
            </div>

            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Saldo final del sistema (calculado):</span>
                <span className="font-mono font-semibold">{formatCurrency(saldoFinalSistema)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Diferencia (conteo - sistema):</span>
                <span className={`font-mono font-bold ${Math.abs(diferencia) < 0.01 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                  {formatCurrency(diferencia)}
                </span>
              </div>
              <Alert className={`${Math.abs(diferencia) < 0.01 ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"}`}>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  {Math.abs(diferencia) < 0.01
                    ? "Arqueo cuadrado, listo para cerrar."
                    : diferencia > 0
                      ? `Sobrante de ${formatCurrency(diferencia)} en caja.`
                      : `Faltante de ${formatCurrency(-diferencia)} en caja.`}
                </AlertDescription>
              </Alert>
            </div>

            <SheetFooter>
              <Button onClick={cerrar} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Cerrando..." : "Cerrar caja y generar arqueo"}
              </Button>
            </SheetFooter>
          </div>
        ) : (
          <div className="px-4 py-3">
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>Caja cerrada</AlertTitle>
              <AlertDescription>
                Esta caja está cerrada. Ábrela nuevamente para registrar un nuevo turno.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// TAB 2 — Arqueos
// ============================================================
function ArqueosTab() {
  const [arqueos, setArqueos] = useState<ArqueoCaja[]>([]);
  const [cajas, setCajas] = useState<CajaPOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    cajaId: "",
    fechaInicio: "",
    fechaFin: "",
  });
  const [detalle, setDetalle] = useState<ArqueoCaja | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.cajaId) params.set("cajaId", filtros.cajaId);
      if (filtros.fechaInicio) params.set("fechaInicio", filtros.fechaInicio);
      if (filtros.fechaFin) params.set("fechaFin", filtros.fechaFin);
      params.set("page", String(page));
      const r = await fetch(`/api/arqueos?${params}`);
      const d = await r.json();
      if (d.items) {
        setArqueos(d.items);
        setTotal(d.total ?? 0);
      }
    } catch {
      toast.error("Error al cargar arqueos");
    } finally {
      setLoading(false);
    }
  }, [filtros, page]);

  const cargarCajas = useCallback(async () => {
    try {
      const r = await fetch("/api/cajas");
      const d = await r.json();
      if (d.items) setCajas(d.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    cargarCajas();
  }, [cargarCajas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Arqueos de caja</CardTitle>
              <CardDescription>{total} arqueo(s) registrados</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={cargar}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <Select
              value={filtros.cajaId || "all"}
              onValueChange={(v) => { setFiltros(f => ({ ...f, cajaId: v === "all" ? "" : v })); setPage(1); }}
            >
              <SelectTrigger><SelectValue placeholder="Caja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {cajas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filtros.fechaInicio}
              onChange={(e) => { setFiltros(f => ({ ...f, fechaInicio: e.target.value })); setPage(1); }}
            />
            <Input
              type="date"
              value={filtros.fechaFin}
              onChange={(e) => { setFiltros(f => ({ ...f, fechaFin: e.target.value })); setPage(1); }}
            />
            <Button variant="outline" size="sm" onClick={() => { setFiltros({ cajaId: "", fechaInicio: "", fechaFin: "" }); setPage(1); }}>
              Limpiar
            </Button>
          </div>

          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead className="w-40">Fecha</TableHead>
                    <TableHead>Caja</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead className="text-right">Saldo inicial</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Tarjeta</TableHead>
                    <TableHead className="text-right">Transf.</TableHead>
                    <TableHead className="text-right">Conteo</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-neutral-500">Cargando...</TableCell></TableRow>
                  ) : arqueos.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-neutral-500">Sin arqueos</TableCell></TableRow>
                  ) : arqueos.map((a) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                      onClick={() => setDetalle(a)}
                    >
                      <TableCell className="text-xs">{formatFecha(a.fecha)}</TableCell>
                      <TableCell className="text-xs">{a.caja?.nombre ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{TURNOS[a.turno] ?? a.turno}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(a.saldoInicial)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(a.ventasEfectivo)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(a.ventasTarjeta)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(a.ventasTransferencia)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(a.saldoFinalConteo)}</TableCell>
                      <TableCell className={`text-right font-mono text-xs font-bold ${Math.abs(a.diferencia) < 0.01 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                        {formatCurrency(a.diferencia)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-neutral-500">Página {page}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <SheetArqueoDetalle arqueo={detalle} onOpenChange={(o) => !o && setDetalle(null)} />
    </div>
  );
}

function SheetArqueoDetalle({
  arqueo,
  onOpenChange,
}: {
  arqueo: ArqueoCaja | null;
  onOpenChange: (o: boolean) => void;
}) {
  if (!arqueo) return null;
  return (
    <Sheet open={!!arqueo} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            Arqueo {arqueo.id.slice(-6)}
          </SheetTitle>
          <SheetDescription>
            {arqueo.caja?.nombre} · {formatFecha(arqueo.fecha)}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <DetalleRow icon={<Wallet className="w-3.5 h-3.5" />} label="Saldo inicial" value={formatCurrency(arqueo.saldoInicial)} />
            <DetalleRow icon={<Banknote className="w-3.5 h-3.5" />} label="Ventas efectivo" value={formatCurrency(arqueo.ventasEfectivo)} />
            <DetalleRow icon={<CreditCard className="w-3.5 h-3.5" />} label="Ventas tarjeta" value={formatCurrency(arqueo.ventasTarjeta)} />
            <DetalleRow icon={<Send className="w-3.5 h-3.5" />} label="Ventas transfer." value={formatCurrency(arqueo.ventasTransferencia)} />
            <DetalleRow icon={<Plus className="w-3.5 h-3.5" />} label="Otros ingresos" value={formatCurrency(arqueo.otrosIngresos)} />
            <DetalleRow icon={<XCircle className="w-3.5 h-3.5" />} label="Gastos menores" value={formatCurrency(arqueo.gastosMenores)} />
            <DetalleRow icon={<Calculator className="w-3.5 h-3.5" />} label="Saldo sistema" value={formatCurrency(arqueo.saldoFinalSistema)} />
            <DetalleRow icon={<Banknote className="w-3.5 h-3.5" />} label="Conteo final" value={formatCurrency(arqueo.saldoFinalConteo)} />
          </div>
          <div className={`rounded-md p-3 border-2 ${Math.abs(arqueo.diferencia) < 0.01 ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30"}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-neutral-500">Diferencia</span>
              <span className={`font-mono text-lg font-bold ${Math.abs(arqueo.diferencia) < 0.01 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                {formatCurrency(arqueo.diferencia)}
              </span>
            </div>
          </div>
          {arqueo.observaciones ? (
            <div>
              <Label className="text-xs">Observaciones</Label>
              <p className="text-xs p-2 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                {arqueo.observaciones}
              </p>
            </div>
          ) : null}
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            <div className="flex justify-between"><span>Turno:</span><span>{TURNOS[arqueo.turno] ?? arqueo.turno}</span></div>
            <div className="flex justify-between"><span>ID:</span><span className="font-mono">{arqueo.id}</span></div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetalleRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
      <span className="text-emerald-600">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase text-neutral-500">{label}</div>
        <div className="font-mono text-sm truncate">{value}</div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 3 — Cierre de caja (dialog standalone con cálculo en vivo)
// ============================================================
function CierreTab() {
  const [cajas, setCajas] = useState<CajaPOS[]>([]);
  const [cajaSel, setCajaSel] = useState("");
  const [ventasEfectivo, setVentasEfectivo] = useState("0");
  const [ventasTarjeta, setVentasTarjeta] = useState("0");
  const [ventasTransferencia, setVentasTransferencia] = useState("0");
  const [otrosIngresos, setOtrosIngresos] = useState("0");
  const [gastosMenores, setGastosMenores] = useState("0");
  const [saldoFinalConteo, setSaldoFinalConteo] = useState("0");
  const [observaciones, setObservaciones] = useState("");
  const [turno, setTurno] = useState("completo");
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/cajas");
      const d = await r.json();
      if (d.items) {
        // Solo mostrar cajas abiertas para cierre
        const abiertas = d.items.filter((c: CajaPOS) => c.estado === "abierta");
        setCajas(abiertas);
        if (abiertas.length > 0 && !cajaSel) setCajaSel(abiertas[0].id);
      }
    } catch {
      // ignore
    }
  }, [cajaSel]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const caja = cajas.find((c) => c.id === cajaSel);

  const saldoFinalSistema = useMemo(() => {
    const si = caja?.saldoInicial ?? 0;
    const ve = parseFloat(ventasEfectivo) || 0;
    const oi = parseFloat(otrosIngresos) || 0;
    const gm = parseFloat(gastosMenores) || 0;
    return si + ve + oi - gm;
  }, [caja, ventasEfectivo, otrosIngresos, gastosMenores]);

  const diferencia = useMemo(() => {
    const sc = parseFloat(saldoFinalConteo) || 0;
    return sc - saldoFinalSistema;
  }, [saldoFinalConteo, saldoFinalSistema]);

  useEffect(() => {
    if (caja) setSaldoFinalConteo(String(caja.saldoActual ?? 0));
  }, [caja]);

  const cerrar = async () => {
    if (!cajaSel) {
      toast.error("Selecciona una caja abierta");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/cajas/${cajaSel}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventasEfectivo: parseFloat(ventasEfectivo) || 0,
          ventasTarjeta: parseFloat(ventasTarjeta) || 0,
          ventasTransferencia: parseFloat(ventasTransferencia) || 0,
          otrosIngresos: parseFloat(otrosIngresos) || 0,
          gastosMenores: parseFloat(gastosMenores) || 0,
          saldoFinalConteo: parseFloat(saldoFinalConteo) || 0,
          observaciones,
          turno,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al cerrar caja");
        return;
      }
      toast.success(`Caja cerrada. Diferencia: ${formatCurrency(d.diferencia)}`);
      setVentasEfectivo("0");
      setVentasTarjeta("0");
      setVentasTransferencia("0");
      setOtrosIngresos("0");
      setGastosMenores("0");
      setObservaciones("");
      setCajaSel("");
      cargar();
    } catch (e) {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  if (cajas.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>No hay cajas abiertas</AlertTitle>
        <AlertDescription>
          Abre una caja POS desde la pestaña "Cajas POS" para poder generar un arqueo de cierre.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-600" />
          Cierre de caja
        </CardTitle>
        <CardDescription>
          Registra ventas por método de pago y conteo final. El sistema calcula el saldo esperado y la diferencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Caja *</Label>
            <Select value={cajaSel} onValueChange={setCajaSel}>
              <SelectTrigger><SelectValue placeholder="Selecciona una caja abierta" /></SelectTrigger>
              <SelectContent>
                {cajas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} · {formatCurrency(c.saldoActual)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Turno</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manana">Mañana</SelectItem>
                <SelectItem value="tarde">Tarde</SelectItem>
                <SelectItem value="noche">Noche</SelectItem>
                <SelectItem value="completo">Completo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Saldo inicial (caja)</Label>
            <Input value={formatCurrency(caja?.saldoInicial ?? 0)} disabled />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label className="flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Ventas efectivo</Label>
            <Input type="number" value={ventasEfectivo} onChange={(e) => setVentasEfectivo(e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Ventas tarjeta</Label>
            <Input type="number" value={ventasTarjeta} onChange={(e) => setVentasTarjeta(e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Ventas transfer.</Label>
            <Input type="number" value={ventasTransferencia} onChange={(e) => setVentasTransferencia(e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Otros ingresos</Label>
            <Input type="number" value={otrosIngresos} onChange={(e) => setOtrosIngresos(e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Gastos menores</Label>
            <Input type="number" value={gastosMenores} onChange={(e) => setGastosMenores(e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Conteo final</Label>
            <Input type="number" value={saldoFinalConteo} onChange={(e) => setSaldoFinalConteo(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Observaciones</Label>
          <textarea
            className="flex h-20 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-xs"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas del arqueo..."
          />
        </div>

        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Saldo final del sistema</div>
              <div className="font-mono text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {formatCurrency(saldoFinalSistema)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Conteo final</div>
              <div className="font-mono text-lg font-semibold">
                {formatCurrency(parseFloat(saldoFinalConteo) || 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Diferencia</div>
              <div className={`font-mono text-lg font-bold ${Math.abs(diferencia) < 0.01 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                {formatCurrency(diferencia)}
              </div>
            </div>
          </div>
          <Alert className={`${Math.abs(diferencia) < 0.01 ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"}`}>
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription className="text-xs">
              {Math.abs(diferencia) < 0.01
                ? "Arqueo cuadrado. El conteo coincide con el saldo del sistema."
                : diferencia > 0
                  ? `Sobrante de ${formatCurrency(diferencia)} — revisar origen del exceso.`
                  : `Faltante de ${formatCurrency(-diferencia)} — revisar ventas o gastos no registrados.`}
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            onClick={cerrar}
            disabled={saving || !cajaSel}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Lock className="w-4 h-4 mr-1" />
            {saving ? "Cerrando..." : "Cerrar caja y generar arqueo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
