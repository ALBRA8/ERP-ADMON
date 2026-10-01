"use client";

// ============================================================
// ERP Marsella — Vista Cafetero (Hermes §5.16)
// Tabs: Compras de café | Fincas | Pruebas de cata
// Acento emerald/teal, dark mode, responsive mobile-first.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coffee,
  Plus,
  RefreshCw,
  Search,
  Beaker,
  FileBarChart,
  Leaf,
  MapPin,
  Mountain,
  CircleDollarSign,
  Filter,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
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
import { Textarea } from "@/components/ui/textarea";
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

const fmtNumber = (n: number | null | undefined, dec = 2) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n);
};

// ---------- Tipos ----------
interface Tercero {
  id: string;
  nombre: string;
  numeroDocumento: string;
}

interface Finca {
  id: string;
  nombre: string;
  ubicacion?: string | null;
  municipio?: string | null;
  propietarioId?: string | null;
  propietario?: Tercero | null;
  hectareas?: number | null;
  altura?: number | null;
  sombra?: boolean | null;
  observaciones?: string | null;
  createdAt: string;
}

interface ControlCalidad {
  id: string;
  almendraSana: number;
  broca: number;
  huecos: number;
  hongos: number;
  defectosTotales: number;
  fecha: string;
  pruebaTaza?: PruebaTaza | null;
}

interface PruebaTaza {
  id: string;
  fecha: string;
  catador?: string | null;
  fragranciaAroma: number;
  sabor: number;
  saborResidual: number;
  acidez: number;
  cuerpo: number;
  balance: number;
  uniformidad: number;
  tazaLimpia: number;
  dulzor: number;
  puntajeTotal: number;
  observaciones?: string | null;
  controlCalidadId?: string | null;
  controlCalidad?: any;
  compra?: any;
}

interface CompraCafe {
  id: string;
  numero: string;
  terceroId?: string | null;
  tercero?: Tercero | null;
  fincaId?: string | null;
  finca?: Finca | null;
  fecha: string;
  pesoBruto: number;
  tara: number;
  pesoNeto: number;
  factorRendimiento: number;
  humedad: number;
  precioBaseKg: number;
  valorBruto: number;
  descuentos: number;
  retenciones: number;
  valorPagar: number;
  estado: string;
  observaciones?: string | null;
  controlCalidad?: ControlCalidad | null;
}

// ---------- Badges de estado ----------
const ESTADO_COMPRA: Record<string, { label: string; color: string }> = {
  vigente: {
    label: "Vigente",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  },
  liquidado: {
    label: "Liquidado",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  },
  pagado: {
    label: "Pagado",
    color:
      "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
  },
  anulado: {
    label: "Anulado",
    color:
      "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
  },
};

function getEstadoBadge(estado: string) {
  return ESTADO_COMPRA[estado] ?? {
    label: estado,
    color:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
  };
}

function getPuntajeBadge(p: number) {
  if (p >= 80)
    return {
      label: "Especial",
      color:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    };
  if (p >= 70)
    return {
      label: "Bueno",
      color:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    };
  return {
    label: "Estándar",
    color:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
  };
}

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

