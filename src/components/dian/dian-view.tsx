"use client";

// ============================================================
// ERP Marsella — Vista Facturación Electrónica DIAN
// Tabs: Configuración | Documentos electrónicos | Historial de envíos
//
// Backend:
//   GET    /api/dian/config        — lista configs (metadatos)
//   PUT    /api/dian/config        — guarda config + certificado P12
//   POST   /api/dian/test-connection
//   POST   /api/dian/enviar/[facturaId]
//   POST   /api/dian/procesar-cola
//   GET    /api/dian/envios         — listado paginado
//   GET    /api/dian/envios/[id]   — detalle con XML firmado
//   GET    /api/facturas           — listado de facturas
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  XCircle,
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
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/currency-fn";

// ---------- Tipos ----------

interface ConfigDIAN {
  id: string;
  ambiente: string;
  activo: boolean;
  tieneCertificado: boolean;
  certificadoSubject?: string | null;
  certificadoValidFrom?: string | Date | null;
  certificadoValidTo?: string | Date | null;
  proveedorTecnologicoNit?: string | null;
  tieneTokenPAC: boolean;
  softwareId?: string | null;
  tieneSoftwarePin: boolean;
  webhookUrl?: string | null;
  updatedAt: string;
}

interface FacturaDIAN {
  id: string;
  numero: string;
  fecha: string;
  nombreCliente: string;
  nitCliente: string;
  total: number;
  cufe?: string | null;
  estadoDIAN: string;
  esPOS?: boolean;
}

interface EnvioDIAN {
  id: string;
  facturaId?: string | null;
  nominaId?: string | null;
  tipoDocumento: string;
  cufe: string;
  trackId?: string | null;
  estado: string;
  intentos: number;
  maxIntentos: number;
  proximoIntento?: string | null;
  mensajeError?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EnvioDIANDetalle extends EnvioDIAN {
  xmlFirmado?: string | null;
  respuestaDian?: any;
}

// ---------- Helpers UI ----------

const estadoDIANBadge = (estado: string) => {
  switch (estado) {
    case "aceptado":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Aceptado
        </Badge>
      );
    case "rechazado":
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900">
          <XCircle className="w-3 h-3 mr-1" /> Rechazado
        </Badge>
      );
    case "procesado":
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900">
          <Clock className="w-3 h-3 mr-1" /> Procesado
        </Badge>
      );
    case "enviando":
      return (
        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Enviando
        </Badge>
      );
    case "pendiente":
      return (
        <Badge variant="outline" className="text-neutral-600 dark:text-neutral-400">
          <Clock className="w-3 h-3 mr-1" /> Pendiente
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-900">
          <AlertCircle className="w-3 h-3 mr-1" /> Error
        </Badge>
      );
    case "borrador":
    default:
      return (
        <Badge variant="outline" className="text-neutral-500">
          Borrador
        </Badge>
      );
  }
};

function fmtDate(d?: string | Date | null): string {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(d);
  }
}

// ============================================================
// Componente principal
// ============================================================

