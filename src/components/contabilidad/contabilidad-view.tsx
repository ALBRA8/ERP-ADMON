"use client";

// ============================================================
// ERP Marsella — Vista de Contabilidad
// Plan Único de Cuentas (PUC) | Asientos | Balance de Prueba | Libro Mayor
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Plus,
  Trash2,
  Save,
  FileSpreadsheet,
  Search,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Scale,
  Layers,
  AlertTriangle,
  CheckCircle2,
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Tipos ----------
interface CuentaPuc {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  naturaleza: "debito" | "credito";
  esMovimiento: boolean;
  esAjustable?: boolean;
  saldoActual?: number;
  cuentaPadreId?: string | null;
}

interface Tercero {
  id: string;
  nombre: string;
  apellido1?: string;
  nombreComercial?: string;
  numeroDocumento: string;
  tipo: string;
}

interface Comprobante {
  id: string;
  numero: string;
  tipo: string;
  fecha: string;
  descripcion?: string;
  totalDebito: number;
  totalCredito: number;
  diferencia: number;
  estado: string;
  _count?: { movimientos: number };
}

interface BalanceCuenta extends CuentaPuc {
  debito: number;
  credito: number;
  saldo: number;
}

interface MayorRow {
  id: string;
  fecha: string;
  debito: number;
  credito: number;
  saldo: number;
  descripcion?: string;
  comprobante?: { numero: string; descripcion?: string };
  tercero?: { nombre: string; numeroDocumento: string } | null;
}

interface MovimientoInput {
  key: string;
  cuentaId: string;
  terceroId: string;
  debito: string;
  credito: string;
  descripcion: string;
}

// ---------- Helpers UI ----------
function naturalezaBadge(n: string) {
  if (n === "debito") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        Débito
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
    >
      Crédito
    </Badge>
  );
}

function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    contabilizado:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    borrador:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    anulado:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <Badge variant="outline" className={map[estado] ?? ""}>
      {estado}
    </Badge>
  );
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

