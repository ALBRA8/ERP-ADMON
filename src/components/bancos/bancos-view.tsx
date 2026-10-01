"use client";

// ============================================================
// ERP Marsella — Vista de Bancos, Cuentas y Conciliación Bancaria
// Tabs:
//   1. Bancos y Cuentas
//   2. Movimientos bancarios
//   3. Extractos
//   4. Conciliación
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Landmark,
  Plus,
  RefreshCw,
  Banknote,
  FileSpreadsheet,
  Scale,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Link2,
  Lock,
  Trash2,
  Building2,
  BookOpen,
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
interface Banco {
  id: string;
  codigo: string;
  nombre: string;
  nit?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  activo: boolean;
  cuentasCount?: number;
  createdAt: string;
}

interface CuentaBancaria {
  id: string;
  bancoId: string;
  numeroCuenta: string;
  tipo: string; // ahorro | corriente
  titular: string;
  saldoActual: number;
  moneda: string;
  activa: boolean;
  banco?: Banco;
  movimientoBancarios?: MovimientoBancario[];
  createdAt: string;
}

interface MovimientoBancario {
  id: string;
  cuentaBancariaId: string;
  fecha: string;
  tipo: string;
  monto: number;
  descripcion?: string | null;
  terceroId?: string | null;
  comprobanteId?: string | null;
  conciliado: boolean;
  cuentaBancaria?: CuentaBancaria;
}

interface ExtractoBancario {
  id: string;
  cuentaBancariaId: string;
  cuenta?: CuentaBancaria;
  mes: number;
  anio: number;
  saldoInicial: number;
  saldoFinal: number;
  archivo?: string | null;
  estado: string; // pendiente | conciliado | parcial
  fechaConciliacion?: string | null;
  movimientosCount?: number;
  createdAt: string;
}

interface ExtractoMovimiento {
  id: string;
  empresaId: string;
  extractoId: string;
  fecha: string;
  descripcion: string;
  monto: number;
  conciliado: boolean;
  movimientoBancarioId?: string | null;
}

interface ConciliacionBancaria {
  id: string;
  cuentaBancariaId: string;
  extractoId?: string | null;
  fecha: string;
  saldoInicialLibro: number;
  saldoInicialExtracto: number;
  ajustesLibro: number;
  ajustesExtracto: number;
  saldoFinalLibro: number;
  saldoFinalExtracto: number;
  diferencia: number;
  estado: string; // borrador | conciliada | anulada
  userId?: string | null;
  observaciones?: string | null;
  cuentaBancaria?: CuentaBancaria;
  extracto?: ExtractoBancario | null;
}

// ---------- Helpers UI ----------
const tipoMovBadge = (tipo: string) => {
  const map: Record<string, string> = {
    deposito: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    retiro: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    transferencia: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
    cheque: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    nota: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    interes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    comision: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return map[tipo] ?? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
};

const estadoExtractoBadge = (estado: string) => {
  if (estado === "conciliado")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Conciliado
      </Badge>
    );
  if (estado === "parcial")
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100">
        <Clock className="w-3 h-3 mr-1" /> Parcial
      </Badge>
    );
  return (
    <Badge className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 hover:bg-neutral-100">
      <Clock className="w-3 h-3 mr-1" /> Pendiente
    </Badge>
  );
};

const estadoConciliacionBadge = (estado: string) => {
  if (estado === "conciliada")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Conciliada
      </Badge>
    );
  if (estado === "anulada")
    return (
      <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100">
        <XCircle className="w-3 h-3 mr-1" /> Anulada
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100">
      <Clock className="w-3 h-3 mr-1" /> Borrador
    </Badge>
  );
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const formatFecha = (f?: string | null) => {
  if (!f) return "—";
  try {
    return new Date(f).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return f;
  }
};