// ============================================================
// Componente principal
// ============================================================
export function CafeteroView() {
  const [tab, setTab] = useState("compras");
  const [loading, setLoading] = useState(false);

  // Datos compartidos
  const [compras, setCompras] = useState<CompraCafe[]>([]);
  const [totalCompras, setTotalCompras] = useState(0);
  const [pageCompras, setPageCompras] = useState(1);
  const [qCompras, setQCompras] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("");
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [pruebas, setPruebas] = useState<PruebaTaza[]>([]);
  const [terceros, setTerceros] = useState<Tercero[]>([]);

  // Diálogos
  const [dlgCompra, setDlgCompra] = useState(false);
  const [dlgFinca, setDlgFinca] = useState(false);
  const [dlgControl, setDlgControl] = useState(false);
  const [dlgPrueba, setDlgPrueba] = useState(false);

  // Sheet
  const [sheetCompra, setSheetCompra] = useState<CompraCafe | null>(null);
  const [sheetPrueba, setSheetPrueba] = useState<PruebaTaza | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargarCompras = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageCompras),
        pageSize: "50",
      });
      if (qCompras) params.set("q", qCompras);
      if (estadoFiltro) params.set("estado", estadoFiltro);
      const data = await apiGet<{ items: CompraCafe[]; total: number }>(
        `/api/cafetero/compras?${params.toString()}`,
      );
      setCompras(data.items);
      setTotalCompras(data.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar compras");
    } finally {
      setLoading(false);
    }
  }, [pageCompras, qCompras, estadoFiltro]);

  const cargarFincas = useCallback(async () => {
    try {
      const data = await apiGet<{ items: Finca[] }>(
        `/api/cafetero/fincas?pageSize=100`,
      );
      setFincas(data.items);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar fincas");
    }
  }, []);

  const cargarPruebas = useCallback(async () => {
    try {
      const data = await apiGet<{ items: PruebaTaza[] }>(
        `/api/cafetero/pruebas-taza?pageSize=100`,
      );
      setPruebas(data.items);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar pruebas de taza");
    }
  }, []);

  const cargarTerceros = useCallback(async () => {
    try {
      const data = await apiGet<{ items: Tercero[] }>(
        `/api/terceros?pageSize=500`,
      );
      setTerceros(data.items);
    } catch {
      /* opcional */
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    cargarCompras();
    cargarFincas();
    cargarTerceros();
  }, [cargarCompras, cargarFincas, cargarTerceros]);

  useEffect(() => {
    if (tab === "cata") cargarPruebas();
  }, [tab, cargarPruebas]);

  // Cargar detalle de compra al abrir sheet
  const abrirSheet = async (c: CompraCafe) => {
    setSheetCompra(c);
    setLoadingDetalle(true);
    try {
      const full = await apiGet<CompraCafe>(`/api/cafetero/compras/${c.id}`);
      setSheetCompra(full);
    } catch (e: any) {
      // mantén el resumen
    } finally {
      setLoadingDetalle(false);
    }
  };

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Coffee className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Vertical Cafetero
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Compra de café pergamino, control de calidad físico y catación SCA
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cargarCompras();
            cargarFincas();
            cargarTerceros();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="fincas">Fincas</TabsTrigger>
          <TabsTrigger value="cata">Catación</TabsTrigger>
        </TabsList>

        {/* ---------- TAB 1: COMPRAS ---------- */}
        <TabsContent value="compras" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Compras de café</CardTitle>
                  <CardDescription>
                    {totalCompras} registro(s) — estado de liquidaciones
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-neutral-400" />
                    <Input
                      placeholder="Buscar por número…"
                      value={qCompras}
                      onChange={(e) => {
                        setQCompras(e.target.value);
                        setPageCompras(1);
                      }}
                      className="pl-8 w-44"
                    />
                  </div>
                  <Select
                    value={estadoFiltro || "ALL"}
                    onValueChange={(v) => {
                      setEstadoFiltro(v === "ALL" ? "" : v);
                      setPageCompras(1);
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <Filter className="w-3.5 h-3.5 mr-1 text-neutral-400" />
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="vigente">Vigente</SelectItem>
                      <SelectItem value="liquidado">Liquidado</SelectItem>
                      <SelectItem value="pagado">Pagado</SelectItem>
                      <SelectItem value="anulado">Anulado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => setDlgCompra(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Nueva compra
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tercero</TableHead>
                        <TableHead>Finca</TableHead>
                        <TableHead className="text-right">Peso neto</TableHead>
                        <TableHead className="text-right">Precio/kg</TableHead>
                        <TableHead className="text-right">Valor pagar</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compras.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-neutral-500 py-8">
                            No hay compras registradas
                          </TableCell>
                        </TableRow>
                      ) : (
                        compras.map((c) => {
                          const est = getEstadoBadge(c.estado);
                          return (
                            <TableRow
                              key={c.id}
                              onClick={() => abrirSheet(c)}
                              className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                            >
                              <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                                {c.numero}
                              </TableCell>
                              <TableCell>{fmtFecha(c.fecha)}</TableCell>
                              <TableCell>
                                {c.tercero?.nombre ?? "—"}
                              </TableCell>
                              <TableCell>{c.finca?.nombre ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono">
                                {fmtNumber(c.pesoNeto, 2)} kg
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(c.precioBaseKg)}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                                {formatCurrency(c.valorPagar)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={est.color}
                                >
                                  {est.label}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- TAB 2: FINCAS ---------- */}
        <TabsContent value="fincas" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Fincas cafeteras</CardTitle>
                  <CardDescription>
                    {fincas.length} finca(s) registrada(s)
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setDlgFinca(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" /> Nueva finca
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {fincas.length === 0 ? (
                <div className="text-center py-10 text-neutral-500">
                  <Leaf className="w-10 h-10 mx-auto mb-2 text-neutral-400" />
                  No hay fincas registradas
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {fincas.map((f) => (
                    <Card
                      key={f.id}
                      className="border-emerald-200 dark:border-emerald-900/50 hover:shadow-md transition-shadow"
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Leaf className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          {f.nombre}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {f.municipio ?? "—"}
                          {f.ubicacion ? ` · ${f.ubicacion}` : ""}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> Propietario
                          </span>
                          <span className="font-medium">
                            {f.propietario?.nombre ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500 flex items-center gap-1">
                            <Mountain className="w-3 h-3" /> Hectáreas
                          </span>
                          <span className="font-medium">
                            {f.hectareas ? fmtNumber(f.hectareas, 2) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Altura</span>
                          <span className="font-medium">
                            {f.altura ? `${fmtNumber(f.altura, 0)} msnm` : "—"}
                          </span>
                        </div>
                        {f.sombra && (
                          <Badge
                            variant="outline"
                            className="bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900"
                          >
                            Cultivo bajo sombra
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- TAB 3: CATA ---------- */}
        <TabsContent value="cata" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Beaker className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Pruebas de cata (SCA)
              </CardTitle>
              <CardDescription>
                {pruebas.length} catación(es) registradas — puntaje SCA sobre 100
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pruebas.length === 0 ? (
                <div className="text-center py-10 text-neutral-500">
                  <Beaker className="w-10 h-10 mx-auto mb-2 text-neutral-400" />
                  No hay pruebas de cata registradas
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Catador</TableHead>
                        <TableHead>Compra</TableHead>
                        <TableHead className="text-right">Puntaje</TableHead>
                        <TableHead>Clasificación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pruebas.map((p) => {
                        const b = getPuntajeBadge(p.puntajeTotal);
                        return (
                          <TableRow
                            key={p.id}
                            onClick={() => setSheetPrueba(p)}
                            className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                          >
                            <TableCell>{fmtFecha(p.fecha)}</TableCell>
                            <TableCell>{p.catador ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {p.compra?.numero ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {fmtNumber(p.puntajeTotal, 1)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={b.color}>
                                {b.label}
                              </Badge>
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
      </Tabs>

      {/* ---------- DIALOGOS Y SHEETS ---------- */}
      <DialogNuevaCompra
        open={dlgCompra}
        onOpenChange={setDlgCompra}
        terceros={terceros}
        fincas={fincas}
        onCrearFinca={() => {
          setDlgCompra(false);
          setDlgFinca(true);
        }}
        onSaved={() => {
          setDlgCompra(false);
          cargarCompras();
        }}
      />
      <DialogFinca
        open={dlgFinca}
        onOpenChange={(o) => {
          setDlgFinca(o);
          if (!o) cargarFincas();
        }}
        terceros={terceros}
      />
      <DialogControlCalidad
        open={dlgControl}
        onOpenChange={setDlgControl}
        compra={sheetCompra}
        onSaved={async () => {
          setDlgControl(false);
          if (sheetCompra) {
            await abrirSheet(sheetCompra);
          }
        }}
      />
      <DialogPruebaTaza
        open={dlgPrueba}
        onOpenChange={setDlgPrueba}
        compra={sheetCompra}
        onSaved={async () => {
          setDlgPrueba(false);
          if (sheetCompra) {
            await abrirSheet(sheetCompra);
          }
          cargarPruebas();
        }}
      />
      <SheetCompra
        compra={sheetCompra}
        loading={loadingDetalle}
        onOpenChange={(o) => !o && setSheetCompra(null)}
        onControlCalidad={() => setDlgControl(true)}
        onPruebaTaza={() => setDlgPrueba(true)}
        onLiquidar={async (generarFactura) => {
          if (!sheetCompra) return;
          try {
            const res = await apiPost<{ ok: boolean; estado: string; factura?: any }>(
              `/api/cafetero/compras/${sheetCompra.id}/liquidar`,
              { generarFactura },
            );
            toast.success(
              `Compra ${res.estado}${res.factura ? " con factura generada" : ""}`,
            );
            await abrirSheet(sheetCompra);
            cargarCompras();
          } catch (e: any) {
            toast.error(e.message ?? "Error al liquidar");
          }
        }}
      />
      <SheetPruebaCata
        prueba={sheetPrueba}
        onOpenChange={(o) => !o && setSheetPrueba(null)}
      />
    </div>
  );
}

// ============================================================
// Dialog Nueva Compra
// ============================================================
function DialogNuevaCompra({
  open,
  onOpenChange,
  terceros,
  fincas,
  onCrearFinca,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  terceros: Tercero[];
  fincas: Finca[];
  onCrearFinca: () => void;
  onSaved: () => void;
}) {
  const [terceroId, setTerceroId] = useState("");
  const [fincaId, setFincaId] = useState("");
  const [pesoBruto, setPesoBruto] = useState("");
  const [tara, setTara] = useState("0");
  const [factorRend, setFactorRend] = useState("0");
  const [humedad, setHumedad] = useState("0");
  const [precioBaseKg, setPrecioBaseKg] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  // cálculo en vivo
  const pb = parseFloat(pesoBruto) || 0;
  const tr = parseFloat(tara) || 0;
  const pn = Math.max(pb - tr, 0);
  const pbkg = parseFloat(precioBaseKg) || 0;
  const valorBruto = pn * pbkg;
  const hum = parseFloat(humedad) || 0;
  const descHumedad = hum > 12 ? (hum - 12) * pn * 0.01 : 0;
  const fac = parseFloat(factorRend) || 0;
  const descRend = (fac * valorBruto) / 100;
  const descuentos = descHumedad + descRend;
  const retenciones = valorBruto * 0.005;
  const valorPagar = Math.max(valorBruto - descuentos - retenciones, 0);

  async function guardar() {
    if (!pesoBruto || !precioBaseKg) {
      toast.error("Peso bruto y precio base por kg son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost<CompraCafe>("/api/cafetero/compras", {
        terceroId: terceroId || undefined,
        fincaId: fincaId || undefined,
        pesoBruto: parseFloat(pesoBruto),
        tara: parseFloat(tara) || 0,
        factorRendimiento: parseFloat(factorRend) || 0,
        humedad: parseFloat(humedad) || 0,
        precioBaseKg: parseFloat(precioBaseKg),
        observaciones: observaciones || undefined,
      });
      toast.success(`Compra ${res.numero} creada`);
      // reset
      setTerceroId("");
      setFincaId("");
      setPesoBruto("");
      setTara("0");
      setFactorRend("0");
      setHumedad("0");
      setPrecioBaseKg("");
      setObservaciones("");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear compra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva compra de café</DialogTitle>
          <DialogDescription>
            Pesaje físico y liquidación automática (retefuente 0.5%)
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 md:col-span-1 space-y-1.5">
            <Label>Tercero (proveedor)</Label>
            <Select value={terceroId} onValueChange={setTerceroId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar proveedor" />
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
          <div className="col-span-2 md:col-span-1 space-y-1.5">
            <Label className="flex items-center justify-between">
              Finca
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-5 p-0 text-emerald-600"
                onClick={onCrearFinca}
              >
                + Crear finca
              </Button>
            </Label>
            <Select value={fincaId} onValueChange={setFincaId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar finca" />
              </SelectTrigger>
              <SelectContent>
                {fincas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nombre} · {f.municipio ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Peso bruto (kg) *</Label>
            <Input
              type="number"
              value={pesoBruto}
              onChange={(e) => setPesoBruto(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tara (kg)</Label>
            <Input
              type="number"
              value={tara}
              onChange={(e) => setTara(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Factor de rendimiento (%)</Label>
            <Input
              type="number"
              value={factorRend}
              onChange={(e) => setFactorRend(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Humedad (%)</Label>
            <Input
              type="number"
              value={humedad}
              onChange={(e) => setHumedad(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Precio base por kg (COP) *</Label>
            <Input
              type="number"
              value={precioBaseKg}
              onChange={(e) => setPrecioBaseKg(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>

        {/* Liquidación en vivo */}
        <div className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Peso neto</span>
            <span className="font-mono">{fmtNumber(pn, 2)} kg</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Valor bruto</span>
            <span className="font-mono">{formatCurrency(valorBruto)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Descuentos</span>
            <span className="font-mono text-rose-600 dark:text-rose-400">
              - {formatCurrency(descuentos)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">
              Retenciones (retefuente 0.5%)
            </span>
            <span className="font-mono text-rose-600 dark:text-rose-400">
              - {formatCurrency(retenciones)}
            </span>
          </div>
          <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-900/50 pt-1">
            <span className="font-semibold">Valor a pagar</span>
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(valorPagar)}
            </span>
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
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Finca (crear)
// ============================================================
function DialogFinca({
  open,
  onOpenChange,
  terceros,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  terceros: Tercero[];
}) {
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [propietarioId, setPropietarioId] = useState("");
  const [hectareas, setHectareas] = useState("");
  const [altura, setAltura] = useState("");
  const [sombra, setSombra] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!nombre) {
      toast.error("Nombre de la finca es obligatorio");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/cafetero/fincas", {
        nombre,
        ubicacion: ubicacion || undefined,
        municipio: municipio || undefined,
        propietarioId: propietarioId || undefined,
        hectareas: hectareas ? parseFloat(hectareas) : undefined,
        altura: altura ? parseInt(altura, 10) : undefined,
        sombra,
        observaciones: observaciones || undefined,
      });
      toast.success("Finca creada");
      setNombre("");
      setUbicacion("");
      setMunicipio("");
      setPropietarioId("");
      setHectareas("");
      setAltura("");
      setSombra(false);
      setObservaciones("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear finca");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva finca cafetera</DialogTitle>
          <DialogDescription>
            Datos de la finca y su propietario
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ubicación</Label>
            <Input
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Municipio</Label>
            <Input
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Propietario</Label>
            <Select value={propietarioId} onValueChange={setPropietarioId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tercero" />
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
          <div className="space-y-1.5">
            <Label>Hectáreas</Label>
            <Input
              type="number"
              value={hectareas}
              onChange={(e) => setHectareas(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Altura (msnm)</Label>
            <Input
              type="number"
              value={altura}
              onChange={(e) => setAltura(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="sombra"
              checked={sombra}
              onChange={(e) => setSombra(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <Label htmlFor="sombra" className="cursor-pointer">
              Cultivo bajo sombra
            </Label>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
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
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear finca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Control de Calidad (5 campos físicos)
// ============================================================
function DialogControlCalidad({
  open,
  onOpenChange,
  compra,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  compra: CompraCafe | null;
  onSaved: () => void;
}) {
  const cc = compra?.controlCalidad;
  const [almendraSana, setAlmendraSana] = useState("");
  const [broca, setBroca] = useState("");
  const [huecos, setHuecos] = useState("");
  const [hongos, setHongos] = useState("");
  const [defectosTotales, setDefectosTotales] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && cc) {
      setAlmendraSana(String(cc.almendraSana ?? 0));
      setBroca(String(cc.broca ?? 0));
      setHuecos(String(cc.huecos ?? 0));
      setHongos(String(cc.hongos ?? 0));
      setDefectosTotales(String(cc.defectosTotales ?? 0));
    } else if (open) {
      setAlmendraSana("");
      setBroca("");
      setHuecos("");
      setHongos("");
      setDefectosTotales("");
    }
  }, [open, cc]);

  async function guardar() {
    if (!compra) return;
    setSaving(true);
    try {
      await apiPost(`/api/cafetero/compras/${compra.id}/control-calidad`, {
        almendraSana: parseFloat(almendraSana) || 0,
        broca: parseFloat(broca) || 0,
        huecos: parseFloat(huecos) || 0,
        hongos: parseFloat(hongos) || 0,
        defectosTotales: parseFloat(defectosTotales) || 0,
      });
      toast.success("Control de calidad guardado");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar control de calidad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Control de calidad físico
          </DialogTitle>
          <DialogDescription>
            Análisis físico de almendra — compra {compra?.numero}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Almendra sana (%)</Label>
            <Input
              type="number"
              value={almendraSana}
              onChange={(e) => setAlmendraSana(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Broca (%)</Label>
            <Input
              type="number"
              value={broca}
              onChange={(e) => setBroca(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Huecos (%)</Label>
            <Input
              type="number"
              value={huecos}
              onChange={(e) => setHuecos(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hongos (%)</Label>
            <Input
              type="number"
              value={hongos}
              onChange={(e) => setHongos(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Defectos totales (%)</Label>
            <Input
              type="number"
              value={defectosTotales}
              onChange={(e) => setDefectosTotales(e.target.value)}
              placeholder="0"
            />
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
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Prueba de Taza (9 atributos SCA + puntaje en vivo)
// ============================================================
function DialogPruebaTaza({
  open,
  onOpenChange,
  compra,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  compra: CompraCafe | null;
  onSaved: () => void;
}) {
  const [catador, setCatador] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({
    fragranciaAroma: "",
    sabor: "",
    saborResidual: "",
    acidez: "",
    cuerpo: "",
    balance: "",
    uniformidad: "",
    tazaLimpia: "",
    dulzor: "",
  });
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  const attrs: { key: string; label: string }[] = [
    { key: "fragranciaAroma", label: "Fragrancia y aroma" },
    { key: "sabor", label: "Sabor" },
    { key: "saborResidual", label: "Sabor residual" },
    { key: "acidez", label: "Acidez" },
    { key: "cuerpo", label: "Cuerpo" },
    { key: "balance", label: "Balance" },
    { key: "uniformidad", label: "Uniformidad" },
    { key: "tazaLimpia", label: "Taza limpia" },
    { key: "dulzor", label: "Dulzor" },
  ];

  const puntaje = useMemo(() => {
    return attrs.reduce((sum, a) => {
      const v = parseFloat(vals[a.key] ?? "0");
      return sum + (Number.isFinite(v) ? Math.min(Math.max(v, 0), 10) : 0);
    }, 0);
  }, [vals]);

  const clasif = getPuntajeBadge(puntaje);

  async function guardar() {
    if (!compra) return;
    setSaving(true);
    try {
      const payload: any = {
        catador: catador || undefined,
        observaciones: observaciones || undefined,
      };
      for (const a of attrs) {
        payload[a.key] = parseFloat(vals[a.key] ?? "0") || 0;
      }
      await apiPost(`/api/cafetero/compras/${compra.id}/prueba-taza`, payload);
      toast.success(
        `Prueba de taza creada — puntaje ${fmtNumber(puntaje, 1)} (${clasif.label})`,
      );
      setCatador("");
      setVals({});
      setObservaciones("");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear prueba de taza");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Prueba de taza SCA
          </DialogTitle>
          <DialogDescription>
            9 atributos (0–10 cada uno) — total 100 pts — compra {compra?.numero}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Catador</Label>
            <Input
              value={catador}
              onChange={(e) => setCatador(e.target.value)}
              placeholder="Nombre del catador"
            />
          </div>
          {attrs.map((a) => (
            <div key={a.key} className="space-y-1.5">
              <Label className="flex items-center justify-between">
                {a.label}
                <span className="text-xs text-neutral-500">
                  {parseFloat(vals[a.key] ?? "0") || 0}/10
                </span>
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={vals[a.key] ?? ""}
                onChange={(e) =>
                  setVals({ ...vals, [a.key]: e.target.value })
                }
                placeholder="0"
              />
            </div>
          ))}
          <div className="col-span-2 space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>

        {/* Puntaje en vivo */}
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-500">Puntaje total SCA</div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {fmtNumber(puntaje, 1)} / 100
            </div>
          </div>
          <Badge variant="outline" className={`${clasif.color} text-base px-3 py-1`}>
            {clasif.label}
          </Badge>
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
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear catación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Sheet Compra (detalle + acciones)
// ============================================================
function FilaDetalle({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-neutral-500 dark:text-neutral-400 text-sm">
        {label}
      </span>
      <span className={`font-mono text-sm ${accent ?? ""}`}>{value}</span>
    </div>
  );
}

function SheetCompra({
  compra,
  loading,
  onOpenChange,
  onControlCalidad,
  onPruebaTaza,
  onLiquidar,
}: {
  compra: CompraCafe | null;
  loading: boolean;
  onOpenChange: (o: boolean) => void;
  onControlCalidad: () => void;
  onPruebaTaza: () => void;
  onLiquidar: (generarFactura: boolean) => void;
}) {
  if (!compra) return null;
  const est = getEstadoBadge(compra.estado);
  const cc = compra.controlCalidad;
  const pt = cc?.pruebaTaza;

  return (
    <Sheet open={!!compra} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            {compra.numero}
          </SheetTitle>
          <SheetDescription>
            Detalle de compra de café · {fmtFechaHora(compra.fecha)}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          {/* Badges y resumen */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={est.color}>
              {est.label}
            </Badge>
            {pt && (
              <Badge
                variant="outline"
                className={getPuntajeBadge(pt.puntajeTotal).color}
              >
                Cata {fmtNumber(pt.puntajeTotal, 1)} pts ·{" "}
                {getPuntajeBadge(pt.puntajeTotal).label}
              </Badge>
            )}
          </div>

          {/* Datos del proveedor */}
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm">Proveedor y finca</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 py-2">
              <FilaDetalle
                label="Tercero"
                value={compra.tercero?.nombre ?? "—"}
              />
              <FilaDetalle
                label="Documento"
                value={compra.tercero?.numeroDocumento ?? "—"}
              />
              <FilaDetalle label="Finca" value={compra.finca?.nombre ?? "—"} />
            </CardContent>
          </Card>

          {/* Pesaje físico */}
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm">Pesaje físico</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 py-2">
              <FilaDetalle label="Peso bruto" value={`${fmtNumber(compra.pesoBruto)} kg`} />
              <FilaDetalle label="Tara" value={`${fmtNumber(compra.tara)} kg`} />
              <FilaDetalle
                label="Peso neto"
                value={`${fmtNumber(compra.pesoNeto)} kg`}
                accent="text-emerald-700 dark:text-emerald-300 font-semibold"
              />
              <FilaDetalle
                label="Humedad"
                value={`${fmtNumber(compra.humedad)} %`}
              />
              <FilaDetalle
                label="Factor rendimiento"
                value={`${fmtNumber(compra.factorRendimiento)} %`}
              />
            </CardContent>
          </Card>

          {/* Liquidación */}
          <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <CircleDollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Liquidación
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 py-2">
              <FilaDetalle label="Precio base / kg" value={formatCurrency(compra.precioBaseKg)} />
              <FilaDetalle
                label="Valor bruto"
                value={formatCurrency(compra.valorBruto)}
              />
              <FilaDetalle
                label="Descuentos (humedad + rendimiento)"
                value={`- ${formatCurrency(compra.descuentos)}`}
                accent="text-rose-600 dark:text-rose-400"
              />
              <FilaDetalle
                label="Retenciones (retefuente 0.5%)"
                value={`- ${formatCurrency(compra.retenciones)}`}
                accent="text-rose-600 dark:text-rose-400"
              />
              <div className="flex items-center justify-between border-t border-emerald-200 dark:border-emerald-900/50 pt-2 mt-2">
                <span className="font-semibold">Valor a pagar</span>
                <span className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(compra.valorPagar)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Control de calidad */}
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Control de calidad
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={onControlCalidad}
                disabled={compra.estado === "anulado"}
              >
                {cc ? "Editar" : "Registrar"}
              </Button>
            </CardHeader>
            <CardContent className="text-sm py-2">
              {cc ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <FilaDetalle label="Almendra sana" value={`${fmtNumber(cc.almendraSana)}%`} />
                  <FilaDetalle label="Broca" value={`${fmtNumber(cc.broca)}%`} />
                  <FilaDetalle label="Huecos" value={`${fmtNumber(cc.huecos)}%`} />
                  <FilaDetalle label="Hongos" value={`${fmtNumber(cc.hongos)}%`} />
                  <FilaDetalle
                    label="Defectos totales"
                    value={`${fmtNumber(cc.defectosTotales)}%`}
                  />
                </div>
              ) : (
                <div className="text-neutral-500 text-center py-3 text-sm">
                  Sin control de calidad registrado
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prueba de taza */}
          <Card className="border-neutral-200 dark:border-neutral-800">
            <CardHeader className="pb-2 pt-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Beaker className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Prueba de taza (SCA)
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={onPruebaTaza}
                disabled={compra.estado === "anulado"}
              >
                {pt ? "Nueva catación" : "Registrar"}
              </Button>
            </CardHeader>
            <CardContent className="text-sm py-2">
              {pt ? (
                <div className="space-y-1">
                  <FilaDetalle label="Catador" value={pt.catador ?? "—"} />
                  <FilaDetalle
                    label="Puntaje total"
                    value={`${fmtNumber(pt.puntajeTotal, 1)} / 100`}
                    accent="text-emerald-700 dark:text-emerald-300 font-semibold"
                  />
                  <div className="flex justify-end pt-1">
                    <Badge
                      variant="outline"
                      className={getPuntajeBadge(pt.puntajeTotal).color}
                    >
                      {getPuntajeBadge(pt.puntajeTotal).label}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="text-neutral-500 text-center py-3 text-sm">
                  Sin catación registrada
                </div>
              )}
            </CardContent>
          </Card>

          {/* Acciones */}
          {compra.estado === "vigente" && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onLiquidar(false)}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                <HandCoins className="w-4 h-4 mr-1" /> Liquidar compra
              </Button>
              <Button
                size="sm"
                onClick={() => onLiquidar(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <FileBarChart className="w-4 h-4 mr-1" /> Liquidar y facturar
              </Button>
            </div>
          )}
        </div>

        <SheetFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Sheet Prueba de Cata (detalle completo)
// ============================================================
function SheetPruebaCata({
  prueba,
  onOpenChange,
}: {
  prueba: PruebaTaza | null;
  onOpenChange: (o: boolean) => void;
}) {
  if (!prueba) return null;
  const b = getPuntajeBadge(prueba.puntajeTotal);
  const attrs: { label: string; value: number }[] = [
    { label: "Fragrancia y aroma", value: prueba.fragranciaAroma },
    { label: "Sabor", value: prueba.sabor },
    { label: "Sabor residual", value: prueba.saborResidual },
    { label: "Acidez", value: prueba.acidez },
    { label: "Cuerpo", value: prueba.cuerpo },
    { label: "Balance", value: prueba.balance },
    { label: "Uniformidad", value: prueba.uniformidad },
    { label: "Taza limpia", value: prueba.tazaLimpia },
    { label: "Dulzor", value: prueba.dulzor },
  ];

  return (
    <Sheet open={!!prueba} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Beaker className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Catación
          </SheetTitle>
          <SheetDescription>
            {fmtFechaHora(prueba.fecha)} · {prueba.catador ?? "Sin catador"}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500">Puntaje SCA</div>
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                  {fmtNumber(prueba.puntajeTotal, 1)} / 100
                </div>
              </div>
              <Badge variant="outline" className={`${b.color} text-base px-3 py-1`}>
                {b.label}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Atributos sensoriales
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="space-y-2">
                {attrs.map((a) => {
                  const pct = (a.value / 10) * 100;
                  return (
                    <div key={a.label} className="space-y-0.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-600 dark:text-neutral-400">
                          {a.label}
                        </span>
                        <span className="font-mono font-semibold">
                          {fmtNumber(a.value, 1)}/10
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {prueba.observaciones && (
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm">Observaciones</CardTitle>
              </CardHeader>
              <CardContent className="py-2 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                {prueba.observaciones}
              </CardContent>
            </Card>
          )}
        </div>
        <SheetFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
