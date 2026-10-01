"use client";

// ============================================================
// Marsella ERP — IndexedDB wrapper (vanilla TS, client-side)
// ------------------------------------------------------------
// Base de datos: "marsella-pos-offline"
// Stores:
//   - products          (keyPath: id)            catálogo cache de productos
//   - clients           (keyPath: id)            catálogo cache de clientes
//   - pending-invoices  (keyPath: localId)       facturas encoladas offline
//   - sync-status       (keyPath: key)           metadatos de última sync
//
// Reglas:
//   - NO usar librerías externas (idb, Dexie) — solo IndexedDB API nativa
//   - Las funciones devuelven Promises para integrarse con hooks React
// ============================================================

const DB_NAME = "marsella-pos-offline";
const DB_VERSION = 1;

export type InvoiceStatus = "pending" | "syncing" | "success" | "error";

export interface CachedProduct {
  id: string;
  codigo: string;
  codigoBarras?: string | null;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  tarifaIva: number;
  precio1: number;
  precio2: number;
  precio3: number;
  unidadMedida?: { codigo: string; nombre: string } | null;
  bodegas?: { id: string; bodegaId: string; cantidad: number }[];
  _cachedAt?: string;
}

export interface CachedClient {
  id: string;
  tipo: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  nombreComercial?: string | null;
  _cachedAt?: string;
}

export interface PendingInvoice {
  localId: string;
  payload: any;
  status: InvoiceStatus;
  createdAt: string;
  provisionalNumber?: string;
  total?: number;
  lastError?: string;
  lastAttempt?: string;
  serverResponse?: any;
}

// ---------- Util UUID ----------
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return (
    "loc-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

// ---------- openDB ----------
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este contexto"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("products")) {
        db.createObjectStore("products", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("clients")) {
        db.createObjectStore("clients", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pending-invoices")) {
        db.createObjectStore("pending-invoices", { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains("sync-status")) {
        db.createObjectStore("sync-status", { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

// ---------- Helpers genéricos ----------
async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbClear(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// Productos
// ============================================================

export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  await idbClear("products");
  const stamp = new Date().toISOString();
  for (const p of products) {
    await idbPut("products", { ...p, _cachedAt: stamp });
  }
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  return idbGetAll<CachedProduct>("products");
}

export async function searchProducts(q: string): Promise<CachedProduct[]> {
  const all = await getCachedProducts();
  if (!q) return all;
  const ql = q.toLowerCase().trim();
  return all.filter((p) => {
    return (
      p.nombre.toLowerCase().includes(ql) ||
      p.codigo.toLowerCase().includes(ql) ||
      (p.codigoBarras ?? "").toLowerCase().includes(ql) ||
      (p.descripcion ?? "").toLowerCase().includes(ql)
    );
  });
}

// ============================================================
// Clientes
// ============================================================

export async function cacheClients(clients: CachedClient[]): Promise<void> {
  await idbClear("clients");
  const stamp = new Date().toISOString();
  for (const c of clients) {
    await idbPut("clients", { ...c, _cachedAt: stamp });
  }
}

export async function getCachedClients(): Promise<CachedClient[]> {
  return idbGetAll<CachedClient>("clients");
}

// ============================================================
// Facturas pendientes (cola offline)
// ============================================================

export async function enqueueInvoice(invoice: {
  payload: any;
  provisionalNumber?: string;
  total?: number;
}): Promise<PendingInvoice> {
  const localId = uuid();
  const record: PendingInvoice = {
    localId,
    payload: invoice.payload,
    status: "pending",
    createdAt: new Date().toISOString(),
    provisionalNumber: invoice.provisionalNumber || `OFFLINE-${Date.now()}`,
    total: invoice.total,
  };
  await idbPut("pending-invoices", record);
  return record;
}

export async function getPendingInvoices(): Promise<PendingInvoice[]> {
  const all = await idbGetAll<PendingInvoice>("pending-invoices");
  // Ordena por createdAt asc (primero encola primero sincroniza)
  return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function updateInvoiceStatus(
  localId: string,
  status: InvoiceStatus,
  serverResponse?: any,
  lastError?: string
): Promise<void> {
  const existing = await idbGet<PendingInvoice>("pending-invoices", localId);
  if (!existing) return;
  await idbPut("pending-invoices", {
    ...existing,
    status,
    serverResponse: serverResponse ?? existing.serverResponse,
    lastError: lastError ?? existing.lastError,
    lastAttempt: new Date().toISOString(),
  });
}

export async function removeInvoice(localId: string): Promise<void> {
  await idbDelete("pending-invoices", localId);
}

export async function countPendingInvoices(): Promise<number> {
  const all = await getPendingInvoices();
  return all.filter((i) => i.status === "pending" || i.status === "error").length;
}

// ============================================================
// Sync status (metadatos)
// ============================================================

export async function setSyncStatus(key: string, value: any): Promise<void> {
  await idbPut("sync-status", { key, value, updatedAt: new Date().toISOString() });
}

export async function getSyncStatus(key: string): Promise<any> {
  const r = await idbGet<{ key: string; value: any; updatedAt: string }>(
    "sync-status",
    key
  );
  return r?.value ?? null;
}

export async function getLastSync(): Promise<Date | null> {
  const v = await getSyncStatus("lastSync");
  if (!v) return null;
  try {
    return new Date(v as string);
  } catch {
    return null;
  }
}
