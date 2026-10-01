/* ============================================================
 * Marsella ERP — Service Worker (POS offline-first)
 * ------------------------------------------------------------
 * Estrategias:
 *  - GET /api/*            → NetworkFirst (cachea respuestas GET)
 *  - GET /_next/*, /manifest.json, iconos → CacheFirst
 *  - Navegación (HTML)     → NetworkFirst fallback a cache offline
 *  - POST/PUT/DELETE /api/facturas → si offline, encola en
 *    IndexedDB y responde 200 simulada con { offline: true }
 *
 * Background Sync:
 *  - cuando se recupera conexión, envía facturas encoladas
 *  - si una falla (ej. resolución DIAN caducada) marca error
 *    pero sigue intentando las demás
 * ============================================================ */

const SW_VERSION = "marsella-pos-v1";
const CACHE_STATIC = "marsella-static-v1";
const CACHE_API = "marsella-api-v1";
const CACHE_HTML = "marsella-html-v1";

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.svg",
  "/icon-512.svg",
];

// ============================================================
// Install: cachea recursos estáticos críticos
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      try {
        await cache.addAll(PRECACHE_URLS);
      } catch (e) {
        // Si falla uno, ignora y sigue
      }
      // Fuerza activación inmediata en siguiente navegación
      await self.skipWaiting();
    })()
  );
});

// ============================================================
// Activate: limpia caches viejos
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_API, CACHE_HTML].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ============================================================
// Helpers IndexedDB (vanilla, sin librerías externas)
// ============================================================
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("marsella-pos-offline", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbGetAll(storeName) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIDB();
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function idbPut(storeName, value) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIDB();
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function idbDelete(storeName, key) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIDB();
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function idbGet(storeName, key) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIDB();
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ============================================================
// Background Sync: envía facturas pendientes al servidor
// ============================================================
async function syncPendingInvoices() {
  let pending = await idbGetAll("pending-invoices");
  // Solo sincroniza las que están pending o error
  pending = pending.filter(
    (i) => i.status === "pending" || i.status === "error"
  );

  if (pending.length === 0) return { sent: 0, ok: 0, errors: 0 };

  let okCount = 0;
  let errorCount = 0;
  let sentCount = 0;

  for (const inv of pending) {
    sentCount++;
    try {
      await idbPut("pending-invoices", { ...inv, status: "syncing" });
      // Notifica a clientes
      await broadcastSyncEvent({
        type: "sync:invoice-start",
        localId: inv.localId,
        index: sentCount,
        total: pending.length,
      });

      const r = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inv.payload),
      });

      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (r.ok) {
        // Éxito: elimina de la cola
        await idbDelete("pending-invoices", inv.localId);
        okCount++;
        await broadcastSyncEvent({
          type: "sync:invoice-success",
          localId: inv.localId,
          serverResponse: data,
          index: sentCount,
          total: pending.length,
        });
      } else {
        // Falló (ej. resolución DIAN caducada) — marca como error pero continúa
        await idbPut("pending-invoices", {
          ...inv,
          status: "error",
          lastError: data.error || `HTTP ${r.status}`,
          lastAttempt: new Date().toISOString(),
        });
        errorCount++;
        await broadcastSyncEvent({
          type: "sync:invoice-error",
          localId: inv.localId,
          error: data.error || `HTTP ${r.status}`,
          index: sentCount,
          total: pending.length,
        });
      }
    } catch (e) {
      // Error de red (sigue offline) — vuelve a pending, interrumpe el ciclo
      await idbPut("pending-invoices", {
        ...inv,
        status: "pending",
        lastError: String(e?.message || e),
        lastAttempt: new Date().toISOString(),
      });
      await broadcastSyncEvent({
        type: "sync:interrupted",
        error: String(e?.message || e),
        index: sentCount,
        total: pending.length,
      });
      break;
    }
  }

  await broadcastSyncEvent({
    type: "sync:done",
    sent: sentCount,
    ok: okCount,
    errors: errorCount,
  });
  return { sent: sentCount, ok: okCount, errors: errorCount };
}

async function broadcastSyncEvent(payload) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) {
    try {
      c.postMessage({ source: "marsella-sw", ...payload });
    } catch {}
  }
}