export function DianView() {
  const [tab, setTab] = useState<"config" | "documentos" | "historial">("config");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
          <FileCheck2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Facturación Electrónica DIAN</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Firma XAdES-EPES con certificado X.509 y envío SOAP a la DIAN Colombia.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="config">
            <ShieldCheck className="w-4 h-4 mr-2" /> Configuración
          </TabsTrigger>
          <TabsTrigger value="documentos">
            <FileCheck2 className="w-4 h-4 mr-2" /> Documentos
          </TabsTrigger>
          <TabsTrigger value="historial">
            <Activity className="w-4 h-4 mr-2" /> Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <TabConfig />
        </TabsContent>
        <TabsContent value="documentos" className="mt-4">
          <TabDocumentos />
        </TabsContent>
        <TabsContent value="historial" className="mt-4">
          <TabHistorial />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Tab: Configuración
// ============================================================

function TabConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<ConfigDIAN | null>(null);

  // Campos del form
  const [ambiente, setAmbiente] = useState<"pruebas" | "produccion">("pruebas");
  const [password, setPassword] = useState("");
  const [fileP12, setFileP12] = useState<File | null>(null);
  const [proveedorTecnologicoNit, setProveedorTecnologicoNit] = useState("");
  const [proveedorTecnologicoToken, setProveedorTecnologicoToken] = useState("");
  const [softwareId, setSoftwareId] = useState("");
  const [softwarePin, setSoftwarePin] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/dian/config");
      const d = await r.json();
      const list = d.items as ConfigDIAN[];
      // Tomar el activo o el primero
      const active = list.find((c) => c.activo) ?? list[0] ?? null;
      setConfig(active);
      if (active) {
        setAmbiente(active.ambiente as "pruebas" | "produccion");
        setProveedorTecnologicoNit(active.proveedorTecnologicoNit ?? "");
        setSoftwareId(active.softwareId ?? "");
        setWebhookUrl(active.webhookUrl ?? "");
      }
    } catch (e: any) {
      toast.error("Error cargando configuración: " + (e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileP12 && !password && !config?.tieneCertificado) {
      // Solo se guardan datos del PAC
    }
    if (fileP12 && !password) {
      toast.error("Debes ingresar la contraseña del certificado.");
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("ambiente", ambiente);
      fd.append("activo", "true");
      if (fileP12) fd.append("certificadoP12", fileP12);
      if (password) fd.append("password", password);
      if (proveedorTecnologicoNit) fd.append("proveedorTecnologicoNit", proveedorTecnologicoNit);
      if (proveedorTecnologicoToken) fd.append("proveedorTecnologicoToken", proveedorTecnologicoToken);
      if (softwareId) fd.append("softwareId", softwareId);
      if (softwarePin) fd.append("softwarePin", softwarePin);
      if (webhookUrl) fd.append("webhookUrl", webhookUrl);

      const r = await fetch("/api/dian/config", {
        method: "PUT",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error al guardar configuración");
        return;
      }
      toast.success(d.mensaje ?? "Configuración guardada");
      setPassword("");
      setFileP12(null);
      // Reset file input
      const fileInput = document.getElementById("file-p12") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      void loadConfig();
    } catch (e: any) {
      toast.error("Error: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/dian/test-connection", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        toast.success(d.message ?? "Conexión exitosa", {
          duration: 8000,
        });
      } else {
        toast.error(d.message ?? "Sin conexión", {
          duration: 8000,
        });
      }
    } catch (e: any) {
      toast.error("Error probando conexión: " + (e?.message ?? e));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center text-neutral-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando configuración...
        </CardContent>
      </Card>
    );
  }

  const vigente = config?.certificadoValidTo
    ? new Date(config.certificadoValidTo) > new Date()
    : false;

  return (
    <div className="space-y-4">
      {config?.tieneCertificado && (
        <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <BadgeCheck className="w-5 h-5" />
              Certificado cargado
            </CardTitle>
            <CardDescription className="text-emerald-700 dark:text-emerald-400">
              {config.certificadoSubject ?? "Subject desconocido"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-neutral-500">Válido desde</div>
              <div className="font-medium">{fmtDate(config.certificadoValidFrom)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Válido hasta</div>
              <div className="font-medium">{fmtDate(config.certificadoValidTo)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Estado</div>
              {vigente ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Vigente
                </Badge>
              ) : (
                <Badge variant="destructive">Expirado</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!config?.tieneCertificado && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sin certificado cargado</AlertTitle>
          <AlertDescription>
            Sube tu archivo .p12 (con contraseña) en el formulario de abajo para
            habilitar el firma y envío real a DIAN. Sin certificado, las facturas
            se quedan en estado "procesado" (CUFE mock).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Configuración DIAN</CardTitle>
          <CardDescription>
            Datos del certificado X.509 y del proveedor tecnológico autorizado (PAC).
            Los secretos se cifran con AES-256-GCM antes de guardarse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            {/* Ambiente */}
            <div>
              <Label className="mb-2 block">Ambiente DIAN</Label>
              <RadioGroup
                value={ambiente}
                onValueChange={(v) => setAmbiente(v as "pruebas" | "produccion")}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pruebas" id="amb-pruebas" />
                  <Label htmlFor="amb-pruebas" className="cursor-pointer font-normal">
                    Pruebas (habilitación)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="produccion" id="amb-prod" />
                  <Label htmlFor="amb-prod" className="cursor-pointer font-normal">
                    Producción
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Certificado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="file-p12" className="mb-2 block">
                  Certificado P12 / PFX
                </Label>
                <Input
                  id="file-p12"
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  onChange={(e) => setFileP12(e.target.files?.[0] ?? null)}
                  className="cursor-pointer"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {fileP12
                    ? `Archivo: ${fileP12.name} (${(fileP12.size / 1024).toFixed(1)} KB)`
                    : "Deja vacío para conservar el certificado actual."}
                </p>
              </div>
              <div>
                <Label htmlFor="password-p12" className="mb-2 block">
                  Contraseña del certificado
                </Label>
                <Input
                  id="password-p12"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* Proveedor tecnológico */}
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
              <h3 className="font-semibold mb-3">Proveedor tecnológico (PAC)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pac-nit" className="mb-2 block">
                    NIT del PAC
                  </Label>
                  <Input
                    id="pac-nit"
                    value={proveedorTecnologicoNit}
                    onChange={(e) => setProveedorTecnologicoNit(e.target.value)}
                    placeholder="Ej: 901001234-5"
                  />
                </div>
                <div>
                  <Label htmlFor="pac-token" className="mb-2 block">
                    Token del PAC
                  </Label>
                  <Input
                    id="pac-token"
                    type="password"
                    value={proveedorTecnologicoToken}
                    onChange={(e) => setProveedorTecnologicoToken(e.target.value)}
                    placeholder={config?.tieneTokenPAC ? "•••••••• (cargado)" : "Token asignado por DIAN al PAC"}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            {/* Software DIAN */}
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
              <h3 className="font-semibold mb-3">Software DIAN</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="sw-id" className="mb-2 block">
                    Software ID
                  </Label>
                  <Input
                    id="sw-id"
                    value={softwareId}
                    onChange={(e) => setSoftwareId(e.target.value)}
                    placeholder="ID del software registrado en DIAN"
                  />
                </div>
                <div>
                  <Label htmlFor="sw-pin" className="mb-2 block">
                    Software PIN
                  </Label>
                  <Input
                    id="sw-pin"
                    type="password"
                    value={softwarePin}
                    onChange={(e) => setSoftwarePin(e.target.value)}
                    placeholder={config?.tieneSoftwarePin ? "•••• (cargado)" : "PIN del software"}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label htmlFor="webhook" className="mb-2 block">
                    Webhook URL
                  </Label>
                  <Input
                    id="webhook"
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar configuración
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing || !config?.tieneCertificado}
              >
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />}
                Probar conexión
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab: Documentos electrónicos (facturas)
// ============================================================

function TabDocumentos() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FacturaDIAN[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [q, setQ] = useState("");
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [procesandoCola, setProcesandoCola] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q) params.append("q", q);
      const r = await fetch(`/api/facturas?${params.toString()}`);
      const d = await r.json();
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    } catch (e: any) {
      toast.error("Error cargando facturas: " + (e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEnviar = async (factura: FacturaDIAN) => {
    setEnviandoId(factura.id);
    try {
      const r = await fetch(`/api/dian/enviar/${factura.id}`, {
        method: "POST",
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error enviando a DIAN", { duration: 8000 });
        return;
      }
      if (d.ok && d.trackId) {
        toast.success(`Factura ${factura.numero} enviada. TrackId: ${d.trackId}`, {
          duration: 8000,
        });
      } else if (d.mensaje) {
        toast(d.mensaje, { duration: 8000 });
      }
      void load();
    } catch (e: any) {
      toast.error("Error: " + (e?.message ?? e));
    } finally {
      setEnviandoId(null);
    }
  };

  const handleProcesarCola = async () => {
    setProcesandoCola(true);
    try {
      const r = await fetch("/api/dian/procesar-cola", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Error procesando cola");
        return;
      }
      toast.success(
        `Cola procesada: ${d.accepted} aceptadas, ${d.errors} reintentos, ${d.rejected} rechazadas`,
        { duration: 8000 },
      );
      void load();
    } catch (e: any) {
      toast.error("Error: " + (e?.message ?? e));
    } finally {
      setProcesandoCola(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Facturas electrónicas</CardTitle>
            <CardDescription>
              {total} facturas · firma XAdES-EPES + envío a DIAN.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Buscar número/cliente/NIT..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-64"
            />
            <Button variant="outline" size="icon" onClick={() => void load()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              onClick={handleProcesarCola}
              disabled={procesandoCola}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {procesandoCola ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Procesar cola
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            Cargando...
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            No hay facturas. Crea una en Facturación.
          </div>
        ) : (
          <>
            <div className="rounded-md border max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>CUFE</TableHead>
                    <TableHead>Estado DIAN</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDate(f.fecha)}
                      </TableCell>
                      <TableCell className="font-mono font-medium whitespace-nowrap">
                        {f.numero}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{f.nombreCliente}</div>
                        <div className="text-xs text-neutral-500">{f.nitCliente}</div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatCurrency(f.total)}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        {f.cufe ? (
                          <div className="text-[10px] font-mono break-all text-neutral-500">
                            {f.cufe.slice(0, 32)}…
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>{estadoDIANBadge(f.estadoDIAN)}</TableCell>
                      <TableCell className="text-right">
                        {f.estadoDIAN === "aceptado" ? (
                          <span className="text-xs text-emerald-600">Enviada ✓</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={enviandoId === f.id}
                            onClick={() => void handleEnviar(f)}
                          >
                            {enviandoId === f.id ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3 mr-1" />
                            )}
                            Enviar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-neutral-500">
                Página {page} de {totalPages} · {total} facturas
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab: Historial de envíos
// ============================================================

function TabHistorial() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EnvioDIAN[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [detalle, setDetalle] = useState<EnvioDIANDetalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (estadoFiltro) params.append("estado", estadoFiltro);
      const r = await fetch(`/api/dian/envios?${params.toString()}`);
      const d = await r.json();
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    } catch (e: any) {
      toast.error("Error cargando envíos: " + (e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, estadoFiltro]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetalle = async (id: string) => {
    setLoadingDetalle(true);
    setOpen(true);
    try {
      const r = await fetch(`/api/dian/envios/${id}`);
      const d = await r.json();
      setDetalle(d);
    } catch (e: any) {
      toast.error("Error cargando detalle: " + (e?.message ?? e));
    } finally {
      setLoadingDetalle(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Historial de envíos DIAN</CardTitle>
            <CardDescription>
              {total} envíos registrados. Click en una fila para ver XML firmado y respuesta DIAN.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <select
              value={estadoFiltro}
              onChange={(e) => {
                setEstadoFiltro(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="enviando">Enviando</option>
              <option value="aceptado">Aceptado</option>
              <option value="rechazado">Rechazado</option>
              <option value="error">Error</option>
            </select>
            <Button variant="outline" size="icon" onClick={() => void load()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            Cargando...
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            No hay envíos DIAN registrados.
          </div>
        ) : (
          <>
            <div className="rounded-md border max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>CUFE</TableHead>
                    <TableHead>TrackId</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Intentos</TableHead>
                    <TableHead>Próximo intento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((e) => (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      onClick={() => void openDetalle(e.id)}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDate(e.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {e.tipoDocumento === "factura_venta"
                          ? "Factura"
                          : e.tipoDocumento === "nota_credito"
                            ? "N. Crédito"
                            : e.tipoDocumento === "nomina"
                              ? "Nómina"
                              : e.tipoDocumento}
                      </TableCell>
                      <TableCell className="max-w-[140px]">
                        <div className="text-[10px] font-mono break-all text-neutral-500">
                          {e.cufe.slice(0, 24)}…
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {e.trackId ?? "—"}
                      </TableCell>
                      <TableCell>{estadoDIANBadge(e.estado)}</TableCell>
                      <TableCell className="text-center text-xs">
                        {e.intentos}/{e.maxIntentos}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {e.proximoIntento ? fmtDate(e.proximoIntento) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-neutral-500">
                Página {page} de {totalPages} · {total} envíos
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Sheet detalle */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto p-0"
        >
          <SheetHeader className="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <SheetTitle className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4" />
              Detalle de envío DIAN
            </SheetTitle>
            <SheetDescription>
              {detalle?.id ?? "Cargando..."}
            </SheetDescription>
          </SheetHeader>

          {loadingDetalle ? (
            <div className="p-8 text-center text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Cargando detalle...
            </div>
          ) : detalle ? (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-neutral-500">Tipo documento</div>
                  <div className="font-medium">{detalle.tipoDocumento}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Estado</div>
                  <div>{estadoDIANBadge(detalle.estado)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Creado</div>
                  <div className="text-xs">{fmtDate(detalle.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Actualizado</div>
                  <div className="text-xs">{fmtDate(detalle.updatedAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">TrackId</div>
                  <div className="text-xs font-mono break-all">
                    {detalle.trackId ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Intentos</div>
                  <div className="text-xs">
                    {detalle.intentos} / {detalle.maxIntentos}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-neutral-500 mb-1">CUFE</div>
                <div className="text-xs font-mono break-all bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded">
                  {detalle.cufe}
                </div>
              </div>

              {detalle.mensajeError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription className="text-xs break-all">
                    {detalle.mensajeError}
                  </AlertDescription>
                </Alert>
              )}

              {detalle.proximoIntento && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  Próximo intento programado: {fmtDate(detalle.proximoIntento)}
                </div>
              )}

              {/* Respuesta DIAN */}
              {detalle.respuestaDian && (
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Respuesta DIAN</div>
                  <pre className="text-[10px] bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded max-h-48 overflow-auto break-all whitespace-pre-wrap">
                    {JSON.stringify(detalle.respuestaDian, null, 2)}
                  </pre>
                </div>
              )}

              {/* XML firmado */}
              {detalle.xmlFirmado && (
                <div>
                  <div className="text-xs text-neutral-500 mb-1">XML firmado (XAdES-EPES)</div>
                  <pre className="text-[10px] bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded max-h-96 overflow-auto break-all whitespace-pre-wrap font-mono">
                    {detalle.xmlFirmado}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-neutral-500">
              No se encontró el detalle.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
