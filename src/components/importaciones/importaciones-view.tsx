"use client";

// ============================================================
// ERP Marsella — Vista Importaciones Masivas Excel (Hermes §5.20)
// Tabs: Importar | Plantillas | Historial
// Importador universal para 7 entidades del ERP.
// Acento emerald/teal, dark mode, responsive mobile-first, sonner toasts.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  Eye,
  Sparkles,
  History,
  Table2,
  Loader2,
  CheckCheck,
  FileDown,
  ArrowRight,
  FileWarning,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------- Tipos compartidos ----------
type EntityKey =
  | "terceros"
  | "productos"
  | "facturas-venta"
  | "facturas-compra"
  | "usuarios-servicio"
  | "movimientos-contables"
  | "comandas";

interface EntityFieldDef {
  key: string;
  label: string;
  required: boolean;
  example?: string;
}

interface EntityDef {
  key: string;
  label: string;
  description: string;
  fields: EntityFieldDef[];
  exampleRow: Record<string, any>;
}

interface SheetPreview {
  name: string;
  columns: string[];
  rows: any[][];
  rowCount: number;
}

interface MappingCol {
  excelCol: string;
  targetField: string | null;
  confidence: number;
  suggested: boolean;
  sampleValues: any[];
}

interface PreviewError {
  row: number;
  field: string;
  error: string;
  value?: any;
}

interface PreviewResult {
  sheetName: string;
  sheetColumns: string[];
  totalRowsInSheet: number;
  previewedRows: number;
  mapping: MappingCol[];
  validRows: number;
  errors: PreviewError[];
  totalErrors: number;
  rowCount: number;
}

interface ExecuteResult {
  inserted: number;
  updated: number;
  failed: number;
  total: number;
  errors: PreviewError[];
  totalErrors: number;
  durationMs: number;
  validRowsCount?: number;
  totalValidationErrors?: number;
}

interface HistoryEntry {
  id: string;
  entity: string;
  entityLabel: string;
  fileName: string;
  totalRows: number;
  inserted: number;
  updated: number;
  failed: number;
  durationMs: number;
  date: number; // epoch ms
  user: string;
}