// ============================================================
// Fetch handler
// ============================================================
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo maneja requests GET/HEAD y POST a /api/facturas (otros métodos no se encolan aquí)
  if (req.method === "POST" && url.pathname === "/api/facturas") {
    event.respondWith(handleInvoicePost(req));
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Para otros POST/PUT/DELETE fuera de /api/facturas: intenta directo
    return;
  }

  // Navegación (documentos HTML)
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(handleNavigation(req));
    return;
  }

  // Assets estáticos
  if (url.pathname.startsWith("/_next/") || url.pathname === "/manifest.json" || url.pathname.startsWith("/icon-")) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // API GET
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstApi(req));
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// ----- NetworkFirst para API GET (cachea respuestas exitosas) -----
async function networkFirstApi(req) {
  try {
    const r = await fetch(req);
    if (r && r.ok) {
      const cache = await caches.open(CACHE_API);
      try {
        await cache.put(req, r.clone());
      } catch {}
    }
    return r;
  } catch (e) {
    // Fallback a cache
    const cached = await caches.match(req);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-Marsella-Offline", "true");
      headers.set("X-Marsella-Cache", "api");
      const body = await cached.text();
      return new Response(body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    // Si no hay cache, devuelve 503 con flag offline
    return new Response(
      JSON.stringify({
        error: "Sin conexión y sin cache disponible",
        offline: true,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "X-Marsella-Offline": "true" },
      }
    );
  }
}

// ----- NetworkFirst para navegación (HTML) -----
async function handleNavigation(req) {
  try {
    const r = await fetch(req);
    if (r && r.ok) {
      const cache = await caches.open(CACHE_HTML);
      try {
        await cache.put(req, r.clone());
      } catch {}
    }
    return r;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Fallback a página principal cacheada
    const fallback = await caches.match("/");
    if (fallback) return fallback;
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Sin conexión</title>
       <body style="font-family:system-ui;padding:2rem;background:#0f172a;color:#fff">
       <h1>Marsella POS — Sin conexión</h1>
       <p>No hay conexión a internet y no se encuentra la página en caché.
          Vuelve a intentarlo cuando recuperes conexión.</p>
       </body>`,
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

// ----- CacheFirst para assets estáticos -----
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const r = await fetch(req);
    if (r && r.ok) {
      const cache = await caches.open(cacheName);
      try {
        await cache.put(req, r.clone());
      } catch {}
    }
    return r;
  } catch (e) {
    return cached || Response.error();
  }
}

// ----- POST /api/facturas: si offline, encola en IndexedDB -----
async function handleInvoicePost(req) {
  // Primero intenta directo (online)
  try {
    const r = await fetch(req);
    return r;
  } catch (e) {
    // Offline — encola
    try {
      const payload = await req.json();
      const localId = (crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "loc-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      const record = {
        localId,
        payload,
        status: "pending",
        createdAt: new Date().toISOString(),
        provisionalNumber: "OFFLINE-" + Date.now(),
        total: payload.items
          ? payload.items.reduce(
              (sum, it) =>
                sum +
                (Number(it.cantidad || 0) * Number(it.precioUnitario || 0)) *
                  (1 - Number(it.descuentoPorcentaje || 0) / 100) *
                  (1 + Number(it.tarifaIva || 0) / 100),
              0
            )
          : 0,
      };
      await idbPut("pending-invoices", record);

      // Intenta disparar background sync si está soportado
      if (self.registration && self.registration.sync) {
        try {
          await self.registration.sync.register("sync-invoices");
        } catch {}
      }

      // Responde 200 simulada con flag offline: true
      return new Response(
        JSON.stringify({
          offline: true,
          localId,
          numero: record.provisionalNumber,
          total: record.total,
          message:
            "Factura encolada offline. Se sincronizará al recuperar conexión.",
          cufe: "OFFLINE-PENDING-SYNC",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "No se pudo encolar la factura offline: " + String(err?.message || err),
          offline: true,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }
}

// ============================================================
// Background Sync event (Chrome/Edge)
// ============================================================
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-invoices") {
    event.waitUntil(syncPendingInvoices());
  }
});

// ============================================================
// Message handler: el cliente puede disparar sincronización manual
// ============================================================
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "SYNC_INVOICES") {
    event.waitUntil(
      (async () => {
        const r = await syncPendingInvoices();
        if (event.source && event.source.postMessage) {
          event.source.postMessage({
            source: "marsella-sw",
            type: "sync:manual-done",
            ...r,
          });
        }
      })()
    );
  }
});

// ============================================================
// Cuando vuelve la conexión (online event en SW), dispara sync
// ============================================================
self.addEventListener("online", () => {
  syncPendingInvoices().catch(() => {});
});