// ============================================================
// Componente principal
// ============================================================
export function ContabilidadView() {
  const [tab, setTab] = useState<string>("puc");

  // Datos compartidos
  const [cuentas, setCuentas] = useState<CuentaPuc[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);

  // PUC
  const [pucSearch, setPucSearch] = useState("");
  const [openNewCuenta, setOpenNewCuenta] = useState(false);

  // Asientos
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loadingAsientos, setLoadingAsientos] = useState(true);
  const [openNewAsiento, setOpenNewAsiento] = useState(false);

  // Balance
  const [balance, setBalance] = useState<{
    cuentas: BalanceCuenta[];
    totalDebito: number;
    totalCredito: number;
    diferencia: number;
  } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Mayor
  const [mayorCuentaId, setMayorCuentaId] = useState<string>("");
  const [mayorRows, setMayorRows] = useState<MayorRow[]>([]);
  const [loadingMayor, setLoadingMayor] = useState(false);
  const [mayorConsultado, setMayorConsultado] = useState(false);

  // -------- Carga inicial (cuentas + terceros) --------
  const cargarCuentas = useCallback(async () => {
    setLoadingCuentas(true);
    try {
      const r = await fetch("/api/contabilidad?op=cuentas");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setCuentas(d as CuentaPuc[]);
    } catch (e: any) {
      toast.error("No se pudo cargar el plan de cuentas", {
        description: e?.message,
      });
    } finally {
      setLoadingCuentas(false);
    }
  }, []);

  const cargarTerceros = useCallback(async () => {
    try {
      const r = await fetch("/api/terceros?pageSize=200");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setTerceros((d.items ?? []) as Tercero[]);
    } catch (e: any) {
      // No bloqueante: los terceros son opcionales en asientos
      console.warn("Terceros no cargados", e);
    }
  }, []);

  useEffect(() => {
    cargarCuentas();
    cargarTerceros();
  }, [cargarCuentas, cargarTerceros]);

  // -------- Asientos --------
  const cargarComprobantes = useCallback(async () => {
    setLoadingAsientos(true);
    try {
      const r = await fetch("/api/contabilidad?op=comprobantes&pageSize=100");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setComprobantes((d.items ?? []) as Comprobante[]);
    } catch (e: any) {
      toast.error("No se pudo listar comprobantes", { description: e?.message });
    } finally {
      setLoadingAsientos(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "asientos") cargarComprobantes();
  }, [tab, cargarComprobantes]);

  // -------- Balance --------
  const cargarBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const r = await fetch("/api/contabilidad?op=balance");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setBalance(d);
    } catch (e: any) {
      toast.error("No se pudo cargar el balance de prueba", {
        description: e?.message,
      });
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "balance") cargarBalance();
  }, [tab, cargarBalance]);

  // -------- Mayor --------
  const cargarMayor = useCallback(async () => {
    if (!mayorCuentaId) {
      toast.warning("Seleccione una cuenta para consultar el mayor");
      return;
    }
    setLoadingMayor(true);
    setMayorConsultado(true);
    try {
      const r = await fetch(
        `/api/contabilidad?op=mayor&cuentaId=${encodeURIComponent(mayorCuentaId)}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setMayorRows((d ?? []) as MayorRow[]);
    } catch (e: any) {
      toast.error("No se pudo consultar el libro mayor", {
        description: e?.message,
      });
      setMayorRows([]);
    } finally {
      setLoadingMayor(false);
    }
  }, [mayorCuentaId]);

  // -------- Helpers de cuentas --------
  const cuentasMovimiento = useMemo(
    () => cuentas.filter((c) => c.esMovimiento),
    [cuentas],
  );

  const cuentasOrdenadas = useMemo(() => {
    // Orden lexicográfico por codigo (el backend ya ordena)
    const arr = [...cuentas];
    if (pucSearch.trim()) {
      const q = pucSearch.trim().toLowerCase();
      return arr.filter(
        (c) =>
          c.codigo.toLowerCase().includes(q) ||
          c.nombre.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [cuentas, pucSearch]);

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              Contabilidad
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Plan Único de Cuentas · Asientos · Balance · Mayor
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex h-auto sm:h-9">
            <TabsTrigger value="puc" className="gap-1.5">
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">Plan de Cuentas</span>
              <span className="sm:hidden">PUC</span>
            </TabsTrigger>
            <TabsTrigger value="asientos" className="gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Asientos</span>
              <span className="sm:hidden">Asientos</span>
            </TabsTrigger>
            <TabsTrigger value="balance" className="gap-1.5">
              <Scale className="w-4 h-4" />
              <span className="hidden sm:inline">Balance</span>
              <span className="sm:hidden">Balance</span>
            </TabsTrigger>
            <TabsTrigger value="mayor" className="gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Libro Mayor</span>
              <span className="sm:hidden">Mayor</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ============ TAB PUC ============ */}
        <TabsContent value="puc">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Plan Único de Cuentas
                  </CardTitle>
                  <CardDescription>
                    {cuentas.length} cuentas · naturaleza y nivel jerárquico
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <Input
                      placeholder="Buscar código o nombre..."
                      value={pucSearch}
                      onChange={(e) => setPucSearch(e.target.value)}
                      className="pl-8 w-full sm:w-64"
                    />
                  </div>
                  <Button
                    onClick={() => setOpenNewCuenta(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4" />
                    Nueva cuenta
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingCuentas ? (
                <div className="p-8 text-center text-sm text-neutral-500 animate-pulse">
                  Cargando plan de cuentas...
                </div>
              ) : cuentasOrdenadas.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">
                  No se encontraron cuentas con el criterio indicado.
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-[40%]">Cuenta</TableHead>
                        <TableHead className="w-16">Nivel</TableHead>
                        <TableHead className="w-28">Naturaleza</TableHead>
                        <TableHead className="w-28">Movimiento</TableHead>
                        <TableHead className="text-right">Saldo actual</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cuentasOrdenadas.map((c) => (
                        <TableRow
                          key={c.id}
                          className={c.nivel <= 2 ? "bg-muted/40 font-medium" : ""}
                        >
                          <TableCell>
                            <div
                              className="flex items-baseline gap-2"
                              style={{
                                paddingLeft: `${Math.max(0, c.nivel - 1) * 18}px`,
                              }}
                            >
                              <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
                                {c.codigo}
                              </span>
                              <span className="truncate">{c.nombre}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              N{c.nivel}
                            </Badge>
                          </TableCell>
                          <TableCell>{naturalezaBadge(c.naturaleza)}</TableCell>
                          <TableCell>
                            {c.esMovimiento ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Sí
                              </span>
                            ) : (
                              <span className="text-xs text-neutral-400">
                                Agrupadora
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {c.saldoActual
                              ? formatCurrency(c.saldoActual)
                              : "$0,00"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <DialogNuevaCuenta
            open={openNewCuenta}
            onOpenChange={setOpenNewCuenta}
            cuentas={cuentas}
            onCreated={() => {
              cargarCuentas();
              cargarBalance();
            }}
          />
        </TabsContent>

        {/* ============ TAB ASIENTOS ============ */}
        <TabsContent value="asientos">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Comprobantes contables
                  </CardTitle>
                  <CardDescription>
                    {comprobantes.length} asientos registrados
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cargarComprobantes}
                    disabled={loadingAsientos}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loadingAsientos ? "animate-spin" : ""}`}
                    />
                    <span className="hidden sm:inline">Refrescar</span>
                  </Button>
                  <Button
                    onClick={() => setOpenNewAsiento(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4" />
                    Nuevo asiento manual
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAsientos ? (
                <div className="p-8 text-center text-sm text-neutral-500 animate-pulse">
                  Cargando comprobantes...
                </div>
              ) : comprobantes.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">
                  No hay comprobantes registrados. Cree el primer asiento manual.
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="min-w-[200px]">
                          Descripción
                        </TableHead>
                        <TableHead className="text-right">Débitos</TableHead>
                        <TableHead className="text-right">Créditos</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Movs.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comprobantes.map((c) => {
                        const descuadre =
                          c.diferencia !== undefined &&
                          Math.abs(c.diferencia) > 0.01;
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                              {c.numero}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDate(c.fecha)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {c.tipo}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[280px] truncate text-sm">
                              {c.descripcion ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(c.totalDebito ?? 0)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-teal-700 dark:text-teal-400">
                              {formatCurrency(c.totalCredito ?? 0)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {estadoBadge(c.estado)}
                                {descuadre && (
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {c._count?.movimientos ?? 0}
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

          <DialogNuevoAsiento
            open={openNewAsiento}
            onOpenChange={setOpenNewAsiento}
            cuentas={cuentasMovimiento}
            terceros={terceros}
            onSaved={() => {
              cargarComprobantes();
              cargarBalance();
              cargarCuentas();
            }}
          />
        </TabsContent>

        {/* ============ TAB BALANCE ============ */}
        <TabsContent value="balance">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Balance de Prueba
                  </CardTitle>
                  <CardDescription>
                    Movimientos acumulados por cuenta (según naturaleza)
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cargarBalance}
                    disabled={loadingBalance}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loadingBalance ? "animate-spin" : ""}`}
                    />
                    <span className="hidden sm:inline">Refrescar</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Mock export: abrir endpoint export si existe
                      try {
                        window.open(
                          "/api/contabilidad/export?op=balance",
                          "_blank",
                        );
                      } catch {
                        /* noop */
                      }
                      toast.success("Exportando balance a Excel…");
                    }}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="hidden sm:inline">Exportar Excel</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingBalance ? (
                <div className="p-8 text-center text-sm text-neutral-500 animate-pulse">
                  Calculando balance de prueba...
                </div>
              ) : !balance ? (
                <div className="p-8 text-center text-sm text-neutral-500">
                  No hay datos para mostrar.
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Naturaleza</TableHead>
                        <TableHead className="text-right">Débitos</TableHead>
                        <TableHead className="text-right">Créditos</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balance.cuentas.map((c) => (
                        <TableRow
                          key={c.id}
                          className={c.nivel <= 2 ? "bg-muted/40 font-medium" : ""}
                        >
                          <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                            {c.codigo}
                          </TableCell>
                          <TableCell
                            className="text-sm"
                            style={{
                              paddingLeft: `${Math.max(0, c.nivel - 1) * 14}px`,
                            }}
                          >
                            {c.nombre}
                          </TableCell>
                          <TableCell>{naturalezaBadge(c.naturaleza)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(c.debito)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(c.credito)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {formatCurrency(c.saldo)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/30 font-semibold">
                        <TableCell colSpan={3}>Totales generales</TableCell>
                        <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(balance.totalDebito)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-teal-700 dark:text-teal-300">
                          {formatCurrency(balance.totalCredito)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            Math.abs(balance.diferencia) > 0.01
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {formatCurrency(balance.diferencia)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ TAB MAYOR ============ */}
        <TabsContent value="mayor">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Libro Mayor
              </CardTitle>
              <CardDescription>
                Movimientos detallados de una cuenta con saldo acumulado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Cuenta contable</Label>
                  <Select
                    value={mayorCuentaId}
                    onValueChange={(v) => setMayorCuentaId(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccione cuenta a consultar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="max-h-72 overflow-y-auto">
                        {cuentasMovimiento.length === 0 ? (
                          <div className="px-2 py-3 text-xs text-neutral-500">
                            No hay cuentas de movimiento disponibles.
                          </div>
                        ) : (
                          cuentasMovimiento.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                                {c.codigo}
                              </span>
                              <span className="truncate">{c.nombre}</span>
                            </SelectItem>
                          ))
                        )}
                      </div>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={cargarMayor}
                  disabled={loadingMayor || !mayorCuentaId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {loadingMayor ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Consultar
                </Button>
              </div>

              {!mayorConsultado ? (
                <div className="py-12 text-center text-sm text-neutral-500">
                  Seleccione una cuenta y haga clic en “Consultar”.
                </div>
              ) : loadingMayor ? (
                <div className="py-12 text-center text-sm text-neutral-500 animate-pulse">
                  Consultando movimientos...
                </div>
              ) : mayorRows.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-500">
                  No hay movimientos contabilizados para esta cuenta.
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Comprobante</TableHead>
                        <TableHead className="min-w-[220px]">
                          Descripción
                        </TableHead>
                        <TableHead>Tercero</TableHead>
                        <TableHead className="text-right">Débito</TableHead>
                        <TableHead className="text-right">Crédito</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mayorRows.map((m, idx) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm">
                            {formatDate(m.fecha)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                            {m.comprobante?.numero ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[280px] truncate">
                            {m.descripcion ??
                              m.comprobante?.descripcion ??
                              "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {m.tercero
                              ? `${m.tercero.nombre} · ${m.tercero.numeroDocumento}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-700 dark:text-emerald-400">
                            {m.debito ? formatCurrency(m.debito) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-teal-700 dark:text-teal-400">
                            {m.credito ? formatCurrency(m.credito) : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-sm font-semibold ${
                              idx === mayorRows.length - 1
                                ? "text-emerald-700 dark:text-emerald-300"
                                : ""
                            }`}
                          >
                            {formatCurrency(m.saldo)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/30 font-semibold">
                        <TableCell colSpan={4}>Saldo final</TableCell>
                        <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(
                            mayorRows.reduce((a, m) => a + (m.debito || 0), 0),
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-teal-700 dark:text-teal-300">
                          {formatCurrency(
                            mayorRows.reduce((a, m) => a + (m.credito || 0), 0),
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(
                            mayorRows.length
                              ? mayorRows[mayorRows.length - 1].saldo
                              : 0,
                          )}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Dialog: Nueva cuenta PUC
// ============================================================
function DialogNuevaCuenta({
  open,
  onOpenChange,
  cuentas,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cuentas: CuentaPuc[];
  onCreated: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [naturaleza, setNaturaleza] = useState<"debito" | "credito">("debito");
  const [cuentaPadreId, setCuentaPadreId] = useState<string>("");
  const [nivel, setNivel] = useState<number>(3);
  const [esMovimiento, setEsMovimiento] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setCodigo("");
      setNombre("");
      setNaturaleza("debito");
      setCuentaPadreId("");
      setNivel(3);
      setEsMovimiento(true);
    }
  }, [open]);

  // Autocalcular nivel según padre
  // B1 (Maximum update depth): estabilizamos `cuentas` vía ref para que
  // el efecto no se redispare si el padre pasa una nueva referencia de
  // array en cada render (p.ej. tras un re-render del parent por otro
  // state). También saltamos el efecto cuando el diálogo está cerrado
  // para evitar setState innecesarios en mounts iniciales.
  const cuentasRef = useRef(cuentas);
  cuentasRef.current = cuentas;
  useEffect(() => {
    if (!open) return;
    if (cuentaPadreId) {
      const padre = cuentasRef.current.find((c) => c.id === cuentaPadreId);
      if (padre) {
        setNivel(padre.nivel + 1);
        // sugerir naturaleza del padre
        setNaturaleza(padre.naturaleza);
      }
    } else {
      // Si no hay padre y codigo empieza por 1 dígito → nivel 1 (clase)
      const c = codigo.trim();
      if (c.length === 1) setNivel(1);
      else if (c.length === 2) setNivel(2);
      else if (c.length === 4) setNivel(3);
      else if (c.length === 6) setNivel(4);
      else if (c.length === 8) setNivel(5);
    }
  }, [open, cuentaPadreId, codigo]);

  async function handleSave() {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/contabilidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Nota: el endpoint POST actual solo crea asientos,
          // no cuentas. Usamos un endpoint distinto si existe; si no,
          // avisamos al usuario.
          _tipo: "cuenta",
          codigo: codigo.trim(),
          nombre: nombre.trim(),
          naturaleza,
          cuentaPadreId: cuentaPadreId || undefined,
          nivel,
          esMovimiento,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        // El endpoint POST actual solo soporta asientos; si retorna error
        // esperado, lo manejamos como "endpoint no soporta creación de cuenta".
        throw new Error(d.error ?? "Error al crear cuenta");
      }
      toast.success(`Cuenta ${codigo.trim()} creada`);
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("No se pudo crear la cuenta", {
        description:
          e?.message ??
          "El endpoint actual solo soporta creación de asientos manuales.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Nueva cuenta PUC
          </DialogTitle>
          <DialogDescription>
            Cree una cuenta contable dentro del plan único de cuentas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-codigo">Código</Label>
              <Input
                id="nc-codigo"
                value={codigo}
                onChange={(e) =>
                  setCodigo(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="1105"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-nombre">Nombre</Label>
              <Input
                id="nc-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Caja general"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Naturaleza</Label>
              <Select
                value={naturaleza}
                onValueChange={(v) =>
                  setNaturaleza(v as "debito" | "credito")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debito">Débito (Activo/Gasto)</SelectItem>
                  <SelectItem value="credito">
                    Crédito (Pasivo/Patrimonio/Ingreso)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-nivel">Nivel</Label>
              <Input
                id="nc-nivel"
                type="number"
                min={1}
                max={6}
                value={nivel}
                onChange={(e) => setNivel(parseInt(e.target.value || "1", 10))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cuenta padre (opcional)</Label>
            <Select
              value={cuentaPadreId}
              onValueChange={(v) => setCuentaPadreId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin padre (cuenta raíz)" />
              </SelectTrigger>
              <SelectContent>
                <div className="max-h-60 overflow-y-auto">
                  {cuentas
                    .filter((c) => c.nivel < 6) // sólo pueden ser padres
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                          {c.codigo}
                        </span>
                        <span className="truncate">{c.nombre}</span>
                      </SelectItem>
                    ))}
                </div>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="nc-mov"
              checked={esMovimiento}
              onCheckedChange={(v) => setEsMovimiento(!!v)}
            />
            <Label htmlFor="nc-mov" className="cursor-pointer">
              Es cuenta de movimiento (admite asientos)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Crear cuenta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog: Nuevo asiento manual
// ============================================================
function DialogNuevoAsiento({
  open,
  onOpenChange,
  cuentas,
  terceros,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cuentas: CuentaPuc[];
  terceros: Tercero[];
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState<string>(todayISO());
  const [descripcion, setDescripcion] = useState<string>("");
  const [movimientos, setMovimientos] = useState<MovimientoInput[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setFecha(todayISO());
      setDescripcion("");
      setMovimientos([
        {
          key: crypto.randomUUID(),
          cuentaId: "",
          terceroId: "",
          debito: "",
          credito: "",
          descripcion: "",
        },
        {
          key: crypto.randomUUID(),
          cuentaId: "",
          terceroId: "",
          debito: "",
          credito: "",
          descripcion: "",
        },
      ]);
    }
  }, [open]);

  // Totales en tiempo real
  const totales = useMemo(() => {
    let debito = 0;
    let credito = 0;
    for (const m of movimientos) {
      const d = parseFloat(m.debito) || 0;
      const c = parseFloat(m.credito) || 0;
      debito += d;
      credito += c;
    }
    const diferencia = debito - credito;
    return { debito, credito, diferencia };
  }, [movimientos]);

  const cuadrado = Math.abs(totales.diferencia) < 0.01;
  const alMenosDosMovs = movimientos.filter((m) => m.cuentaId).length >= 2;
  const puedeGuardar = cuadrado && alMenosDosMovs && !saving;

  function addRow() {
    setMovimientos((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        cuentaId: "",
        terceroId: "",
        debito: "",
        credito: "",
        descripcion: "",
      },
    ]);
  }

  function updateRow(key: string, patch: Partial<MovimientoInput>) {
    setMovimientos((prev) =>
      prev.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    );
  }

  function removeRow(key: string) {
    setMovimientos((prev) =>
      prev.length > 1 ? prev.filter((m) => m.key !== key) : prev,
    );
  }

  function setDebitoCredito(
    key: string,
    field: "debito" | "credito",
    value: string,
  ) {
    // Sólo números
    const clean = value.replace(/[^0-9.,]/g, "");
    updateRow(key, {
      [field]: clean,
      // Si se llena débito, limpiar crédito y viceversa (modo easy)
      ...(field === "debito" && clean !== ""
        ? { credito: "" }
        : field === "credito" && clean !== ""
          ? { debito: "" }
          : {}),
    } as Partial<MovimientoInput>);
  }

  async function handleSave() {
    if (!cuadrado) {
      toast.error("Asiento descuadrado", {
        description: `Diferencia: ${formatCurrency(totales.diferencia)}`,
      });
      return;
    }
    if (!alMenosDosMovs) {
      toast.error("Se requieren al menos 2 movimientos con cuenta asignada");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fecha,
        descripcion: descripcion.trim() || undefined,
        movimientos: movimientos
          .filter((m) => m.cuentaId)
          .map((m) => ({
            cuentaId: m.cuentaId,
            terceroId: m.terceroId || undefined,
            descripcion: m.descripcion || undefined,
            debito: parseFloat(m.debito) || 0,
            credito: parseFloat(m.credito) || 0,
          })),
      };
      const r = await fetch("/api/contabilidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? "Error al guardar asiento");
      }
      toast.success(`Asiento ${d.numero ?? ""} contabilizado`, {
        description: `Débitos y créditos: ${formatCurrency(d.totalDebito ?? 0)}`,
      });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("No se pudo guardar el asiento", {
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Nuevo asiento manual
          </DialogTitle>
          <DialogDescription>
            Cree un comprobante contable manual. Los débitos y créditos deben
            cuadrar antes de guardar.
          </DialogDescription>
        </DialogHeader>

        {/* Cabecera */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="as-fecha">Fecha</Label>
            <Input
              id="as-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="as-desc">Descripción</Label>
            <Input
              id="as-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Pago de proveedores"
            />
          </div>
        </div>

        {/* Tabla de movimientos */}
        <div className="rounded-md border">
          <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="min-w-[220px]">Cuenta</TableHead>
                  <TableHead className="min-w-[180px]">Tercero</TableHead>
                  <TableHead className="min-w-[160px]">Detalle</TableHead>
                  <TableHead className="text-right w-32">Débito</TableHead>
                  <TableHead className="text-right w-32">Crédito</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m, idx) => (
                  <TableRow key={m.key}>
                    <TableCell>
                      <Select
                        value={m.cuentaId}
                        onValueChange={(v) =>
                          updateRow(m.key, { cuentaId: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              idx === 0 ? "Cuenta débito..." : "Cuenta..."
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="max-h-60 overflow-y-auto">
                            {cuentas.length === 0 ? (
                              <div className="px-2 py-3 text-xs text-neutral-500">
                                No hay cuentas de movimiento.
                              </div>
                            ) : (
                              cuentas.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                                    {c.codigo}
                                  </span>
                                  <span className="truncate">{c.nombre}</span>
                                </SelectItem>
                              ))
                            )}
                          </div>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m.terceroId}
                        onValueChange={(v) =>
                          updateRow(m.key, { terceroId: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="— Ninguno —" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="max-h-60 overflow-y-auto">
                            {terceros.length === 0 ? (
                              <div className="px-2 py-3 text-xs text-neutral-500">
                                No hay terceros disponibles.
                              </div>
                            ) : (
                              terceros.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  <span className="font-mono text-xs">
                                    {t.numeroDocumento}
                                  </span>
                                  <span className="truncate">
                                    {t.nombreComercial ??
                                      [t.nombre, t.apellido1]
                                        .filter(Boolean)
                                        .join(" ")}
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </div>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={m.descripcion}
                        onChange={(e) =>
                          updateRow(m.key, { descripcion: e.target.value })
                        }
                        placeholder="Detalle (opcional)"
                        className="min-w-[160px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={m.debito}
                        onChange={(e) =>
                          setDebitoCredito(m.key, "debito", e.target.value)
                        }
                        placeholder="0,00"
                        className="text-right font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={m.credito}
                        onChange={(e) =>
                          setDebitoCredito(m.key, "credito", e.target.value)
                        }
                        placeholder="0,00"
                        className="text-right font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(m.key)}
                        disabled={movimientos.length <= 2}
                        title="Eliminar fila"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-2 p-2 border-t bg-muted/30">
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              disabled={saving}
            >
              <Plus className="w-4 h-4" />
              Agregar movimiento
            </Button>
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1">
                <ArrowDownToLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Débitos:
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(totales.debito)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <ArrowUpFromLine className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Créditos:
                <span className="font-mono font-semibold text-teal-700 dark:text-teal-300">
                  {formatCurrency(totales.credito)}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Aviso de descuadre */}
        {!cuadrado && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Asiento descuadrado</AlertTitle>
            <AlertDescription>
              La diferencia entre débitos y créditos es de{" "}
              <span className="font-mono font-bold">
                {formatCurrency(Math.abs(totales.diferencia))}
              </span>
              . Ajuste los valores antes de guardar.
            </AlertDescription>
          </Alert>
        )}
        {cuadrado && totales.debito > 0 && (
          <Alert
            className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <CheckCircle2 className="w-4 h-4" />
            <AlertTitle>Asiento cuadrado</AlertTitle>
            <AlertDescription>
              Total {formatCurrency(totales.debito)} en débitos y créditos.
              Listo para guardar.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!puedeGuardar}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar asiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
