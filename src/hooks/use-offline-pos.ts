"use client";

// ============================================================
// Marsella ERP — Hook React useOfflinePos
// ------------------------------------------------------------
// Hook que expone:
//   - isOnline: estado de conexión (navigator.onLine + listeners)
//   - pendingCount: número de facturas encoladas
//   - lastSync: última sincronización exitosa
//   - cacheProducts() / cacheClients(): descarga y cachea catálogos
//   - enqueueInvoice(inv): agrega factura a la cola
//   - syncPending(): dispara sincronización manual
//   - pendingInvoices: lista completa de facturas encoladas
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  cacheProducts as idbCacheProducts,
  cacheClients as idbCacheClients,
  getCachedProducts,
  getCachedClients,
  enqueueInvoice as idbEnqueueInvoice,
  getPendingInvoices,
  getLastSync,
  setSyncStatus,
  type PendingInvoice,
  type CachedProduct,
  type CachedClient,
} from "@/lib/indexeddb";

export interface OfflinePosState {
  isOnline: boolean;
  pendingCount: number;
  lastSync: Date | null;
  pendingInvoices: PendingInvoice[];
  cacheProducts: () => Promise<void>;
  cacheClients: () => Promise<void>;
  cachedProducts: CachedProduct[];
  cachedClients: CachedClient[];
  enqueueInvoice: (inv: {
    payload: any;
    provisionalNumber?: string;
    total?: number;
  }) => Promise<PendingInvoice>;
  syncPending: () => Promise<void>;
  refreshPending: () => Promise<void>;
}

export function useOfflinePos(): OfflinePosState {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([]);
  const [cachedClients, setCachedClients] = useState<CachedClient[]>([]);

  // ---------- Estado de conexión ----------
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsOnline(navigator.onLine);

    const onOnline = () => {
      setIsOnline(true);
      // Cuando vuelve la conexión, intenta sincronizar
      try {
        navigator.serviceWorker?.controller?.postMessage({
          type: "SYNC_INVOICES",
        });
      } catch {}
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ---------- Refresh pending ----------
  const refreshPending = useCallback(async () => {
    try {
      const list = await getPendingInvoices();
      setPendingInvoices(list);
      const last = await getLastSync();
      setLastSync(last);
      // Cargar catálogos cacheados
      const [ps, cs] = await Promise.all([getCachedProducts(), getCachedClients()]);
      setCachedProducts(ps);
      setCachedClients(cs);
    } catch (e) {
      // silencioso
    }
  }, []);

  // ---------- Carga inicial ----------
  useEffect(() => {
    refreshPending();
  }, [refreshPending, isOnline]);

  // ---------- Escucha mensajes del Service Worker ----------
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "marsella-sw") return;
      if (
        data.type === "sync:done" ||
        data.type === "sync:manual-done" ||
        data.type === "sync:invoice-success" ||
        data.type === "sync:invoice-error" ||
        data.type === "sync:interrupted"
      ) {
        refreshPending();
        if (data.type === "sync:done" && data.ok > 0) {
          const ts = new Date().toISOString();
          setSyncStatus("lastSync", ts);
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, [refreshPending]);

  // ---------- Cacheo de catálogos ----------
  const cacheProducts = useCallback(async () => {
    try {
      const r = await fetch("/api/productos?pageSize=500");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      const items = (d.items ?? []) as CachedProduct[];
      await idbCacheProducts(items);
      setCachedProducts(items);
    } catch (e) {
      // silencioso en offline
    }
  }, []);

  const cacheClients = useCallback(async () => {
    try {
      const r = await fetch("/api/terceros?pageSize=200&tipo=cliente");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      const items = (d.items ?? []) as CachedClient[];
      await idbCacheClients(items);
      setCachedClients(items);
    } catch (e) {
      // silencioso
    }
  }, []);

  // ---------- Encolar factura ----------
  const enqueueInvoice = useCallback(
    async (inv: { payload: any; provisionalNumber?: string; total?: number }) => {
      const rec = await idbEnqueueInvoice(inv);
      await refreshPending();
      // Si está online, dispara sincronización automática
      if (typeof navigator !== "undefined" && navigator.onLine && "serviceWorker" in navigator) {
        try {
          navigator.serviceWorker?.controller?.postMessage({
            type: "SYNC_INVOICES",
          });
        } catch {}
      }
      return rec;
    },
    [refreshPending]
  );

  // ---------- Sincronización manual ----------
  const syncPending = useCallback(async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      // Sin SW: no hay nada que hacer
      return;
    }
    try {
      navigator.serviceWorker?.controller?.postMessage({
        type: "SYNC_INVOICES",
      });
    } catch {}
    // Refresh optimista (el SW enviará mensaje cuando termine)
    setTimeout(() => {
      refreshPending();
    }, 800);
  }, [refreshPending]);

  const pendingCount = pendingInvoices.filter(
    (i) => i.status === "pending" || i.status === "error"
  ).length;

  return {
    isOnline,
    pendingCount,
    lastSync,
    pendingInvoices,
    cacheProducts,
    cacheClients,
    cachedProducts,
    cachedClients,
    enqueueInvoice,
    syncPending,
    refreshPending,
  };
}
