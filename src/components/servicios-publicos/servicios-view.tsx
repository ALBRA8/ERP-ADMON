"use client";

// ============================================================
// ERP Marsella — Vista Servicios Públicos (Hermes §5.17)
// Tabs: Usuarios | Bloques | Tarifas | Lecturas
// Acento emerald/teal, dark mode, responsive mobile-first.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Zap,
  Plus,
  RefreshCw,
  Search,
  Upload,
  FileSpreadsheet,
  Gauge,
  Receipt,
  Filter,
  Edit3,
  Trash2,
  ClipboardList,
  CircleDollarSign,
  CheckCircle2,
  AlertTriangle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Helpers ----------
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

const fmtNumber = (n: number | null | undefined, dec = 2) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n);
};

const ESTRATO_COLORS: Record<number, string> = {
  1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  2: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900",
  3: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900",
  4: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  5: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-900",
  6: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
};

function estratoBadge(e: number) {
  return ESTRATO_COLORS[e] ?? ESTRATO_COLORS[1];
}

// ---------- Tipos ----------
interface Tercero {
  id: string;
  nombre: string;
  numeroDocumento: string;
}

interface UsuarioServicio {
  id: string;
  numeroContrato: string;
  direccion: string;
  estrato: number;
  uso: string;
  consumoPromedio: number;
  tarifaFija: number;
  tarifaVariable: number;
  medidor?: string | null;
  estado: string;
  terceroId?: string | null;
  tercero?: Tercero | null;
}

interface BloqueFacturacion {
  id: string;
  codigo: string;
  nombre: string;
  ciclo: number;
  diaCorte: number;
  diaPago: number;
  activo: boolean;
}

interface TarifaServicio {
  id: string;
  tipoServicio: string;
  estrato: number;
  uso: string;
  rangoDesde: number;
  rangoHasta: number;
  tarifa: number;
  cargoFijo: number;
  activa: boolean;
}