// ---------- Helpers ----------
function confidenceColor(conf: number) {
  if (conf >= 0.8) return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800";
  if (conf >= 0.5) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800";
  return "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800";
}
function confidenceLabel(conf: number) {
  if (conf >= 0.8) return "Alta";
  if (conf >= 0.5) return "Media";
  if (conf > 0) return "Baja";
  return "—";
}
function formatDate(d: number | Date) {
  const x = new Date(d);
  return x.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// ============================================================
// Componente principal
// ============================================================
export function ImportacionesView() {
  return (
    <div className="space-y-4">
      <Card className="border-emerald-200/60 dark:border-emerald-900/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <FileSpreadsheet className="w-5 h-5" />
                Importaciones Masivas desde Excel
              </CardTitle>
              <CardDescription className="mt-1">
                Carga masiva para cualquier entidad del ERP. Mapeo automático de columnas,
                validación previa y manejo de duplicados (upsert).
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
              Hermes §5.20
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="importar" className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-md">
          <TabsTrigger value="importar">
            <Upload className="w-4 h-4 mr-1.5" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="plantillas">
            <FileDown className="w-4 h-4 mr-1.5" />
            Plantillas
          </TabsTrigger>
          <TabsTrigger value="historial">
            <History className="w-4 h-4 mr-1.5" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar">
          <TabImportar />
        </TabsContent>
        <TabsContent value="plantillas">
          <TabPlantillas />
        </TabsContent>
        <TabsContent value="historial">
          <TabHistorial />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// TAB: IMPORTAR
// ============================================================
function TabImportar() {
  const [entities, setEntities] = useState<EntityDef[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<EntityKey>("terceros");
  const [file, setFile] = useState<File | null>(null);
  const [fileBufferB64, setFileBufferB64] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [mapping, setMapping] = useState<MappingCol[] | null>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<PreviewResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const raw = sessionStorage.getItem("importHistory");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Cargar entidades soportadas
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/import/entities");
        const d = await r.json();
        if (mounted) setEntities(d.entities ?? []);
      } catch {
        toast.error("No se pudieron cargar las entidades");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Reset al cambiar de entidad
  useEffect(() => {
    resetAll();
  }, [selectedEntity]);

  function resetAll() {
    setFile(null);
    setFileBufferB64(null);
    setSheets(null);
    setActiveSheet("");
    setMapping(null);
    setValidation(null);
    setResult(null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(f: File) {
    setFile(f);
    setFileName(f.name);
    setSheets(null);
    setMapping(null);
    setValidation(null);
    setResult(null);
    // leer a base64 (fileReader para soportar archivos grandes en chunks)
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arr = new Uint8Array(reader.result as ArrayBuffer);
          // convertir a base64 en chunks para no romper call stack con archivos grandes
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < arr.length; i += chunk) {
            binary += String.fromCharCode.apply(
              null,
              Array.from(arr.subarray(i, i + chunk)),
            );
          }
          resolve(btoa(binary));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(f);
    });
    setFileBufferB64(b64);
  }

  async function handleAnalyze() {
    if (!file) {
      toast.error("Seleccione un archivo primero");
      return;
    }
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/import/parse", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al analizar archivo");
        return;
      }
      const sheetsData: SheetPreview[] = (d.sheets ?? []).map((s: any) => ({
        name: s.name,
        columns: s.columns,
        rows: s.rows,
        rowCount: s.rowCount ?? s.rows.length,
      }));
      setSheets(sheetsData);
      if (sheetsData.length > 0) {
        setActiveSheet(sheetsData[0].name);
        // autodetectar mapping usando el preview endpoint
        await runPreview(sheetsData[0].name);
      }
      toast.success(
        `Archivo analizado: ${sheetsData.reduce((a, s) => a + s.rowCount, 0)} filas en ${sheetsData.length} hoja(s)`,
      );
    } catch (e: any) {
      toast.error("Error al analizar el archivo: " + (e?.message ?? ""));
    } finally {
      setParsing(false);
    }
  }

  async function runPreview(sheetName?: string) {
    if (!fileBufferB64 || !selectedEntity) return;
    setValidating(true);
    try {
      // Si tenemos mapping del usuario, lo enviamos; si no, autodetecta
      const mappingDict: Record<string, string | null> | undefined = mapping
        ? Object.fromEntries(mapping.map((m) => [m.excelCol, m.targetField]))
        : undefined;
      const r = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEntity: selectedEntity,
          fileBuffer: fileBufferB64,
          sheetName: sheetName || activeSheet || undefined,
          mapping: mappingDict && Object.keys(mappingDict).length > 0 ? mappingDict : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al validar");
        return;
      }
      setValidation(d as PreviewResult);
      // Mapping retornado (puede venir del server con sampleValues)
      if (d.mapping) {
        setMapping(d.mapping as MappingCol[]);
      }
    } catch (e: any) {
      toast.error("Error al validar: " + (e?.message ?? ""));
    } finally {
      setValidating(false);
    }
  }

  function changeMappingField(excelCol: string, newTarget: string) {
    setMapping((prev) => {
      if (!prev) return prev;
      const next = prev.map((m) =>
        m.excelCol === excelCol
          ? { ...m, targetField: newTarget === "__none__" ? null : newTarget, confidence: 1, suggested: false }
          : m,
      );
      return next;
    });
    // Revalidar
    setTimeout(() => runPreview(activeSheet || undefined), 50);
  }

  async function handleExecute() {
    if (!fileBufferB64 || !selectedEntity || !mapping) {
      toast.error("Falta información para importar");
      return;
    }
    const mappingDict = Object.fromEntries(
      mapping.map((m) => [m.excelCol, m.targetField]),
    );
    setExecuting(true);
    try {
      const r = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEntity: selectedEntity,
          fileBuffer: fileBufferB64,
          mapping: mappingDict,
          sheetName: activeSheet || undefined,
          fileName,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || "Error al importar");
        return;
      }
      setResult(d as ExecuteResult);
      const entityLabel =
        entities.find((e) => e.key === selectedEntity)?.label ?? selectedEntity;
      toast.success(
        `Importación completa: ${d.inserted} insertados, ${d.updated} actualizados, ${d.failed} fallidos`,
      );
      // Agregar al historial
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        entity: selectedEntity,
        entityLabel,
        fileName: fileName || "archivo.xlsx",
        totalRows: d.total ?? 0,
        inserted: d.inserted ?? 0,
        updated: d.updated ?? 0,
        failed: d.failed ?? 0,
        durationMs: d.durationMs ?? 0,
        date: Date.now(),
        user: "Yo",
      };
      const newHistory = [entry, ...history].slice(0, 50);
      setHistory(newHistory);
      try {
        sessionStorage.setItem("importHistory", JSON.stringify(newHistory));
      } catch {}
    } catch (e: any) {
      toast.error("Error al importar: " + (e?.message ?? ""));
    } finally {
      setExecuting(false);
    }
  }

  function downloadErrorsCSV() {
    if (!validation?.errors || validation.errors.length === 0) return;
    const cols = validation.sheetColumns ?? [];
    const headers = ["Fila", "Campo", "Error", ...cols];
    const lines = [headers.map(escapeCSV).join(",")];
    for (const e of validation.errors) {
      const cells = [String(e.row), e.field, e.error, ...cols.map(() => "")];
      lines.push(cells.map(escapeCSV).join(","));
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `errores-${selectedEntity}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Errores descargados como CSV");
  }

  function downloadLog() {
    if (!result) return;
    const entityLabel =
      entities.find((e) => e.key === selectedEntity)?.label ?? selectedEntity;
    const lines: string[] = [];
    lines.push("================================================");
    lines.push(`  IMPORTACIÓN ${entityLabel.toUpperCase()}`);
    lines.push(`  Archivo: ${fileName}`);
    lines.push(`  Fecha:   ${new Date().toISOString()}`);
    lines.push("================================================");
    lines.push("");
    lines.push(`Total filas procesadas: ${result.total}`);
    lines.push(`Insertados:             ${result.inserted}`);
    lines.push(`Actualizados:           ${result.updated}`);
    lines.push(`Fallidos:               ${result.failed}`);
    lines.push(`Duración:               ${fmtMs(result.durationMs)}`);
    lines.push("");
    if (result.errors && result.errors.length > 0) {
      lines.push("--- ERRORES DETALLADOS ---");
      for (const e of result.errors) {
        lines.push(
          `  Fila ${e.row} | Campo '${e.field}' | ${e.error}${
            e.value !== undefined && e.value !== null && e.value !== ""
              ? ` | Valor: ${JSON.stringify(e.value)}`
              : ""
          }`,
        );
      }
    } else {
      lines.push("Sin errores.");
    }
    lines.push("");
    lines.push("================================================");
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-${selectedEntity}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Log descargado");
  }

  const selectedEntityDef = entities.find((e) => e.key === selectedEntity);

  return (
    <div className="space-y-4">
      {/* Paso 1: Selección de entidad y archivo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">1</span>
            Entidad destino y archivo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-neutral-500">Entidad a importar</Label>
              <Select value={selectedEntity} onValueChange={(v) => setSelectedEntity(v as EntityKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar entidad" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.key} value={e.key}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEntityDef && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 pt-1">
                  {selectedEntityDef.description}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-neutral-500">Plantilla recomendada</Label>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() =>
                  window.open(`/api/import/template/${selectedEntity}`, "_blank")
                }
              >
                <FileDown className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400" />
                Descargar plantilla .xlsx para {selectedEntityDef?.label ?? selectedEntity}
              </Button>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              dragOver
                ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30"
                : "border-neutral-200 dark:border-neutral-700 hover:border-emerald-300 dark:hover:border-emerald-700",
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="w-10 h-10 text-emerald-500" />
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-neutral-500">
                  {(file.size / 1024).toFixed(1)} KB · Click para cambiar
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-neutral-500">
                <Upload className="w-10 h-10" />
                <div className="font-medium">
                  Arrastre un archivo .xlsx o click para seleccionar
                </div>
                <div className="text-xs">Soporta múltiples hojas</div>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleAnalyze}
              disabled={!file || parsing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {parsing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              {parsing ? "Analizando..." : "Analizar archivo"}
            </Button>
            <Button variant="ghost" onClick={resetAll} disabled={!file}>
              <Trash2 className="w-4 h-4 mr-2" />
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Paso 2: Preview y mapeo */}
      {sheets && sheets.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">2</span>
                Mapeo de columnas
              </CardTitle>
              {sheets.length > 1 && (
                <Select value={activeSheet} onValueChange={async (v) => {
                  setActiveSheet(v);
                  await runPreview(v);
                }}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name} ({s.rowCount} filas)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <CardDescription>
              Detectado automáticamente. Edite el campo destino si es necesario.
              Verde: alta confianza · Amber: media · Rojo: baja.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mapping && (
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
                    <TableRow>
                      <TableHead className="w-1/3">Columna Excel</TableHead>
                      <TableHead className="w-1/3">Campo destino</TableHead>
                      <TableHead className="w-20 text-center">Confianza</TableHead>
                      <TableHead>Valores de muestra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mapping.map((m) => (
                      <TableRow key={m.excelCol}>
                        <TableCell className="font-medium">{m.excelCol}</TableCell>
                        <TableCell>
                          <Select
                            value={m.targetField ?? "__none__"}
                            onValueChange={(v) => changeMappingField(m.excelCol, v)}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— No importar —</SelectItem>
                              {selectedEntityDef?.fields.map((f) => (
                                <SelectItem key={f.key} value={f.key}>
                                  {f.label}
                                  {f.required ? " *" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border",
                                    confidenceColor(m.confidence),
                                  )}
                                >
                                  {m.confidence > 0
                                    ? `${Math.round(m.confidence * 100)}%`
                                    : "—"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {confidenceLabel(m.confidence)} confianza
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md truncate">
                          {(m.sampleValues ?? []).slice(0, 3).join(" · ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => runPreview(activeSheet)} disabled={validating}>
                {validating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4 mr-2" />
                )}
                {validating ? "Validando..." : "Validar filas"}
              </Button>
            </div>

            {/* Preview de primeras filas */}
            {sheets.find((s) => s.name === activeSheet) && (
              <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-x-auto max-h-80 overflow-y-auto">
                <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  Primeras {Math.min(5, sheets.find((s) => s.name === activeSheet)!.rows.length)} filas detectadas
                </div>
                <Table>
                  <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {sheets.find((s) => s.name === activeSheet)!.columns.map((c) => (
                        <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheets.find((s) => s.name === activeSheet)!.rows.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-neutral-400">{i + 2}</TableCell>
                        {sheets.find((s) => s.name === activeSheet)!.columns.map((_, j) => (
                          <TableCell key={j} className="text-xs whitespace-nowrap max-w-xs truncate">
                            {row[j] === null || row[j] === undefined
                              ? ""
                              : row[j] instanceof Date
                                ? row[j].toLocaleDateString("es-CO")
                                : String(row[j]).slice(0, 80)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Paso 3: Resultado de validación */}
      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">3</span>
              Resultado de validación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Filas revisadas"
                value={validation.rowCount}
                icon={<Table2 className="w-4 h-4" />}
                tone="neutral"
              />
              <StatCard
                label="Válidas"
                value={validation.validRows}
                icon={<CheckCircle2 className="w-4 h-4" />}
                tone="emerald"
              />
              <StatCard
                label="Con errores"
                value={validation.totalErrors}
                icon={<XCircle className="w-4 h-4" />}
                tone="rose"
              />
              <StatCard
                label="Total en hoja"
                value={validation.totalRowsInSheet}
                icon={<FileSpreadsheet className="w-4 h-4" />}
                tone="teal"
              />
            </div>

            {validation.errors && validation.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    {validation.totalErrors} error(es) — mostrando primeros {Math.min(50, validation.errors.length)}
                  </Label>
                  <Button size="sm" variant="outline" onClick={downloadErrorsCSV}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Descargar errores CSV
                  </Button>
                </div>
                <div className="rounded-md border border-amber-200 dark:border-amber-900/40 overflow-x-auto max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-amber-50 dark:bg-amber-950/30 z-10">
                      <TableRow>
                        <TableHead className="w-16">Fila</TableHead>
                        <TableHead className="w-40">Campo</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.errors.slice(0, 50).map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{e.row}</TableCell>
                          <TableCell className="font-mono text-xs">{e.field}</TableCell>
                          <TableCell className="text-xs">{e.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button
                onClick={handleExecute}
                disabled={
                  executing ||
                  validation.validRows === 0 ||
                  !mapping
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {executing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {executing
                  ? "Importando..."
                  : `Importar ${validation.validRows} fila(s) válidas`}
                {!executing && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
              {validation.validRows === 0 && (
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  No hay filas válidas para importar
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 4: Resultado de importación */}
      {result && (
        <Card className="border-emerald-200 dark:border-emerald-900/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">4</span>
              <CheckCircle2 className="w-5 h-5" />
              Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Insertados" value={result.inserted} icon={<CheckCircle2 className="w-4 h-4" />} tone="emerald" />
              <StatCard label="Actualizados" value={result.updated} icon={<RefreshCw className="w-4 h-4" />} tone="teal" />
              <StatCard label="Fallidos" value={result.failed} icon={<XCircle className="w-4 h-4" />} tone="rose" />
              <StatCard label="Total" value={result.total} icon={<Table2 className="w-4 h-4" />} tone="neutral" />
              <StatCard label="Duración" value={fmtMs(result.durationMs)} icon={<History className="w-4 h-4" />} tone="neutral" text />
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button variant="outline" onClick={downloadLog}>
                <FileDown className="w-4 h-4 mr-2" />
                Descargar log detallado
              </Button>
              {result.errors && result.errors.length > 0 && (
                <Button variant="outline" onClick={downloadErrorsCSV}>
                  <FileWarning className="w-4 h-4 mr-2" />
                  Descargar errores CSV
                </Button>
              )}
              <Button variant="ghost" onClick={resetAll}>
                <Upload className="w-4 h-4 mr-2" />
                Nueva importación
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// TAB: PLANTILLAS
// ============================================================
function TabPlantillas() {
  const [entities, setEntities] = useState<EntityDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/import/entities");
        const d = await r.json();
        setEntities(d.entities ?? []);
      } catch {
        toast.error("Error al cargar entidades");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function downloadTemplate(key: string) {
    setDownloading(key);
    try {
      const r = await fetch(`/api/import/template/${key}`);
      if (!r.ok) {
        toast.error("Error al descargar plantilla");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plantilla-${key}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Plantilla descargada");
    } catch {
      toast.error("Error al descargar plantilla");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {entities.map((e) => (
        <Card key={e.key} className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">{e.label}</CardTitle>
              <Badge variant="outline" className="text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
                {e.fields.filter((f) => f.required).length} req.
              </Badge>
            </div>
            <CardDescription className="text-xs">{e.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            <div className="flex flex-wrap gap-1">
              {e.fields.map((f) => (
                <span
                  key={f.key}
                  className={cn(
                    "inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-mono border",
                    f.required
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400",
                  )}
                  title={f.label + (f.required ? " (requerido)" : "")}
                >
                  {f.key}
                  {f.required ? "*" : ""}
                </span>
              ))}
            </div>
            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-2">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
                Fila de ejemplo
              </div>
              <pre className="text-[10px] font-mono overflow-x-auto max-h-28">
                {JSON.stringify(e.exampleRow, null, 2)}
              </pre>
            </div>
            <Button
              onClick={() => downloadTemplate(e.key)}
              disabled={downloading === e.key}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
            >
              {downloading === e.key ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-2" />
              )}
              Descargar plantilla .xlsx
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// TAB: HISTORIAL
// ============================================================
function TabHistorial() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const raw = sessionStorage.getItem("importHistory");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("");

  const filtered = history.filter((h) => {
    if (filterEntity !== "all" && h.entity !== filterEntity) return false;
    if (filterDate) {
      const d = new Date(h.date);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (ds !== filterDate) return false;
    }
    return true;
  });

  function clearHistory() {
    setHistory([]);
    sessionStorage.removeItem("importHistory");
    toast.success("Historial borrado");
  }

  const entitiesInHistory = Array.from(new Set(history.map((h) => h.entity)));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Historial de importaciones</CardTitle>
            <CardDescription className="text-xs mt-1">
              Importaciones de la sesión actual. Persistente solo en este navegador
              (no afecta la base de datos).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterEntity} onValueChange={setFilterEntity}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="Todas las entidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las entidades</SelectItem>
                {entitiesInHistory.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-44 h-8"
            />
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-400">
            No hay importaciones registradas en esta sesión.
          </div>
        ) : (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-x-auto max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900 z-10">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Insertados</TableHead>
                  <TableHead className="text-right">Actualizados</TableHead>
                  <TableHead className="text-right">Fallidos</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(h.date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {h.entityLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {h.fileName}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">{h.totalRows}</TableCell>
                    <TableCell className="text-right text-xs font-mono text-emerald-600 dark:text-emerald-400">
                      {h.inserted}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-teal-600 dark:text-teal-400">
                      {h.updated}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-rose-600 dark:text-rose-400">
                      {h.failed}
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmtMs(h.durationMs)}</TableCell>
                    <TableCell className="text-xs">{h.user}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Sub-componentes
// ============================================================
function StatCard({
  label,
  value,
  icon,
  tone,
  text = false,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: "emerald" | "teal" | "rose" | "neutral";
  text?: boolean;
}) {
  const toneClass = {
    emerald: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/40",
    teal: "text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900/40",
    rose: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/40",
    neutral: "text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/40 border-neutral-200 dark:border-neutral-800",
  }[tone];
  return (
    <div className={cn("rounded-md border p-3", toneClass)}>
      <div className="flex items-center gap-1.5 text-xs opacity-80">
        {icon}
        {label}
      </div>
      <div className={cn("font-mono font-bold mt-1", text ? "text-sm" : "text-xl")}>
        {value}
      </div>
    </div>
  );
}

function escapeCSV(v: string): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