// ============================================================
// Componente principal
// ============================================================
export function BancosView() {
  const [tab, setTab] = useState("bancos");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-600" />
            Bancos, Cajas POS y Conciliación
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Gestión de cuentas bancarias, extractos y conciliación bancaria
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-neutral-100 dark:bg-neutral-900 h-auto flex-wrap">
          <TabsTrigger value="bancos" className="gap-1">
            <Building2 className="w-4 h-4" />
            Bancos y Cuentas
          </TabsTrigger>
          <TabsTrigger value="movimientos" className="gap-1">
            <Banknote className="w-4 h-4" />
            Movimientos
          </TabsTrigger>
          <TabsTrigger value="extractos" className="gap-1">
            <FileSpreadsheet className="w-4 h-4" />
            Extractos
          </TabsTrigger>
          <TabsTrigger value="conciliacion" className="gap-1">
            <Scale className="w-4 h-4" />
            Conciliación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bancos" className="mt-4">
          <BancosCuentasTab />
        </TabsContent>
        <TabsContent value="movimientos" className="mt-4">
          <MovimientosTab />
        </TabsContent>
        <TabsContent value="extractos" className="mt-4">
          <ExtractosTab />
        </TabsContent>
        <TabsContent value="conciliacion" className="mt-4">
          <ConciliacionTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// TAB 1 — Bancos y Cuentas
// ============================================================
function BancosCuentasTab() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogBanco, setDialogBanco] = useState(false);
  const [dialogCuenta, setDialogCuenta] = useState(false);
  const [cuentaSel, setCuentaSel] = useState<CuentaBancaria | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/bancos"),
        fetch("/api/cuentas-bancarias"),
      ]);
      const b = await r1.json();
      const c = await r2.json();
      if (b.items) setBancos(b.items);
      if (c.items) setCuentas(c.items);
    } catch (e) {
      toast.error("Error al cargar bancos y cuentas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cargar}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDialogCuenta(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nueva cuenta bancaria
        </Button>
        <Button size="sm" onClick={() => setDialogBanco(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo banco
        </Button>
      </div>

      {bancos.length === 0 && !loading ? (
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>No hay bancos registrados</AlertTitle>
          <AlertDescription>
            Crea un banco y luego una cuenta bancaria para empezar a registrar movimientos.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bancos.map((banco) => {
            const cuentasBanco = cuentas.filter((c) => c.bancoId === banco.id);
            const totalSaldo = cuentasBanco.reduce(
              (a, c) => a + (c.saldoActual || 0),
              0,
            );
            return (
              <Card key={banco.id} className="border-neutral-200 dark:border-neutral-800">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
                        <Landmark className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{banco.nombre}</CardTitle>
                        <CardDescription className="text-xs">
                          Código {banco.codigo}
                          {banco.nit ? ` · NIT ${banco.nit}` : ""}
                        </CardDescription>
                      </div>
                    </div>
                    {banco.activo ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cuentasBanco.length === 0 ? (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Sin cuentas bancarias registradas.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cuentasBanco.map((cta) => (
                        <button
                          key={cta.id}
                          onClick={() => setCuentaSel(cta)}
                          className="w-full text-left p-3 rounded-md border border-neutral-200 dark:border-neutral-800 hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="font-mono text-sm font-medium truncate">
                                {cta.numeroCuenta}
                              </div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                                {cta.titular} · {cta.tipo}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                {formatCurrency(cta.saldoActual)}
                              </div>
                              <div className="text-[10px] text-neutral-400">{cta.moneda}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {cuentasBanco.length} cuenta(s)
                    </span>
                    <span className="text-xs font-semibold">
                      Total: {formatCurrency(totalSaldo)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog nuevo banco */}
      <DialogBanco
        open={dialogBanco}
        onOpenChange={setDialogBanco}
        onCreated={() => {
          setDialogBanco(false);
          cargar();
        }}
      />
      {/* Dialog nueva cuenta */}
      <DialogCuenta
        open={dialogCuenta}
        onOpenChange={setDialogCuenta}
        bancos={bancos}
        onCreated={() => {
          setDialogCuenta(false);
          cargar();
        }}
      />
      {/* Sheet de movimientos de la cuenta seleccionada */}
      <SheetCuentaMovimientos
        cuenta={cuentaSel}
        onOpenChange={(o) => !o && setCuentaSel(null)}
      />
    </div>
  );
}

function DialogBanco({
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
  const [nit, setNit] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/bancos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, nombre, nit, contacto, telefono, email }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al crear banco");
        return;
      }
      toast.success("Banco creado");
      setCodigo("");
      setNombre("");
      setNit("");
      setContacto("");
      setTelefono("");
      setEmail("");
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
          <DialogTitle>Nuevo banco</DialogTitle>
          <DialogDescription>
            Registra una entidad bancaria para asociar cuentas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Código *</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="001" />
          </div>
          <div>
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Banco de Colombia" />
          </div>
          <div>
            <Label>NIT</Label>
            <Input value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900.123.456-7" />
          </div>
          <div>
            <Label>Contacto</Label>
            <Input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Ejecutivo" />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+57 ..." />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="banco@..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Guardando..." : "Crear banco"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogCuenta({
  open,
  onOpenChange,
  bancos,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bancos: Banco[];
  onCreated: () => void;
}) {
  const [bancoId, setBancoId] = useState("");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [tipo, setTipo] = useState("corriente");
  const [titular, setTitular] = useState("");
  const [saldoActual, setSaldoActual] = useState("0");
  const [moneda, setMoneda] = useState("COP");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!bancoId || !numeroCuenta.trim() || !titular.trim()) {
      toast.error("Banco, número de cuenta y titular son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/cuentas-bancarias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bancoId,
          numeroCuenta,
          tipo,
          titular,
          saldoActual: parseFloat(saldoActual) || 0,
          moneda,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al crear cuenta");
        return;
      }
      toast.success("Cuenta bancaria creada");
      setNumeroCuenta("");
      setTitular("");
      setSaldoActual("0");
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
          <DialogTitle>Nueva cuenta bancaria</DialogTitle>
          <DialogDescription>
            Asocia una cuenta a un banco existente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Banco *</Label>
            <Select value={bancoId} onValueChange={setBancoId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un banco" /></SelectTrigger>
              <SelectContent>
                {bancos.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.codigo} — {b.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Número de cuenta *</Label>
            <Input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} placeholder="000-123456-78" />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corriente">Corriente</SelectItem>
                <SelectItem value="ahorro">Ahorros</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Moneda</Label>
            <Select value={moneda} onValueChange={setMoneda}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="COP">COP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Titular *</Label>
            <Input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Razón social" />
          </div>
          <div className="col-span-2">
            <Label>Saldo actual</Label>
            <Input
              type="number"
              value={saldoActual}
              onChange={(e) => setSaldoActual(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Guardando..." : "Crear cuenta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetCuentaMovimientos({
  cuenta,
  onOpenChange,
}: {
  cuenta: CuentaBancaria | null;
  onOpenChange: (o: boolean) => void;
}) {
  const [movs, setMovs] = useState<MovimientoBancario[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cuenta) {
      setMovs([]);
      return;
    }
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/movimientos-bancarios?cuentaBancariaId=${cuenta.id}&pageSize=50`);
        const d = await r.json();
        if (mounted && d.items) setMovs(d.items);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [cuenta]);

  return (
    <Sheet open={!!cuenta} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            {cuenta?.numeroCuenta}
          </SheetTitle>
          <SheetDescription>
            {cuenta?.banco?.nombre} · {cuenta?.tipo} · {cuenta?.titular}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 py-3 border-y border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Saldo actual</div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(cuenta?.saldoActual ?? 0)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Movimientos</div>
            <div className="text-sm font-medium">{movs.length}</div>
          </div>
        </div>
        <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-neutral-500">Cargando...</p>
          ) : movs.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin movimientos registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Desc.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{formatFecha(m.fecha)}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${tipoMovBadge(m.tipo)}`}>
                        {m.tipo}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-xs ${m.monto >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                      {m.monto >= 0 ? "+" : ""}
                      {formatCurrency(m.monto)}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-600 dark:text-neutral-300 truncate max-w-[160px]">
                      {m.descripcion || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// TAB 2 — Movimientos bancarios
// ============================================================
function MovimientosTab() {
  const [movs, setMovs] = useState<MovimientoBancario[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    cuentaBancariaId: "",
    tipo: "",
    conciliado: "",
    fechaInicio: "",
    fechaFin: "",
    q: "",
  });
  const [dialog, setDialog] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.cuentaBancariaId) params.set("cuentaBancariaId", filtros.cuentaBancariaId);
      if (filtros.tipo) params.set("tipo", filtros.tipo);
      if (filtros.conciliado) params.set("conciliado", filtros.conciliado);
      if (filtros.fechaInicio) params.set("fechaInicio", filtros.fechaInicio);
      if (filtros.fechaFin) params.set("fechaFin", filtros.fechaFin);
      params.set("page", String(page));
      const r = await fetch(`/api/movimientos-bancarios?${params}`);
      const d = await r.json();
      if (d.items) {
        setMovs(d.items);
        setTotal(d.total ?? 0);
      }
    } catch {
      toast.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [filtros, page]);

  const cargarCuentas = useCallback(async () => {
    try {
      const r = await fetch("/api/cuentas-bancarias");
      const d = await r.json();
      if (d.items) setCuentas(d.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    cargarCuentas();
  }, [cargarCuentas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Movimientos bancarios</CardTitle>
              <CardDescription>
                {total} movimiento(s) registrado(s)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cargar}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
              </Button>
              <Button size="sm" onClick={() => setDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-1" /> Nuevo movimiento
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            <Select
              value={filtros.cuentaBancariaId}
              onValueChange={(v) => { setFiltros(f => ({ ...f, cuentaBancariaId: v === "all" ? "" : v })); setPage(1); }}
            >
              <SelectTrigger><SelectValue placeholder="Cuenta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {cuentas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numeroCuenta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filtros.tipo || "all"}
              onValueChange={(v) => { setFiltros(f => ({ ...f, tipo: v === "all" ? "" : v })); setPage(1); }}
            >
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="deposito">Depósito</SelectItem>
                <SelectItem value="retiro">Retiro</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="nota">Nota</SelectItem>
                <SelectItem value="interes">Interés</SelectItem>
                <SelectItem value="comision">Comisión</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filtros.conciliado || "all"}
              onValueChange={(v) => { setFiltros(f => ({ ...f, conciliado: v === "all" ? "" : v })); setPage(1); }}
            >
              <SelectTrigger><SelectValue placeholder="Conciliado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Conciliado</SelectItem>
                <SelectItem value="false">Sin conciliar</SelectItem>
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
            <Button variant="outline" size="sm" onClick={() => { setFiltros({ cuentaBancariaId: "", tipo: "", conciliado: "", fechaInicio: "", fechaFin: "", q: "" }); setPage(1); }}>
              <Trash2 className="w-3 h-3 mr-1" /> Limpiar
            </Button>
          </div>

          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead className="w-28">Fecha</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-neutral-500">Cargando...</TableCell></TableRow>
                  ) : movs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-neutral-500">Sin movimientos</TableCell></TableRow>
                  ) : movs.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{formatFecha(m.fecha)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono">{m.cuentaBancaria?.numeroCuenta ?? "—"}</div>
                        <div className="text-[10px] text-neutral-400">{m.cuentaBancaria?.banco?.nombre}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${tipoMovBadge(m.tipo)}`}>
                          {m.tipo}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs ${m.monto >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                        {m.monto >= 0 ? "+" : ""}
                        {formatCurrency(m.monto)}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-600 dark:text-neutral-300 truncate max-w-[260px]">
                        {m.descripcion || "—"}
                      </TableCell>
                      <TableCell>
                        {m.conciliado ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Sí
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="w-3 h-3 mr-1" /> No
                          </Badge>
                        )}
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

      <DialogMovimiento
        open={dialog}
        onOpenChange={setDialog}
        cuentas={cuentas}
        onCreated={() => {
          setDialog(false);
          cargar();
        }}
      />
    </div>
  );
}

function DialogMovimiento({
  open,
  onOpenChange,
  cuentas,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cuentas: CuentaBancaria[];
  onCreated: () => void;
}) {
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [tipo, setTipo] = useState("deposito");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [terceroId, setTerceroId] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!cuentaBancariaId || !monto) {
      toast.error("Cuenta y monto son obligatorios");
      return;
    }
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      toast.error("El monto debe ser positivo");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/movimientos-bancarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuentaBancariaId,
          tipo,
          monto: montoNum,
          descripcion,
          terceroId: terceroId || undefined,
          fecha: fecha || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al crear movimiento");
        return;
      }
      toast.success("Movimiento registrado. Asiento contable generado.");
      setMonto("");
      setDescripcion("");
      setTerceroId("");
      setFecha("");
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
          <DialogTitle>Nuevo movimiento bancario</DialogTitle>
          <DialogDescription>
            El sistema ajusta el saldo de la cuenta y genera el asiento contable automáticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Cuenta bancaria *</Label>
            <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
              <SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
              <SelectContent>
                {cuentas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numeroCuenta} · {c.banco?.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deposito">Depósito (entrada)</SelectItem>
                <SelectItem value="retiro">Retiro (salida)</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="nota">Nota</SelectItem>
                <SelectItem value="interes">Interés</SelectItem>
                <SelectItem value="comision">Comisión</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monto *</Label>
            <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-2">
            <Label>Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Concepto" />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label>Tercero (opcional)</Label>
            <Input value={terceroId} onChange={(e) => setTerceroId(e.target.value)} placeholder="ID del tercero" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Guardando..." : "Registrar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// TAB 3 — Extractos
// ============================================================
function ExtractosTab() {
  const [extractos, setExtractos] = useState<ExtractoBancario[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/extractos"),
        fetch("/api/cuentas-bancarias"),
      ]);
      const e = await r1.json();
      const c = await r2.json();
      if (e.items) setExtractos(e.items);
      if (c.items) setCuentas(c.items);
    } catch {
      toast.error("Error al cargar extractos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cargar}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
        <Button size="sm" onClick={() => setDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> Cargar extracto
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extractos bancarios</CardTitle>
          <CardDescription>
            Cargados por mes y año para conciliación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead className="text-right">Saldo inicial</TableHead>
                    <TableHead className="text-right">Saldo final</TableHead>
                    <TableHead>Movimientos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Conciliado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-neutral-500">Cargando...</TableCell></TableRow>
                  ) : extractos.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-neutral-500">Sin extractos</TableCell></TableRow>
                  ) : extractos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {MESES[e.mes - 1]} {e.anio}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.cuenta?.numeroCuenta ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.cuenta?.banco?.nombre ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(e.saldoInicial)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(e.saldoFinal)}</TableCell>
                      <TableCell className="text-xs">{e.movimientosCount ?? 0}</TableCell>
                      <TableCell>{estadoExtractoBadge(e.estado)}</TableCell>
                      <TableCell className="text-xs">{formatFecha(e.fechaConciliacion)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <DialogExtracto
        open={dialog}
        onOpenChange={setDialog}
        cuentas={cuentas}
        onCreated={() => {
          setDialog(false);
          cargar();
        }}
      />
    </div>
  );
}

function DialogExtracto({
  open,
  onOpenChange,
  cuentas,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cuentas: CuentaBancaria[];
  onCreated: () => void;
}) {
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [saldoInicial, setSaldoInicial] = useState("0");
  const [saldoFinal, setSaldoFinal] = useState("0");
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedMovs = useMemo(() => {
    if (!csv.trim()) return [];
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    const arr: { fecha: string; descripcion: string; monto: number }[] = [];
    for (const line of lines) {
      const parts = line.split(/[;,]/);
      if (parts.length < 3) continue;
      const [fecha, desc, montoStr] = parts;
      const monto = parseFloat(montoStr.replace(/[^0-9.-]/g, ""));
      if (!fecha || !desc || !Number.isFinite(monto)) continue;
      arr.push({ fecha: fecha.trim(), descripcion: desc.trim(), monto });
    }
    return arr;
  }, [csv]);

  const submit = async () => {
    if (!cuentaBancariaId || !mes || !anio) {
      toast.error("Cuenta, mes y año son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/extractos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuentaBancariaId,
          mes: parseInt(mes, 10),
          anio: parseInt(anio, 10),
          saldoInicial: parseFloat(saldoInicial) || 0,
          saldoFinal: parseFloat(saldoFinal) || 0,
          movimientos: parsedMovs,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al cargar extracto");
        return;
      }
      toast.success(`Extracto creado con ${d.movimientosCreados ?? 0} movimientos`);
      setCsv("");
      setSaldoInicial("0");
      setSaldoFinal("0");
      onCreated();
    } catch (e) {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cargar extracto bancario</DialogTitle>
          <DialogDescription>
            Importa el extracto mensual del banco. Pega movimientos en formato CSV (fecha;descripción;monto).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Cuenta bancaria *</Label>
            <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
              <SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
              <SelectContent>
                {cuentas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numeroCuenta} · {c.banco?.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mes *</Label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Año *</Label>
            <Input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} />
          </div>
          <div>
            <Label>Saldo inicial</Label>
            <Input type="number" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
          </div>
          <div>
            <Label>Saldo final</Label>
            <Input type="number" value={saldoFinal} onChange={(e) => setSaldoFinal(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Movimientos (CSV opcional)</Label>
            <textarea
              className="flex h-32 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={"2026-01-05;Depósito cliente;$1.000.000\n2026-01-10;Pago proveedor;-500.000"}
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              {parsedMovs.length} movimiento(s) detectados.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Cargando..." : "Cargar extracto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// TAB 4 — Conciliación
// ============================================================
function ConciliacionTab() {
  const [conciliaciones, setConciliaciones] = useState<ConciliacionBancaria[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [extractos, setExtractos] = useState<ExtractoBancario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selCuenta, setSelCuenta] = useState("");
  const [selExtracto, setSelExtracto] = useState("");
  const [detalle, setDetalle] = useState<ConciliacionBancaria | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/conciliacion"),
        fetch("/api/cuentas-bancarias"),
        fetch("/api/extractos"),
      ]);
      const c = await r1.json();
      const ct = await r2.json();
      const ex = await r3.json();
      if (c.items) setConciliaciones(c.items);
      if (ct.items) setCuentas(ct.items);
      if (ex.items) setExtractos(ex.items);
    } catch {
      toast.error("Error al cargar conciliaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async () => {
    if (!selCuenta) {
      toast.error("Selecciona una cuenta");
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        cuentaBancariaId: selCuenta,
        saldoInicialLibro: 0,
        saldoInicialExtracto: 0,
        ajustesLibro: 0,
        ajustesExtracto: 0,
      };
      if (selExtracto) body.extractoId = selExtracto;
      const r = await fetch("/api/conciliacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al crear conciliación");
        return;
      }
      toast.success("Conciliación creada en borrador");
      setSelCuenta("");
      setSelExtracto("");
      cargar();
      setDetalle(d);
    } catch (e) {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  const extractosDeCuenta = extractos.filter(
    (e) => !selCuenta || e.cuentaBancariaId === selCuenta,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              Nueva conciliación
            </CardTitle>
            <CardDescription>Selecciona cuenta y extracto para iniciar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Cuenta bancaria</Label>
              <Select value={selCuenta} onValueChange={setSelCuenta}>
                <SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
                <SelectContent>
                  {cuentas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numeroCuenta} · {c.banco?.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Extracto (opcional)</Label>
              <Select value={selExtracto} onValueChange={setSelExtracto}>
                <SelectTrigger><SelectValue placeholder="Sin extracto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Ninguno —</SelectItem>
                  {extractosDeCuenta.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {MESES[e.mes - 1]} {e.anio} · {e.estado}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={crear}
              disabled={saving || !selCuenta}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? "Creando..." : "Crear conciliación"}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Conciliaciones</CardTitle>
              <Button variant="outline" size="sm" onClick={cargar}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="text-right">Saldo libro</TableHead>
                    <TableHead className="text-right">Saldo extracto</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-neutral-500">Cargando...</TableCell></TableRow>
                  ) : conciliaciones.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-neutral-500">Sin conciliaciones</TableCell></TableRow>
                  ) : conciliaciones.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                      onClick={() => setDetalle(c)}
                    >
                      <TableCell className="text-xs">{formatFecha(c.fecha)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono">{c.cuentaBancaria?.numeroCuenta ?? "—"}</div>
                        <div className="text-[10px] text-neutral-400">{c.cuentaBancaria?.banco?.nombre}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(c.saldoFinalLibro)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(c.saldoFinalExtracto)}</TableCell>
                      <TableCell className={`text-right font-mono text-xs font-semibold ${Math.abs(c.diferencia) < 0.01 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                        {formatCurrency(c.diferencia)}
                      </TableCell>
                      <TableCell>{estadoConciliacionBadge(c.estado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <SheetConciliacionDetalle
        conciliacion={detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        onChanged={() => {
          cargar();
        }}
      />
    </div>
  );
}

function SheetConciliacionDetalle({
  conciliacion,
  onOpenChange,
  onChanged,
}: {
  conciliacion: ConciliacionBancaria | null;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const [movsLibro, setMovsLibro] = useState<MovimientoBancario[]>([]);
  const [movsExtracto, setMovsExtracto] = useState<ExtractoMovimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [selLibro, setSelLibro] = useState<string | null>(null);
  const [selExtractoMov, setSelExtractoMov] = useState<string | null>(null);
  const [conc, setConc] = useState<ConciliacionBancaria | null>(conciliacion);

  useEffect(() => {
    setConc(conciliacion);
  }, [conciliacion]);

  const cargar = useCallback(async () => {
    if (!conciliacion) return;
    setLoading(true);
    setSelLibro(null);
    setSelExtractoMov(null);
    try {
      // Movimientos bancarios no conciliados de la cuenta
      const r1 = await fetch(
        `/api/movimientos-bancarios?cuentaBancariaId=${conciliacion.cuentaBancariaId}&conciliado=false&pageSize=200`,
      );
      const d1 = await r1.json();
      setMovsLibro(d1.items ?? []);
      // Movimientos del extracto (vía detalle de conciliación)
      const r2 = await fetch(`/api/conciliacion/${conciliacion.id}`);
      const d2 = await r2.json();
      setMovsExtracto(d2.extracto?.extractoMovimientos ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [conciliacion]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const conciliar = async () => {
    if (!conciliacion || !selLibro || !selExtractoMov) {
      toast.error("Selecciona un movimiento de cada lado");
      return;
    }
    try {
      const r = await fetch(`/api/conciliacion/${conciliacion.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movimientoBancarioId: selLibro,
          extractoMovimientoId: selExtractoMov,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al conciliar");
        return;
      }
      toast.success("Movimientos conciliados");
      // Refresca saldos de la conciliación
      const rc = await fetch(`/api/conciliacion/${conciliacion.id}`);
      const dc = await rc.json();
      setConc(dc);
      cargar();
      onChanged();
    } catch (e) {
      toast.error("Error de red");
    }
  };

  const cerrar = async () => {
    if (!conciliacion) return;
    try {
      const r = await fetch(`/api/conciliacion/${conciliacion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrar: true }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al cerrar conciliación");
        return;
      }
      toast.success("Conciliación cerrada");
      setConc(d);
      onChanged();
    } catch (e) {
      toast.error("Error de red");
    }
  };

  const noConciliadosLibro = movsLibro.filter((m) => !m.conciliado);
  const noConciliadosExt = movsExtracto.filter((m) => !m.conciliado);

  return (
    <Sheet open={!!conciliacion} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-6xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-600" />
            Conciliación bancaria
          </SheetTitle>
          <SheetDescription>
            {conc?.cuentaBancaria?.numeroCuenta} · {conc?.cuentaBancaria?.banco?.nombre}
            {" — "}Estado: <span className="font-medium capitalize">{conc?.estado}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-3 border-y border-neutral-200 dark:border-neutral-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Saldo inicial libro</div>
              <div className="font-mono text-sm">{formatCurrency(conc?.saldoInicialLibro ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Saldo inicial extracto</div>
              <div className="font-mono text-sm">{formatCurrency(conc?.saldoInicialExtracto ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Ajustes libro</div>
              <div className="font-mono text-sm">{formatCurrency(conc?.ajustesLibro ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Ajustes extracto</div>
              <div className="font-mono text-sm">{formatCurrency(conc?.ajustesExtracto ?? 0)}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
          {/* Panel Libro */}
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
            <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <BookOpen className="w-4 h-4" /> Libro (no conciliados)
              </div>
              <Badge variant="secondary">{noConciliadosLibro.length}</Badge>
            </div>
            <div className="max-h-[40vh] overflow-y-auto">
              {loading ? (
                <p className="p-3 text-xs text-neutral-500">Cargando...</p>
              ) : noConciliadosLibro.length === 0 ? (
                <p className="p-3 text-xs text-neutral-500">Sin pendientes.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {noConciliadosLibro.map((m) => (
                      <TableRow
                        key={m.id}
                        className={`cursor-pointer ${selLibro === m.id ? "bg-emerald-100 dark:bg-emerald-950/50" : ""}`}
                        onClick={() => setSelLibro(m.id)}
                      >
                        <TableCell>
                          {selLibro === m.id ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">{formatFecha(m.fecha)}</TableCell>
                        <TableCell>
                          <span className={`text-[10px] px-2 py-0.5 rounded ${tipoMovBadge(m.tipo)}`}>
                            {m.tipo}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs ${m.monto >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                          {m.monto >= 0 ? "+" : ""}
                          {formatCurrency(m.monto)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Panel Extracto */}
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
            <div className="px-3 py-2 bg-teal-50 dark:bg-teal-950/30 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="text-xs font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4" /> Extracto (no conciliados)
              </div>
              <Badge variant="secondary">{noConciliadosExt.length}</Badge>
            </div>
            <div className="max-h-[40vh] overflow-y-auto">
              {loading ? (
                <p className="p-3 text-xs text-neutral-500">Cargando...</p>
              ) : noConciliadosExt.length === 0 ? (
                <p className="p-3 text-xs text-neutral-500">Sin pendientes.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {noConciliadosExt.map((m) => (
                      <TableRow
                        key={m.id}
                        className={`cursor-pointer ${selExtractoMov === m.id ? "bg-teal-100 dark:bg-teal-950/50" : ""}`}
                        onClick={() => setSelExtractoMov(m.id)}
                      >
                        <TableCell>
                          {selExtractoMov === m.id ? (
                            <CheckCircle2 className="w-3 h-3 text-teal-600" />
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">{formatFecha(m.fecha)}</TableCell>
                        <TableCell className="text-xs truncate max-w-[160px]">{m.descripcion}</TableCell>
                        <TableCell className={`text-right font-mono text-xs ${m.monto >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                          {m.monto >= 0 ? "+" : ""}
                          {formatCurrency(m.monto)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>

        <div className="px-3 pb-2 flex items-center justify-center">
          <Button
            onClick={conciliar}
            disabled={!selLibro || !selExtractoMov}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Link2 className="w-4 h-4 mr-1" /> Conciliar selección
          </Button>
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Saldo final libro</div>
              <div className="font-mono text-sm font-semibold">{formatCurrency(conc?.saldoFinalLibro ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Saldo final extracto</div>
              <div className="font-mono text-sm font-semibold">{formatCurrency(conc?.saldoFinalExtracto ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">Diferencia</div>
              <div className={`font-mono text-sm font-bold ${Math.abs(conc?.diferencia ?? 0) < 0.01 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                {formatCurrency(conc?.diferencia ?? 0)}
              </div>
            </div>
          </div>
          <Alert className={`${Math.abs(conc?.diferencia ?? 0) < 0.01 ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30"}`}>
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle className="text-sm">
              {Math.abs(conc?.diferencia ?? 0) < 0.01
                ? "Conciliación cuadrada"
                : "Conciliación descuadrada"}
            </AlertTitle>
            <AlertDescription className="text-xs">
              {Math.abs(conc?.diferencia ?? 0) < 0.01
                ? "Los saldos coinciden. Puedes cerrar la conciliación."
                : `Hay una diferencia de ${formatCurrency(conc?.diferencia ?? 0)}. Continúa conciliando movimientos pendientes.`}
            </AlertDescription>
          </Alert>
          <SheetFooter>
            <Button
              onClick={cerrar}
              disabled={conc?.estado === "conciliada"}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Lock className="w-4 h-4 mr-1" /> Cerrar conciliación
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
