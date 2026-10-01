"use client";

// ============================================================
// Marsella ERP — Sync Status Card
// ------------------------------------------------------------
// Card que se muestra cuando hay facturas pendientes de sync.
// Lista cada factura con su estado y permite forzar sync / reintentar.
// Auto-refresh cada 10s mientras haya pendientes.
// ============================================================

import { useEffect } from "react";
import {
  RefreshCw,
  CloudOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCw,
  Clock,
  Wifi,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOfflinePos } from "@/hooks/use-offline-pos";
import type { PendingInvoice } from "@/lib/indexeddb";

interface Props {
  className?: string;
  variant?: "full" | "compact";
}

function statusBadge(s: PendingInvoice["status"]) {
  switch (s) {
    case "pending":
      return (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <Clock className="size-3 mr-1" />
          Pendiente
        </Badge>
      );
    case "syncing":
      return (
        <Badge
          variant="outline"
          className="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
        >
          <Loader2 className="size-3 mr-1 animate-spin" />
          Sincronizando
        </Badge>
      );
    case "success":
      return (
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-3 mr-1" />
          Sincronizada
        </Badge>
      );
    case "error":
      return (
        <Badge
          variant="outline"
          className="border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="size-3 mr-1" />
          Error
        </Badge>
      );
    default:
      return <Badge variant="outline">{s}</Badge>;
  }
}

const fmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SyncStatusCard({ className, variant = "full" }: Props) {
  const offline = useOfflinePos();
  const { pendingInvoices, pendingCount, isOnline, syncPending, lastSync } =
    offline;

  // Auto-refresh cada 10s mientras haya pendientes
  useEffect(() => {
    if (pendingCount === 0) return;
    const id = setInterval(() => {
      offline.refreshPending();
    }, 10000);
    return () => clearInterval(id);
  }, [pendingCount, offline]);

  // Auto-trigger sync al montar si hay pendientes y estamos online
  useEffect(() => {
    if (pendingCount > 0 && isOnline) {
      const t = setTimeout(() => syncPending(), 1500);
      return () => clearTimeout(t);
    }
  }, [pendingCount, isOnline, syncPending]);

  if (pendingInvoices.length === 0) return null;

  const failed = pendingInvoices.filter((i) => i.status === "error");

  const shortId = (id: string) =>
    id.length > 12 ? id.slice(0, 8) + "…" : id;

  return (
    <Card
      className={`border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10 ${className ?? ""}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <CloudOff className="size-4 text-amber-600 dark:text-amber-400" />
              Facturas pendientes de sincronización
            </CardTitle>
            <CardDescription className="text-xs">
              {pendingCount > 0
                ? `${pendingCount} factura(s) en cola esperando conexión.`
                : `Todas las facturas sincronizadas.`}
              {lastSync && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Wifi className="size-3" />
                  Última sync: {lastSync.toLocaleString("es-CO")}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isOnline ? (
              <Button
                size="sm"
                onClick={() => syncPending()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <RefreshCw className="size-4" />
                Sincronizar ahora
              </Button>
            ) : (
              <Badge
                variant="outline"
                className="border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
              >
                Sin conexión
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      {variant === "full" && (
        <CardContent className="pt-0">
          <div className="rounded-md border border-amber-200 dark:border-amber-900 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-amber-100/60 dark:bg-amber-950/40 sticky top-0">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Local ID</th>
                    <th className="text-left font-medium px-3 py-2">Fecha</th>
                    <th className="text-left font-medium px-3 py-2">N° provisional</th>
                    <th className="text-right font-medium px-3 py-2">Total</th>
                    <th className="text-center font-medium px-3 py-2">Estado</th>
                    <th className="text-left font-medium px-3 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvoices.map((inv) => (
                    <tr
                      key={inv.localId}
                      className="border-t border-amber-100 dark:border-amber-900/60"
                    >
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {shortId(inv.localId)}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(inv.createdAt).toLocaleString("es-CO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {inv.provisionalNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {fmt.format(Number(inv.total ?? 0))}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {statusBadge(inv.status)}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">
                        {inv.lastError ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {inv.lastError}
                          </span>
                        ) : inv.serverResponse?.numero ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Factura {inv.serverResponse.numero}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {failed.length > 0 && isOnline && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncPending()}
                className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
              >
                <RotateCw className="size-4" />
                Reintentar {failed.length} fallida(s)
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
