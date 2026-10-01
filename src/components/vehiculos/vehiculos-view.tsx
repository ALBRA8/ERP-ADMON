"use client";

// ============================================================
// ERP Marsella — Vista Vehículos y Mascotas (Hermes §5.19)
// Tabs: Vehículos | Mascotas
// Acento emerald/teal, dark mode, responsive mobile-first.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Car,
  PawPrint,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  Hash,
  Palette,
  Bike,
  Bus,
  Truck,
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
import { Skeleton } from "@/components/ui/skeleton";

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

const VEH_TIPO_ICON: Record<string, any> = {
  particular: Car,
  publico: Bus,
  carga: Truck,
  moto: Bike,
};

// ---------- Tipos ----------
interface Tercero {
  id: string;
  nombre: string;
  numeroDocumento: string;
}

interface Vehiculo {
  id: string;
  terceroId?: string | null;
  tercero?: Tercero | null;
  placa: string;
  marca: string;
  modelo: string;
  anio: number;
  color?: string | null;
  kilometraje: number;
  tipo: string;
  observaciones?: string | null;
}

interface Mascota {
  id: string;
  terceroId?: string | null;
  tercero?: Tercero | null;
  nombre: string;
  especie: string;
  raza?: string | null;
  sexo?: string | null;
  fechaNacimiento?: string | null;
  color?: string | null;
  microchip?: string | null;
  observaciones?: string | null;
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
export function VehiculosView() {
  const [tab, setTab] = useState("vehiculos");
  const [loading, setLoading] = useState(false);

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [totalVeh, setTotalVeh] = useState(0);
  const [qVeh, setQVeh] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("");

  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [totalMas, setTotalMas] = useState(0);
  const [qMas, setQMas] = useState("");
  const [especieFiltro, setEspecieFiltro] = useState<string>("");

  const [terceros, setTerceros] = useState<Tercero[]>([]);

  // Diálogos
  const [dlgVeh, setDlgVeh] = useState(false);
  const [dlgMas, setDlgMas] = useState(false);

  const cargarVehiculos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (qVeh) params.set("q", qVeh);
      if (tipoFiltro && tipoFiltro !== "ALL") params.set("tipo", tipoFiltro);
      const data = await apiGet<{ items: Vehiculo[]; total: number }>(
        `/api/vehiculos?${params.toString()}`,
      );
      setVehiculos(data.items);
      setTotalVeh(data.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar vehículos");
    } finally {
      setLoading(false);
    }
  }, [qVeh, tipoFiltro]);

  const cargarMascotas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (qMas) params.set("q", qMas);
      if (especieFiltro && especieFiltro !== "ALL")
        params.set("especie", especieFiltro);
      const data = await apiGet<{ items: Mascota[]; total: number }>(
        `/api/mascotas?${params.toString()}`,
      );
      setMascotas(data.items);
      setTotalMas(data.total);
    } catch (e: any) {
      toast.error(e.message ?? "Error al cargar mascotas");
    } finally {
      setLoading(false);
    }
  }, [qMas, especieFiltro]);

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
    cargarVehiculos();
    cargarTerceros();
  }, [cargarVehiculos, cargarTerceros]);

  useEffect(() => {
    if (tab === "mascotas") cargarMascotas();
  }, [tab, cargarMascotas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Car className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Vehículos y Mascotas
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Registro de vehículos y mascotas asociados a terceros
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cargarVehiculos();
            cargarTerceros();
            if (tab === "mascotas") cargarMascotas();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="vehiculos">
            <Car className="w-4 h-4 mr-1" /> Vehículos
          </TabsTrigger>
          <TabsTrigger value="mascotas">
            <PawPrint className="w-4 h-4 mr-1" /> Mascotas
          </TabsTrigger>
        </TabsList>

        {/* ---------- TAB 1: VEHÍCULOS ---------- */}
        <TabsContent value="vehiculos" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Vehículos</CardTitle>
                  <CardDescription>
                    {totalVeh} vehículo(s) registrado(s)
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-neutral-400" />
                    <Input
                      placeholder="Buscar placa/marca…"
                      value={qVeh}
                      onChange={(e) => setQVeh(e.target.value)}
                      className="pl-8 w-48"
                    />
                  </div>
                  <Select
                    value={tipoFiltro || "ALL"}
                    onValueChange={(v) =>
                      setTipoFiltro(v === "ALL" ? "" : v)
                    }
                  >
                    <SelectTrigger className="w-36">
                      <Filter className="w-3.5 h-3.5 mr-1 text-neutral-400" />
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="particular">Particular</SelectItem>
                      <SelectItem value="publico">Público</SelectItem>
                      <SelectItem value="carga">Carga</SelectItem>
                      <SelectItem value="moto">Moto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => setDlgVeh(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Nuevo vehículo
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
                        <TableHead>Placa</TableHead>
                        <TableHead>Marca</TableHead>
                        <TableHead>Modelo</TableHead>
                        <TableHead>Año</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Propietario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehiculos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-neutral-500 py-8">
                            No hay vehículos registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        vehiculos.map((v) => {
                          const Icon = VEH_TIPO_ICON[v.tipo] ?? Car;
                          return (
                            <TableRow key={v.id}>
                              <TableCell className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                                {v.placa}
                              </TableCell>
                              <TableCell>{v.marca}</TableCell>
                              <TableCell>{v.modelo}</TableCell>
                              <TableCell>{v.anio}</TableCell>
                              <TableCell className="capitalize">
                                {v.color ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 capitalize"
                                >
                                  <Icon className="w-3 h-3 mr-1" />
                                  {v.tipo}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {v.tercero?.nombre ?? "—"}
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

        {/* ---------- TAB 2: MASCOTAS ---------- */}
        <TabsContent value="mascotas" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Mascotas</CardTitle>
                  <CardDescription>
                    {totalMas} mascota(s) registrada(s)
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-neutral-400" />
                    <Input
                      placeholder="Buscar nombre/raza…"
                      value={qMas}
                      onChange={(e) => setQMas(e.target.value)}
                      className="pl-8 w-48"
                    />
                  </div>
                  <Select
                    value={especieFiltro || "ALL"}
                    onValueChange={(v) =>
                      setEspecieFiltro(v === "ALL" ? "" : v)
                    }
                  >
                    <SelectTrigger className="w-36">
                      <Filter className="w-3.5 h-3.5 mr-1 text-neutral-400" />
                      <SelectValue placeholder="Especie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      <SelectItem value="perro">Perro</SelectItem>
                      <SelectItem value="gato">Gato</SelectItem>
                      <SelectItem value="ave">Ave</SelectItem>
                      <SelectItem value="conejo">Conejo</SelectItem>
                      <SelectItem value="reptil">Reptil</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => setDlgMas(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Nueva mascota
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
                        <TableHead>Nombre</TableHead>
                        <TableHead>Especie</TableHead>
                        <TableHead>Raza</TableHead>
                        <TableHead>Sexo</TableHead>
                        <TableHead>Nacimiento</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Microchip</TableHead>
                        <TableHead>Dueño</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mascotas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-neutral-500 py-8">
                            No hay mascotas registradas
                          </TableCell>
                        </TableRow>
                      ) : (
                        mascotas.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-semibold flex items-center gap-1.5">
                              <PawPrint className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              {m.nombre}
                            </TableCell>
                            <TableCell className="capitalize">{m.especie}</TableCell>
                            <TableCell>{m.raza ?? "—"}</TableCell>
                            <TableCell>
                              {m.sexo ? (
                                <Badge
                                  variant="outline"
                                  className={
                                    m.sexo === "M"
                                      ? "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300 border-teal-200 dark:border-teal-900"
                                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 border-rose-200 dark:border-rose-900"
                                  }
                                >
                                  {m.sexo}
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>{fmtFecha(m.fechaNacimiento)}</TableCell>
                            <TableCell className="capitalize">
                              {m.color ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {m.microchip ?? "—"}
                            </TableCell>
                            <TableCell>
                              {m.tercero?.nombre ?? "—"}
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
      </Tabs>

      {/* ---------- DIALOGOS ---------- */}
      <DialogVehiculo
        open={dlgVeh}
        onOpenChange={(o) => {
          setDlgVeh(o);
          if (!o) cargarVehiculos();
        }}
        terceros={terceros}
      />
      <DialogMascota
        open={dlgMas}
        onOpenChange={(o) => {
          setDlgMas(o);
          if (!o) cargarMascotas();
        }}
        terceros={terceros}
      />
    </div>
  );
}

// ============================================================
// Dialog Nuevo Vehículo
// ============================================================
function DialogVehiculo({
  open,
  onOpenChange,
  terceros,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  terceros: Tercero[];
}) {
  const [terceroId, setTerceroId] = useState("");
  const [placa, setPlaca] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [color, setColor] = useState("");
  const [kilometraje, setKilometraje] = useState("0");
  const [tipo, setTipo] = useState("particular");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!placa || !marca || !modelo) {
      toast.error("Placa, marca y modelo son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/vehiculos", {
        terceroId: terceroId || undefined,
        placa: placa.toUpperCase(),
        marca,
        modelo,
        anio: parseInt(anio, 10),
        color: color || undefined,
        kilometraje: parseInt(kilometraje, 10) || 0,
        tipo,
        observaciones: observaciones || undefined,
      });
      toast.success("Vehículo creado");
      setTerceroId("");
      setPlaca("");
      setMarca("");
      setModelo("");
      setAnio(String(new Date().getFullYear()));
      setColor("");
      setKilometraje("0");
      setTipo("particular");
      setObservaciones("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear vehículo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Nuevo vehículo
          </DialogTitle>
          <DialogDescription>
            Placa única por empresa
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Propietario (tercero)</Label>
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
            <Label>Placa *</Label>
            <Input
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="particular">Particular</SelectItem>
                <SelectItem value="publico">Público</SelectItem>
                <SelectItem value="carga">Carga</SelectItem>
                <SelectItem value="moto">Moto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Marca *</Label>
            <Input value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Modelo *</Label>
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Año</Label>
            <Input
              type="number"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Kilometraje</Label>
            <Input
              type="number"
              value={kilometraje}
              onChange={(e) => setKilometraje(e.target.value)}
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear vehículo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog Nueva Mascota
// ============================================================
function DialogMascota({
  open,
  onOpenChange,
  terceros,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  terceros: Tercero[];
}) {
  const [terceroId, setTerceroId] = useState("");
  const [nombre, setNombre] = useState("");
  const [especie, setEspecie] = useState("perro");
  const [raza, setRaza] = useState("");
  const [sexo, setSexo] = useState("M");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [color, setColor] = useState("");
  const [microchip, setMicrochip] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!nombre || !especie) {
      toast.error("Nombre y especie son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/mascotas", {
        terceroId: terceroId || undefined,
        nombre,
        especie,
        raza: raza || undefined,
        sexo,
        fechaNacimiento: fechaNacimiento || undefined,
        color: color || undefined,
        microchip: microchip || undefined,
        observaciones: observaciones || undefined,
      });
      toast.success("Mascota creada");
      setTerceroId("");
      setNombre("");
      setEspecie("perro");
      setRaza("");
      setSexo("M");
      setFechaNacimiento("");
      setColor("");
      setMicrochip("");
      setObservaciones("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear mascota");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PawPrint className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Nueva mascota
          </DialogTitle>
          <DialogDescription>
            Datos de la mascota y su dueño
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Dueño (tercero)</Label>
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
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Especie *</Label>
            <Select value={especie} onValueChange={setEspecie}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="perro">Perro</SelectItem>
                <SelectItem value="gato">Gato</SelectItem>
                <SelectItem value="ave">Ave</SelectItem>
                <SelectItem value="conejo">Conejo</SelectItem>
                <SelectItem value="reptil">Reptil</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Raza</Label>
            <Input value={raza} onChange={(e) => setRaza(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sexo</Label>
            <Select value={sexo} onValueChange={setSexo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Macho</SelectItem>
                <SelectItem value="H">Hembra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de nacimiento</Label>
            <Input
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Microchip</Label>
            <Input
              value={microchip}
              onChange={(e) => setMicrochip(e.target.value)}
              placeholder="# de microchip (opcional)"
              className="font-mono"
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? "Guardando…" : "Crear mascota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