interface LecturaMedidor {
  id: string;
  fechaLectura: string;
  lecturaAnterior: number;
  lecturaActual: number;
  consumo: number;
  facturada: boolean;
  observaciones?: string | null;
  usuarioServicio?: UsuarioServicio | null;
  usuarioServicioId: string;
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
export function ServiciosView() {
  const [tab, setTab] = useState("usuarios");
  const [loading, setLoading] = useState(false);

  const [usuarios, setUsuarios] = useState<UsuarioServicio[]>([]);
  const [totalUsuarios, setTotalUsuarios] = useState(0);
  const [qUsuarios, setQUsuarios] = useState("");
  const [fEstrato, setFEstrato] = useState<string>("");
  const [fUso, setFUso] = useState<string>("");

  const [bloques, setBloques] = useState<BloqueFacturacion[]>([]);
  const [tarifas, setTarifas] = useState<TarifaServicio[]>([]);
  const [lecturas, setLecturas] = useState<LecturaMedidor[]>([]);
  const [totalLecturas, setTotalLecturas] = useState(0);
  const [bloqueFiltro, setBloqueFiltro] = useState<string>("");
  const [facturadaFiltro, setFacturadaFiltro] = useState<string>("");

  const [terceros, setTerceros] = useState<Tercero[]>([]);

  // Diálogos
  const [dlgUsuario, setDlgUsuario] = useState(false);
  const [dlgBloque, setDlgBloque] = useState(false);
  const [dlgTarifa, setDlgTarifa] = useState(false);
  const [dlgLectura, setDlgLectura] = useState(false);
  const [dlgImportCSV, setDlgImportCSV] = useState(false);
  const [dlgImportMasivo, setDlgImportMasivo] = useState(false);
  const [dlgFacturar, setDlgFacturar] = useState(false);

  const cargarUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (qUsuarios) params.set("q", qUsuarios);
      if (fEstrato && fEstrato !== "ALL") params.set("estrato", fEstrato);
      if (fUso && fUso !== "ALL") params.set("uso", fUso);
      const data = await apiGet<{ items: UsuarioServicio[]; total: number }>(
        `/api/servicios-publicos/usuarios?${params.toString()}`,
      );
      setUsuarios(data.items);
      setTotalUsuarios(data.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, [qUsuarios, fEstrato, fUso]);

  const cargarBloques = useCallback(async () => {
    try {
      const data = await apiGet<{ items: BloqueFacturacion[] }>(
        `/api/servicios-publicos/bloques?pageSize=200`,
      );
      setBloques(data.items);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar bloques");
    }
  }, []);

  const cargarTarifas = useCallback(async () => {
    try {
      const data = await apiGet<{ items: TarifaServicio[] }>(
        `/api/servicios-publicos/tarifas?pageSize=200`,
      );
      setTarifas(data.items);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar tarifas");
    }
  }, []);

  const cargarLecturas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (bloqueFiltro) params.set("bloqueFacturacionId", bloqueFiltro);
      if (facturadaFiltro && facturadaFiltro !== "ALL")
        params.set("facturada", facturadaFiltro === "true" ? "true" : "false");
      const data = await apiGet<{ items: LecturaMedidor[]; total: number }>(
        `/api/servicios-publicos/lecturas?${params.toString()}`,
      );
      setLecturas(data.items);
      setTotalLecturas(data.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar lecturas");
    } finally {
      setLoading(false);
    }
  }, [bloqueFiltro, facturadaFiltro]);

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

  useEffect(() => {
    cargarUsuarios();
    cargarBloques();
    cargarTerceros();
  }, [cargarUsuarios, cargarBloques, cargarTerceros]);

  useEffect(() => {
    if (tab === "tarifas") cargarTarifas();
    if (tab === "lecturas") cargarLecturas();
  }, [tab, cargarTarifas, cargarLecturas]);

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Servicios Públicos
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Usuarios, lecturas de medidor, bloques de facturación y tarifas
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cargarUsuarios();
            cargarBloques();
            cargarTerceros();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="bloques">Bloques</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
          <TabsTrigger value="lecturas">Lecturas</TabsTrigger>
        </TabsList>

        {/* ---------- TAB 1: USUARIOS ---------- */}
        <TabsContent value="usuarios" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Usuarios de servicio</CardTitle>
                  <CardDescription>
                    {totalUsuarios} usuario(s) registrado(s)
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-neutral-400" />
                    <Input
                      placeholder="Buscar por contrato/dirección…"
                      value={qUsuarios}
                      onChange={(e) => setQUsuarios(e.target.value)}
                      className="pl-8 w-52"
                    />
                  </div>
                  <Select value={fEstrato || "ALL"} onValueChange={setFEstrato}>
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder="Estrato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      {[1, 2, 3, 4, 5, 6].map((e) => (
                        <SelectItem key={e} value={String(e)}>
                          Estrato {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={fUso || "ALL"} onValueChange={setFUso}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Uso" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="residencial">Residencial</SelectItem>
                      <SelectItem value="comercial">Comercial</SelectItem>
                      <SelectItem value="industrial">Industrial</SelectItem>
                      <SelectItem value="oficial">Oficial</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDlgImportCSV(true)}
                  >
                    <Upload className="w-4 h-4 mr-1" /> Importar lecturas (CSV)
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setDlgUsuario(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Nuevo usuario
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
                        <TableHead>Contrato</TableHead>
                        <TableHead>Dirección</TableHead>
                        <TableHead>Estrato</TableHead>
                        <TableHead>Uso</TableHead>
                        <TableHead className="text-right">Consumo prom.</TableHead>
                        <TableHead>Medidor</TableHead>
                        <TableHead>Titular</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-neutral-500 py-8">
                            No hay usuarios registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        usuarios.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
                              {u.numeroContrato}
                            </TableCell>
                            <TableCell>{u.direccion}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={estratoBadge(u.estrato)}
                              >
                                {u.estrato}
                              </Badge>
                            </TableCell>
                            <TableCell className="capitalize">{u.uso}</TableCell>
                            <TableCell className="text-right font-mono">
                              {fmtNumber(u.consumoPromedio, 0)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {u.medidor ?? "—"}
                            </TableCell>
                            <TableCell>
                              {u.tercero?.nombre ?? "—"}
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
        </TabsContent>

        {/* ---------- TAB 2: BLOQUES ---------- */}
        <TabsContent value="bloques" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Bloques de facturación</CardTitle>
                  <CardDescription>
                    {bloques.length} bloque(s) — ciclos de corte y pago
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setDlgBloque(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" /> Nuevo bloque
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {bloques.length === 0 ? (
                <div className="text-center py-10 text-neutral-500">
                  <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-neutral-400" />
                  No hay bloques registrados
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Ciclo</TableHead>
                        <TableHead>Día corte</TableHead>
                        <TableHead>Día pago</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bloques.map((b) => (
                        <BloqueRow
                          key={b.id}
                          bloque={b}
                          onUpdated={cargarBloques}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- TAB 3: TARIFAS ---------- */}
        <TabsContent value="tarifas" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Tarifas de servicio</CardTitle>
                  <CardDescription>
                    {tarifas.length} tarifa(s) por tipo/estrato/uso
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setDlgTarifa(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" /> Nueva tarifa
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tarifas.length === 0 ? (
                <div className="text-center py-10 text-neutral-500">
                  <Gauge className="w-10 h-10 mx-auto mb-2 text-neutral-400" />
                  No hay tarifas registradas
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white dark:bg-neutral-900">
                      <TableRow>
                        <TableHead>Tipo servicio</TableHead>
                        <TableHead>Estrato</TableHead>
                        <TableHead>Uso</TableHead>
                        <TableHead className="text-right">Rango</TableHead>
                        <TableHead className="text-right">Tarifa</TableHead>
                        <TableHead className="text-right">Cargo fijo</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tarifas.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="capitalize">{t.tipoServicio}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={estratoBadge(t.estrato)}
                            >
                              {t.estrato}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">{t.uso}</TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtNumber(t.rangoDesde, 0)} – {fmtNumber(t.rangoHasta, 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(t.tarifa)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(t.cargoFijo)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                t.activa
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                                  : "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
                              }
                            >
                              {t.activa ? "Activa" : "Inactiva"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- TAB 4: LECTURAS ---------- */}
        <TabsContent value="lecturas" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Lecturas de medidor
                  </CardTitle>
                  <CardDescription>
                    {totalLecturas} lectura(s) registrada(s)
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={bloqueFiltro || "ALL"}
                    onValueChange={(v) =>
                      setBloqueFiltro(v === "ALL" ? "" : v)
                    }
                  >
                    <SelectTrigger className="w-44">
                      <Filter className="w-3.5 h-3.5 mr-1 text-neutral-400" />
                      <SelectValue placeholder="Bloque" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos los bloques</SelectItem>
                      {bloques.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.codigo} · {b.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={facturadaFiltro || "ALL"}
                    onValueChange={setFacturadaFiltro}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Facturada" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      <SelectItem value="false">Pendientes</SelectItem>
                      <SelectItem value="true">Facturadas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDlgImportMasivo(true)}
                  >
                    <Upload className="w-4 h-4 mr-1" /> Importación masiva
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDlgFacturar(true)}
                    disabled={bloques.length === 0}
                  >
                    <Receipt className="w-4 h-4 mr-1" /> Facturar bloque
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setDlgLectura(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Nueva lectura
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
                        <TableHead>Usuario</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Anterior</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Consumo</TableHead>
                        <TableHead>Facturada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lecturas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-neutral-500 py-8">
                            No hay lecturas registradas
                          </TableCell>
                        </TableRow>
                      ) : (
                        lecturas.map((l) => {
                          const consumo = l.consumo ?? 0;
                          const promedio =
                            l.usuarioServicio?.consumoPromedio ?? 0;
                          // color por alto/bajo (alto = rojo, bajo = verde)
                          const consBadge =
                            promedio > 0 && consumo > promedio * 1.3
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900"
                              : promedio > 0 && consumo < promedio * 0.5
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900";
                          return (
                            <TableRow key={l.id}>
                              <TableCell>
                                <div className="text-sm">
                                  {l.usuarioServicio?.tercero?.nombre ?? "—"}
                                </div>
                                <div className="font-mono text-xs text-neutral-500">
                                  {l.usuarioServicio?.numeroContrato ?? "—"}
                                </div>
                              </TableCell>
                              <TableCell>{fmtFecha(l.fechaLectura)}</TableCell>
                              <TableCell className="text-right font-mono">
                                {fmtNumber(l.lecturaAnterior, 0)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {fmtNumber(l.lecturaActual, 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className={consBadge}>
                                  {fmtNumber(consumo, 0)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {l.facturada ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                                  >
                                    Facturada
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
                                  >
                                    Pendiente
                                  </Badge>
                                )}
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
      </Tabs>

      {/* ---------- DIALOGOS ---------- */}
      <DialogUsuario
        open={dlgUsuario}
        onOpenChange={(o) => {
          setDlgUsuario(o);
          if (!o) cargarUsuarios();
        }}
        terceros={terceros}
      />
      <DialogBloque
        open={dlgBloque}
        onOpenChange={(o) => {
          setDlgBloque(o);
          if (!o) cargarBloques();
        }}
      />
      <DialogTarifa
        open={dlgTarifa}
        onOpenChange={(o) => {
          setDlgTarifa(o);
          if (!o) cargarTarifas();
        }}
      />
      <DialogLectura
        open={dlgLectura}
        onOpenChange={(o) => {
          setDlgLectura(o);
          if (!o) cargarLecturas();
        }}
        usuarios={usuarios}
        bloques={bloques}
      />
      <DialogImportCSV
        open={dlgImportCSV}
        onOpenChange={setDlgImportCSV}
        onSaved={() => {
          cargarLecturas();
          cargarUsuarios();
        }}
      />
      <DialogImportMasivo
        open={dlgImportMasivo}
        onOpenChange={setDlgImportMasivo}
        usuarios={usuarios}
        bloques={bloques}
        onSaved={() => cargarLecturas()}
      />
      <DialogFacturar
        open={dlgFacturar}
        onOpenChange={setDlgFacturar}
        bloques={bloques}
        onDone={() => {
          cargarLecturas();
          cargarUsuarios();
        }}
      />
    </div>
  );
}

// ============================================================
// Fila de bloque con editar / desactivar
// ============================================================
function BloqueRow({
  bloque,
  onUpdated,
}: {
  bloque: BloqueFacturacion;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(bloque);

  async function guardar() {
    try {
      await apiPost("/api/servicios-publicos/bloques", {
        id: bloque.id,
        codigo: form.codigo,
        nombre: form.nombre,
        ciclo: form.ciclo,
        diaCorte: form.diaCorte,
        diaPago: form.diaPago,
        activo: form.activo,
      });
      toast.success("Bloque actualizado");
      setEditing(false);
      onUpdated();
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar bloque");
    }
  }

  async function toggleActivo() {
    try {
      await apiPost("/api/servicios-publicos/bloques", {
        id: bloque.id,
        ...bloque,
        activo: !bloque.activo,
      });
      toast.success(bloque.activo ? "Bloque desactivado" : "Bloque activado");
      onUpdated();
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  if (editing) {
    return (
      <TableRow className="bg-emerald-50/40 dark:bg-emerald-950/20">
        <TableCell>
          <Input
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            className="h-8"
          />
        </TableCell>
        <TableCell>
          <Input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="h-8"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={form.ciclo}
            onChange={(e) =>
              setForm({ ...form, ciclo: parseInt(e.target.value, 10) })
            }
            className="h-8 w-16"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={form.diaCorte}
            onChange={(e) =>
              setForm({ ...form, diaCorte: parseInt(e.target.value, 10) })
            }
            className="h-8 w-16"
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={form.diaPago}
            onChange={(e) =>
              setForm({ ...form, diaPago: parseInt(e.target.value, 10) })
            }
            className="h-8 w-16"
          />
        </TableCell>
        <TableCell>—</TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button size="sm" onClick={guardar} className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              className="h-7"
            >
              Cancelar
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
        {bloque.codigo}
      </TableCell>
      <TableCell>{bloque.nombre}</TableCell>
      <TableCell>{bloque.ciclo}</TableCell>
      <TableCell>{bloque.diaCorte}</TableCell>
      <TableCell>{bloque.diaPago}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            bloque.activo
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
              : "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
          }
        >
          {bloque.activo ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setForm(bloque);
              setEditing(true);
            }}
            className="h-7"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleActivo}
            className="h-7"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================
// Dialog Nuevo Usuario
// ============================================================
function DialogUsuario({
  open,
  onOpenChange,
  terceros,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  terceros: Tercero[];
}) {
  const [terceroId, setTerceroId] = useState("");
  const [numeroContrato, setNumeroContrato] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estrato, setEstrato] = useState("1");
  const [uso, setUso] = useState("residencial");
  const [tarifaFija, setTarifaFija] = useState("0");
  const [tarifaVariable, setTarifaVariable] = useState("0");
  const [medidor, setMedidor] = useState("");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!numeroContrato || !direccion) {
      toast.error("Contrato y dirección son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/servicios-publicos/usuarios", {
        terceroId: terceroId || undefined,
        numeroContrato,
        direccion,
        estrato: parseInt(estrato, 10),
        uso,
        tarifaFija: parseFloat(tarifaFija) || 0,
        tarifaVariable: parseFloat(tarifaVariable) || 0,
        medidor: medidor || undefined,
      });
      toast.success("Usuario creado");
      setTerceroId("");
      setNumeroContrato("");
      setDireccion("");
      setEstrato("1");
      setUso("residencial");
      setTarifaFija("0");
      setTarifaVariable("0");
      setMedidor("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo usuario de servicio</DialogTitle>
          <DialogDescription>
            Contrato y datos de medidor
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Titular (tercero)</Label>
            <Select value={terceroId} onValueChange={setTerceroId}>
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
            <Label>Número de contrato *</Label>
            <Input
              value={numeroContrato}
              onChange={(e) => setNumeroContrato(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Medidor</Label>
            <Input
              value={medidor}
              onChange={(e) => setMedidor(e.target.value)}
              placeholder="# serie"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Dirección *</Label>
            <Input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Estrato</Label>
            <Select value={estrato} onValueChange={setEstrato}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((e) => (
                  <SelectItem key={e} value={String(e)}>
                    Estrato {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Uso</Label>
            <Select value={uso} onValueChange={setUso}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="residencial">Residencial</SelectItem>
                <SelectItem value="comercial">Comercial</SelectItem>
                <SelectItem value="industrial">Industrial</SelectItem>
                <SelectItem value="oficial">Oficial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cargo fijo (COP)</Label>
            <Input
              type="number"
              value={tarifaFija}
              onChange={(e) => setTarifaFija(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tarifa variable (COP/u)</Label>
            <Input
              type="number"
              value={tarifaVariable}
              onChange={(e) => setTarifaVariable(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Nuevo Bloque
// ============================================================
function DialogBloque({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [ciclo, setCiclo] = useState("1");
  const [diaCorte, setDiaCorte] = useState("15");
  const [diaPago, setDiaPago] = useState("25");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!codigo || !nombre) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/servicios-publicos/bloques", {
        codigo,
        nombre,
        ciclo: parseInt(ciclo, 10),
        diaCorte: parseInt(diaCorte, 10),
        diaPago: parseInt(diaPago, 10),
      });
      toast.success("Bloque creado");
      setCodigo("");
      setNombre("");
      setCiclo("1");
      setDiaCorte("15");
      setDiaPago("25");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear bloque");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo bloque de facturación</DialogTitle>
          <DialogDescription>
            Ciclo mensual, día de corte y día de pago
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Código *</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ciclo (meses)</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={ciclo}
              onChange={(e) => setCiclo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Día de corte</Label>
            <Input
              type="number"
              min={1}
              max={28}
              value={diaCorte}
              onChange={(e) => setDiaCorte(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Día de pago</Label>
            <Input
              type="number"
              min={1}
              max={28}
              value={diaPago}
              onChange={(e) => setDiaPago(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear bloque"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Nueva Tarifa
// ============================================================
function DialogTarifa({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [tipoServicio, setTipoServicio] = useState("agua");
  const [estrato, setEstrato] = useState("1");
  const [uso, setUso] = useState("residencial");
  const [rangoDesde, setRangoDesde] = useState("0");
  const [rangoHasta, setRangoHasta] = useState("100");
  const [tarifa, setTarifa] = useState("0");
  const [cargoFijo, setCargoFijo] = useState("0");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    setSaving(true);
    try {
      await apiPost("/api/servicios-publicos/tarifas", {
        tipoServicio,
        estrato: parseInt(estrato, 10),
        uso,
        rangoDesde: parseFloat(rangoDesde) || 0,
        rangoHasta: parseFloat(rangoHasta) || 0,
        tarifa: parseFloat(tarifa) || 0,
        cargoFijo: parseFloat(cargoFijo) || 0,
      });
      toast.success("Tarifa creada");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear tarifa");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva tarifa de servicio</DialogTitle>
          <DialogDescription>
            Configuración por tipo de servicio, estrato y uso
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo de servicio</Label>
            <Select value={tipoServicio} onValueChange={setTipoServicio}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agua">Agua</SelectItem>
                <SelectItem value="energia">Energía</SelectItem>
                <SelectItem value="gas">Gas</SelectItem>
                <SelectItem value="aseo">Aseo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Estrato</Label>
            <Select value={estrato} onValueChange={setEstrato}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((e) => (
                  <SelectItem key={e} value={String(e)}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Uso</Label>
            <Select value={uso} onValueChange={setUso}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="residencial">Residencial</SelectItem>
                <SelectItem value="comercial">Comercial</SelectItem>
                <SelectItem value="industrial">Industrial</SelectItem>
                <SelectItem value="oficial">Oficial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tarifa (COP / unidad)</Label>
            <Input
              type="number"
              value={tarifa}
              onChange={(e) => setTarifa(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rango desde</Label>
            <Input
              type="number"
              value={rangoDesde}
              onChange={(e) => setRangoDesde(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rango hasta</Label>
            <Input
              type="number"
              value={rangoHasta}
              onChange={(e) => setRangoHasta(e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Cargo fijo (COP)</Label>
            <Input
              type="number"
              value={cargoFijo}
              onChange={(e) => setCargoFijo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear tarifa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Nueva Lectura (individual)
// ============================================================
function DialogLectura({
  open,
  onOpenChange,
  usuarios,
  bloques,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  usuarios: UsuarioServicio[];
  bloques: BloqueFacturacion[];
}) {
  const [usuarioId, setUsuarioId] = useState("");
  const [lecturaActual, setLecturaActual] = useState("");
  const [bloqueId, setBloqueId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!usuarioId || !lecturaActual) {
      toast.error("Usuario y lectura actual son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/servicios-publicos/lecturas", {
        usuarioServicioId: usuarioId,
        lecturaActual: parseFloat(lecturaActual),
        bloqueFacturacionId: bloqueId || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success("Lectura registrada");
      setUsuarioId("");
      setLecturaActual("");
      setBloqueId("");
      setObservaciones("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al registrar lectura");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva lectura de medidor</DialogTitle>
          <DialogDescription>
            La lectura anterior se toma automáticamente de la última registrada
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Usuario *</Label>
            <Select value={usuarioId} onValueChange={setUsuarioId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar usuario" />
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.numeroContrato} · {u.direccion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Lectura actual *</Label>
            <Input
              type="number"
              value={lecturaActual}
              onChange={(e) => setLecturaActual(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bloque de facturación</Label>
            <Select value={bloqueId} onValueChange={setBloqueId}>
              <SelectTrigger>
                <SelectValue placeholder="(opcional)" />
              </SelectTrigger>
              <SelectContent>
                {bloques.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.codigo} · {b.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Registrar lectura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Importar Lecturas CSV (textarea)
// ============================================================
function DialogImportCSV({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [bloqueId, setBloqueId] = useState("");
  const [bloques, setBloques] = useState<BloqueFacturacion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      apiGet<{ items: BloqueFacturacion[] }>(
        `/api/servicios-publicos/bloques?pageSize=200`,
      )
        .then((d) => setBloques(d.items))
        .catch(() => setBloques([]));
    }
  }, [open]);

  // preview: parsea líneas con `contrato;lectura` (o `contrato,lectura`)
  const lineas = csv
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: { contrato: string; lectura: string }[] = [];
  for (const l of lineas) {
    const parts = l.split(/[;,]/).map((p) => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      parsed.push({ contrato: parts[0], lectura: parts[1] });
    }
  }

  async function guardar() {
    if (parsed.length === 0) {
      toast.error("Sin lecturas válidas para importar");
      return;
    }
    setSaving(true);
    try {
      // Buscar usuario por contrato
      const usuariosRes = await apiGet<{ items: UsuarioServicio[] }>(
        `/api/servicios-publicos/usuarios?pageSize=2000`,
      );
      const byContrato = new Map(
        usuariosRes.items.map((u) => [u.numeroContrato, u]),
      );
      const lecturas = [];
      for (const p of parsed) {
        const u = byContrato.get(p.contrato);
        if (u) {
          lecturas.push({
            usuarioServicioId: u.id,
            lecturaActual: parseFloat(p.lectura),
            bloqueFacturacionId: bloqueId || undefined,
          });
        }
      }
      if (lecturas.length === 0) {
        toast.error("Ningún contrato coincide con usuarios registrados");
        setSaving(false);
        return;
      }
      const res = await apiPost<{ creadas: number; errores: any[] }>(
        `/api/servicios-publicos/lecturas/bulk`,
        { lecturas },
      );
      toast.success(
        `${res.creadas} lecturas creadas${
          res.errores.length ? ` (${res.errores.length} errores)` : ""
        }`,
      );
      setCsv("");
      setBloqueId("");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al importar lecturas");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Importar lecturas (CSV)
          </DialogTitle>
          <DialogDescription>
            Formato: una línea por lectura — <code>contrato;lectura</code> o{" "}
            <code>contrato,lectura</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Bloque de facturación (opcional)</Label>
            <Select value={bloqueId} onValueChange={setBloqueId}>
              <SelectTrigger>
                <SelectValue placeholder="(opcional)" />
              </SelectTrigger>
              <SelectContent>
                {bloques.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.codigo} · {b.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>CSV de lecturas</Label>
            <Textarea
              rows={10}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={`EJEMPLO:\nUSU-001;1250\nUSU-002;830\nUSU-003;1499`}
              className="font-mono text-xs"
            />
          </div>
          <div className="rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-2 text-sm">
            <span className="text-neutral-600 dark:text-neutral-400">
              Líneas válidas:{" "}
            </span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
              {parsed.length}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving || parsed.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Importando…" : `Importar ${parsed.length} lecturas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Importación Masiva (tabla editable)
// ============================================================
function DialogImportMasivo({
  open,
  onOpenChange,
  usuarios,
  bloques,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  usuarios: UsuarioServicio[];
  bloques: BloqueFacturacion[];
  onSaved: () => void;
}) {
  const [seleccion, setSeleccion] = useState<
    Record<string, { checked: boolean; lectura: string }>
  >({});
  const [bloqueId, setBloqueId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const init: Record<string, { checked: boolean; lectura: string }> = {};
      usuarios.forEach((u) => {
        init[u.id] = { checked: false, lectura: "" };
      });
      setSeleccion(init);
    }
  }, [open, usuarios]);

  const seleccionados = Object.entries(seleccion).filter(
    ([, v]) => v.checked && v.lectura,
  );

  async function guardar() {
    if (seleccionados.length === 0) {
      toast.error("Seleccione usuarios e ingrese lecturas");
      return;
    }
    setSaving(true);
    try {
      const lecturas = seleccionados.map(([id, v]) => ({
        usuarioServicioId: id,
        lecturaActual: parseFloat(v.lectura),
        bloqueFacturacionId: bloqueId || undefined,
      }));
      const res = await apiPost<{ creadas: number; errores: any[] }>(
        `/api/servicios-publicos/lecturas/bulk`,
        { lecturas },
      );
      toast.success(`${res.creadas} lecturas creadas`);
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error en importación masiva");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Importación masiva de lecturas
          </DialogTitle>
          <DialogDescription>
            Marque los usuarios y digite la lectura actual de cada medidor
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label>Bloque</Label>
              <Select value={bloqueId} onValueChange={setBloqueId}>
                <SelectTrigger>
                  <SelectValue placeholder="(opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {bloques.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.codigo} · {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-neutral-500 pt-4">
              {seleccionados.length} seleccionado(s)
            </div>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white dark:bg-neutral-900">
                <TableRow>
                  <TableHead className="w-8">✓</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Lectura actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-emerald-600"
                        checked={seleccion[u.id]?.checked ?? false}
                        onChange={(e) =>
                          setSeleccion({
                            ...seleccion,
                            [u.id]: {
                              checked: e.target.checked,
                              lectura: seleccion[u.id]?.lectura ?? "",
                            },
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {u.numeroContrato}
                    </TableCell>
                    <TableCell className="text-sm">{u.direccion}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-32"
                        disabled={!seleccion[u.id]?.checked}
                        value={seleccion[u.id]?.lectura ?? ""}
                        onChange={(e) =>
                          setSeleccion({
                            ...seleccion,
                            [u.id]: {
                              checked: seleccion[u.id]?.checked ?? false,
                              lectura: e.target.value,
                            },
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving || seleccionados.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving
              ? "Guardando…"
              : `Registrar ${seleccionados.length} lecturas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Facturar Bloque (selector + confirmar)
// ============================================================
function DialogFacturar({
  open,
  onOpenChange,
  bloques,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bloques: BloqueFacturacion[];
  onDone: () => void;
}) {
  const [bloqueId, setBloqueId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  async function facturar() {
    if (!bloqueId) {
      toast.error("Seleccione un bloque");
      return;
    }
    setSaving(true);
    setResultado(null);
    try {
      const res = await apiPost<{
        facturas: number;
        totalFacturado: number;
        totalLecturas: number;
        errores: any[];
      }>(`/api/servicios-publicos/facturar-bloque`, { bloqueFacturacionId: bloqueId });
      setResultado(res);
      toast.success(`${res.facturas} factura(s) generada(s)`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Error al facturar bloque");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Facturar bloque
          </DialogTitle>
          <DialogDescription>
            Genera facturas para todas las lecturas no facturadas del bloque
          </DialogDescription>
        </DialogHeader>
        {resultado ? (
          <div className="space-y-2">
            <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">
                  Facturas generadas
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {resultado.facturas}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">
                  Total facturado
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(resultado.totalFacturado)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">
                  Lecturas procesadas
                </span>
                <span>{resultado.totalLecturas}</span>
              </div>
              {resultado.errores?.length > 0 && (
                <div className="text-rose-600 dark:text-rose-400 text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {resultado.errores.length} error(es) — ver consola
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setResultado(null);
                setBloqueId("");
                setConfirm(false);
                onOpenChange(false);
              }}
              className="w-full"
            >
              Cerrar
            </Button>
          </div>
        ) : !confirm ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Bloque de facturación</Label>
              <Select value={bloqueId} onValueChange={setBloqueId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar bloque" />
                </SelectTrigger>
                <SelectContent>
                  {bloques.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.codigo} · {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setConfirm(true)}
              disabled={!bloqueId || saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Continuar
            </Button>
          </div>
        ) : (
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Confirmar facturación?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se generarán facturas para todas las lecturas no facturadas del
                  bloque. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={facturar}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saving ? "Facturando…" : "Sí, facturar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
