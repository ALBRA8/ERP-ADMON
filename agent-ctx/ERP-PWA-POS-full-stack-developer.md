---
Task ID: ERP-PWA-POS
Agent: full-stack-developer
Task: Implementar PWA (Progressive Web App) offline-first para cajas POS en el ERP Marsella

Work Log:
1. Inicialicé el entorno fullstack con `init-fullstack_1775040338514.sh`. Dev server ya corriendo en puerto 3000.
2. Leí el worklog previo y revisé `prisma/schema.prisma`, `src/lib/auth.ts` (getSession), `src/app/api/facturas/route.ts` (POST crea factura con resolución DIAN + CUFE + asiento contable), `src/components/facturacion/facturacion-view.tsx` (1671 líneas — NO reescribir, solo editar secciones), `src/components/layout/{sidebar,topbar}.tsx`, `src/app/layout.tsx`, `src/app/page.tsx`, y `src/lib/dian.ts` para entender el algoritmo CUFE (SHA256 con concatenación de numFac + fecFac + horFac + valTotal + codDoc + nitFac + tipAdq + nitPAC + clTec + soporte + ambiente).

3. **Creé `/public/manifest.json`** con los metadatos PWA requeridos: name "Marsella ERP — POS", short_name "Marsella POS", start_url `/?view=facturas&mode=pos`, display standalone, orientation portrait, background_color #0f172a, theme_color #10b981, icons para 192x192 (any) y 512x512 (maskable) referenciando `/icon-192.png` y `/icon-512.png` (rutas PNG virtuales — los navegadores solo las buscan al instalar), categorías business/finance/productivity.

4. **Creé SVGs placeholder** en `/public/icon-192.svg` y `/public/icon-512.svg` (rectángulo verde esmeralda con letra "M" blanca) — Next.js no soporta SVG para manifest icons, pero son útiles como `<link rel="icon">` y `<link rel="apple-touch-icon">` en el layout.

5. **Creé `/public/sw.js` (service worker vanilla JS, NO TypeScript)** con:
   - **Install**: cachea recursos estáticos críticos (`PRECACHE_URLS`: `/`, `/manifest.json`, iconos) en cache `marsella-static-v1` + `skipWaiting()`.
   - **Activate**: limpia caches viejas (todas menos static/api/html) + `clients.claim()`.
   - **Fetch handler** con 4 estrategias:
     - **Navegación HTML** → NetworkFirst con fallback a cache HTML (y fallback final a `/` cacheado o página offline).
     - **Assets estáticos** (`/_next/*`, `/manifest.json`, `/icon-*`) → CacheFirst.
     - **GET /api/*`** → NetworkFirst con cacheo de respuestas exitosas; fallback a cache con header `X-Marsella-Offline: true` o 503 con flag `offline: true`.
     - **POST `/api/facturas`** → intenta directo primero (online); si falla offline, parsea el payload, genera `localId` (UUID), crea record `{localId, payload, status:'pending', createdAt, provisionalNumber:'OFFLINE-<timestamp>', total}` y lo encola en IndexedDB store `pending-invoices`; registra `sync` tag para background sync; responde 200 simulada con `{offline:true, localId, numero, total, message, cufe:'OFFLINE-PENDING-SYNC'}`.
   - **Background Sync** (Chrome/Edge): handler `sync` con tag `sync-invoices` dispara `syncPendingInvoices()`.
   - **syncPendingInvoices()**: recorre invoices con status `pending|error`, marca como `syncing`, hace POST al server, si 200 → elimina de la cola; si 4xx (ej. resolución DIAN caducada) → marca `error` con `lastError` y `lastAttempt` y CONTINÚA con la siguiente; si error de red → vuelve a `pending` y rompe el ciclo. Notifica cada evento vía `clients.matchAll().postMessage()` con tipos `sync:invoice-start|success|error`, `sync:interrupted`, `sync:done` (con `sent`, `ok`, `errors`).
   - **Message handler**: cliente puede disparar sync manual con `postMessage({type:'SYNC_INVOICES'})`. SKIP_WAITING para actualizaciones.
   - **Online event**: dispara sync cuando el SW detecta que vuelve la conexión.
   - Helpers IndexedDB vanilla dentro del SW: `openIDB()`, `idbGetAll()`, `idbPut()`, `idbDelete()`, `idbGet()` con promises wrappers sobre `indexedDB.open("marsella-pos-offline", 1)`.

6. **Creé `/src/lib/indexeddb.ts`** (vanilla TS client-side, sin librerías externas como idb/Dexie). BD `marsella-pos-offline` v1 con 4 stores: `products` (keyPath `id`), `clients` (keyPath `id`), `pending-invoices` (keyPath `localId`), `sync-status` (keyPath `key`). Funciones exportadas: `openDB()`, `cacheProducts(products[])` (limpia + inserta con `_cachedAt`), `getCachedProducts()`, `searchProducts(q)` (filtra por nombre/código/códigoBarras/descripción), `cacheClients(clients[])`, `getCachedClients()`, `enqueueInvoice({payload, provisionalNumber?, total?})` (genera UUID, status `pending`, createdAt, devuelve record), `getPendingInvoices()` (sort by createdAt asc), `updateInvoiceStatus(localId, status, serverResponse?, lastError?)`, `removeInvoice(localId)`, `countPendingInvoices()`, `setSyncStatus(key, value)`, `getSyncStatus(key)`, `getLastSync()`. Tipos exportados: `InvoiceStatus`, `CachedProduct`, `CachedClient`, `PendingInvoice`.

7. **Creé `/src/hooks/use-offline-pos.ts`** (hook React). Estado: `isOnline` (navigator.onLine + listeners online/offline), `pendingInvoices`, `lastSync`, `cachedProducts`, `cachedClients`. Métodos: `cacheProducts()` (descarga y cachea), `cacheClients()`, `enqueueInvoice(inv)` (encola + refresh + postMessage SYNC_INVOICES si online), `syncPending()` (postMessage SYNC_INVOICES + refresh optimista), `refreshPending()` (recarga lista + catálogos cacheados + lastSync). Efectos: subscripción a `online`/`offline` events, listener de mensajes del SW (`sync:done|manual-done|invoice-success|invoice-error|interrupted`), actualiza `lastSync` en IDB cuando hay sync exitosa. Devuelve `pendingCount` filtrando solo pending|error.

8. **Creé `/src/components/pwa/register-sw.tsx`** (client component invisible): registra `/sw.js` con scope `/` en `useEffect` solo si `serviceWorker` in navigator y protocolo http/https. Log informativo en dev.

9. **Creé `/src/components/pwa/install-button.tsx`** (client component): escucha `beforeinstallprompt` event, previene default, guarda el `deferredPrompt` en estado. Detecta si ya está instalada (standalone media query o `navigator.standalone`) con lazy initializer `useState(getStandaloneState)` para evitar el anti-patrón `set-state-in-effect`. Muestra botón "Instalar POS" (icon Download, color emerald) solo si deferred != null y no installed. Al click → `deferred.prompt()` + `deferred.userChoice` → si accepted setea installed.

10. **Creé `/src/components/pwa/sync-status-card.tsx`** (client component): Card amber que se muestra solo cuando hay pendingInvoices > 0. Lista cada factura en tabla con: localId (corto, font-mono), fecha (format es-CO short), n° provisional, total (COP), status badge (pending amber Clock | syncing sky Loader2 spin | success emerald CheckCircle2 | error rose AlertCircle), detalle (lastError rose o serverResponse.numero emerald o —). Header con badge "Sin conexión" rose si !isOnline. Botón "Sincronizar ahora" (RefreshCw, emerald). Botón "Reintentar N fallida(s)" (RotateCw, rose) si hay errors > 0 e isOnline. Auto-refresh cada 10s con setInterval mientras haya pendientes. Auto-trigger sync 1.5s después de montar si pendingCount > 0 e isOnline.

11. **Modifiqué `/src/app/layout.tsx`**: añadí imports `Viewport` y `RegisterSW`. metadata con `manifest: "/manifest.json"` y `appleWebApp: { capable: true, statusBarStyle: "default", title: "Marsella POS" }`. viewport export con `themeColor: "#10b981"`. En `<head>`: `<link rel="manifest" href="/manifest.json" />`, `<meta name="theme-color" content="#10b981" />`, `<meta name="apple-mobile-web-app-capable" content="yes" />`, `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`, `<meta name="apple-mobile-web-app-title" content="Marsella POS" />`, `<link rel="icon" type="image/svg+xml" href="/icon-192.svg" />`, `<link rel="apple-touch-icon" href="/icon-192.svg" />`. `<RegisterSW />` montado dentro del ThemeProvider para que se registre en cliente.

12. **Modifiqué `/src/components/layout/topbar.tsx`**: añadí import `InstallButton` y `useOfflinePos`. En la parte izquierda (al lado del nombre de empresa), badge "N pendiente(s)" amber si pendingCount > 0 (md+). En la parte derecha, badge "🟢 Online" / "🔴 Offline" (emerald si online, rose si offline) en md+. Botón `<InstallButton />` entre el badge de estado y el badge de rol. Layout responsive (badge hidden en mobile).

13. **Modifiqué `/src/components/layout/sidebar.tsx`**: añadí imports `Badge` de ui y `useOfflinePos`. En el map de items del nav, calculé `showPendingBadge = item.key === "facturas" && pendingCount > 0`. Si !collapsed: badge amber con número pendiente al lado derecho del item "Facturación" (text-[10px], h-5, min-w-[20px]). Si collapsed: dot amber absoluto top-right del botón (añadí `relative` al className cuando collapsed). `pendingCount` del hook se actualiza cuando el SW sincroniza (el hook está suscrito a los mensajes).

14. **Modifiqué `/src/components/facturacion/facturacion-view.tsx`** (ediciones quirúrgicas, NO reescritura completa):
   - **Imports**: añadí `WifiOff, Wifi, CloudOff` de lucide-react; `useOfflinePos` hook; `SyncStatusCard` component.
   - **`mockCufe()` helper** (líneas 263-300): SHA-256 con `crypto.subtle.digest` del browser, misma concatenación que el backend (numFac + fecFac + horFac + valTotal + "01" + nitCliente + "1" + "" + "" + "" + "0"). Fallback string simple si SubtleCrypto no disponible.
   - **`FacturacionView`** (componente principal): usa `useOfflinePos()`. Efectos: (a) cuando transiciona offline→online y hay pendientes → toast info "Sincronizando N facturas pendientes..."; (b) cuando pendingCount baja a 0 y está online → toast success "Facturas sincronizadas correctamente". Render: `<SyncStatusCard />` arriba + tabs existentes. Título con badge "🟢 Online" (Wifi, emerald) o "🔴 Offline — modo POS local" (WifiOff, rose). Badge "N pendiente(s)" (CloudOff, amber) si pendingCount > 0.
   - **`NuevaFactura`**: 
     - Usa `useOfflinePos()`, desestructura `isOnline, cachedProducts, cachedClients`.
     - `exito` state extendido con `offline?: boolean` y `localId?: string`.
     - `cargarClientes()`: si offline, usa `cachedClients` directamente. Si online, fetch + cachea en IDB con `offline.cacheClients()`. Si falla y hay cache, usa cache; si no, toast error.
     - `cargarProductos()`: igual patrón con `cachedProducts` y `offline.cacheProducts()`.
     - `cargarBodegas()`: si offline, deriva bodegas de los `cachedProducts[].bodegas` (mapa por bodegaId con código/nombre mock).
     - `handleSubmit()` extendido:
       - Si offline y hay nuevo cliente (no seleccionado), usa el nombre/NIT como provisional sin crear (no se puede POST offline).
       - **Modo OFFLINE** (`!isOnline`): genera `OFFLINE-<timestamp>`, calcula CUFE mock con `mockCufe()`, llama `offline.enqueueInvoice({payload, provisionalNumber, total})`, setea `exito` con `offline:true, localId`, toast "Factura encolada offline" con número pendientes, resetea form, NO cambia de tab (cajero hace varias facturas seguidas).
       - **Modo ONLINE**: POST normal. Si respuesta tiene `offline:true` (SW encoló porque cayó la red durante el POST), modal offline. Si no, modal éxito normal.
       - **Catch TypeError (Failed to fetch)**: fallback a enqueue directo (caso edge: SW aún no activo o no soportado). Misma lógica que modo offline.
       - Deps añadidas: `isOnline, offline, totales.total`.
     - **Modal de éxito** extendido: si `exito.offline`, icon `CloudOff` amber + título "Factura encolada offline" + descripción "se sincronizará con la DIAN cuando se recupere la conexión" + caja amber explicativa con ID local corto. Botón principal "Nueva factura" (NO llama onDone para seguir en tab nueva). Botón "Imprimir" con toast diferenciado offline/online. CUFE marcado "(provisional)" en modo offline.

15. **`bun run lint` EXIT 1 con 2 errores preexistentes en `src/lib/niif.ts`** (interfaces vacías `@typescript-eslint/no-empty-object-type` en líneas 103 y 130) — NO relacionados con mi trabajo. Verificado con `git stash && bun run lint` que los mismos 2 errores aparecen sin mis cambios. Mis archivos nuevos (manifest.json, sw.js, indexeddb.ts, use-offline-pos.ts, register-sw.tsx, install-button.tsx, sync-status-card.tsx) y modificaciones (layout.tsx, topbar.tsx, sidebar.tsx, facturacion-view.tsx) pasan lint sin errores ni warnings.

16. **Dev server log**: `✓ Compiled` exitoso en cada prueba. Sin errores de runtime. Verificado con curl:
    - `GET /` HTTP 200 (33KB, LoginView render)
    - `GET /manifest.json` HTTP 200 (JSON válido)
    - `GET /sw.js` HTTP 200 (servido como JS)
    - `GET /icon-192.svg` HTTP 200
    - `POST /api/auth/demo` HTTP 200 (sesión demo creada con cookie)
    - `GET /api/dashboard` HTTP 200 con `authenticated:true`
    - `GET /api/productos?pageSize=5` HTTP 200 (10 productos, schema correcto con bodegas y saldosInventario)
    - `GET /api/terceros?tipo=cliente` HTTP 200 (5 clientes)
    - `POST /api/facturas` HTTP 400 con `{"error":"No hay resolución DIAN activa para facturación POS"}` (comportamiento esperado del backend — la empresa demo no tiene resolución DIAN POS configurada; en el frontend esto se muestra como toast error en el modo online, y en modo offline la factura se encola y el error se propaga solo cuando el SW intenta sincronizar).

Stage Summary:
- **Manifest PWA**: `/public/manifest.json` con metadatos completos (name, short_name, icons 192/512, start_url POS, theme_color emerald, standalone portrait, categorías business/finance/productivity). SVGs placeholder en `/public/icon-{192,512}.svg`.
- **Service Worker** `/public/sw.js` (vanilla JS, no TS): 4 estrategias (NetworkFirst API, CacheFirst static, NetworkFirst HTML, POST encolable offline), Background Sync, message handler, online event, IndexedDB vanilla interno.
- **IndexedDB wrapper** `/src/lib/indexeddb.ts` (vanilla TS, sin idb/Dexie): 4 stores (products, clients, pending-invoices, sync-status), funciones CRUD, `enqueueInvoice`, `getLastSync`, tipos `PendingInvoice`/`CachedProduct`/`CachedClient`/`InvoiceStatus`.
- **Hook React** `/src/hooks/use-offline-pos.ts`: estado `isOnline` (listeners), `pendingInvoices`, `pendingCount`, `lastSync`, `cachedProducts`/`cachedClients`, métodos `cacheProducts`/`cacheClients`/`enqueueInvoice`/`syncPending`/`refreshPending`, suscripción a mensajes del SW.
- **3 componentes PWA** en `/src/components/pwa/`:
  - `register-sw.tsx`: registra `/sw.js` en cliente.
  - `install-button.tsx`: escucha `beforeinstallprompt`, lazy init standalone, botón "Instalar POS" en topbar.
  - `sync-status-card.tsx`: card amber con tabla de pendientes (localId, fecha, n°, total, status badge, detalle), botones "Sincronizar ahora" + "Reintentar fallidas", auto-refresh 10s, auto-trigger sync 1.5s si online.
- **Layout** (`src/app/layout.tsx`): manifest link, theme-color emerald, apple-mobile-web-app metas, icon svg, `<RegisterSW />` montado.
- **Topbar** (`src/components/layout/topbar.tsx`): badge Online/Offline, badge pendientes, botón Install.
- **Sidebar** (`src/components/layout/sidebar.tsx`): badge con contador pendientes al lado de "Facturación" (dot amber si collapsed).
- **Facturación** (`src/components/facturacion/facturacion-view.tsx`): badge Online/Offline + N pendientes en título, `<SyncStatusCard />` arriba de tabs, carga catálogos con fallback a cache IDB cuando offline, `handleSubmit` con dos paths:
  - **Offline** → `mockCufe()` (SHA-256 con SubtleCrypto, mismo algoritmo que el backend) + `enqueueInvoice` + modal offline + reset + NO cambia de tab.
  - **Online** → POST normal; si respuesta tiene `offline:true` (SW encoló) muestra modal offline; catch TypeError "Failed to fetch" con fallback a enqueue.
- **No se tocó Prisma** (regla respetada).
- **No se tocaron endpoints existentes** (regla respetada — solo frontend + PWA + SW vanilla).
- `bun run lint` EXIT 1 con 2 errores preexistentes en `src/lib/niif.ts` (no relacionados con este trabajo). Mis cambios pasan lint sin errores ni warnings.
- **Limitaciones**:
  - **Background Sync** solo funciona en Chrome/Edge/Blink — en Safari/Firefox no está soportado. Como fallback, el SW escucha el evento `online` y el hook `useOfflinePos` dispara `postMessage({type:'SYNC_INVOICES'})` cuando transiciona offline→online. `syncPending()` también es invocable manualmente desde el botón "Sincronizar ahora" en el `SyncStatusCard` y desde el tab de Facturación.
  - Los iconos PNG referenciados en el manifest (`/icon-192.png`, `/icon-512.png`) no existen (solo creamos SVGs). Los navegadores solo los buscan cuando el usuario intenta instalar la PWA; si faltan, la instalación sigue funcionando pero con icono genérico. Para usar iconos PNG reales, ejecutar `convert icon-192.svg icon-192.png` (ImageMagick) o generarlos con la skill `image-generation`.
  - El número provisional `OFFLINE-<timestamp>` y el CUFE mock SHA-256 son **provisionales** — cuando el SW sincroniza, el backend asigna el número real de la resolución DIAN y calcula el CUFE real. La factura sincronizada aparecerá en la tabla "Facturas emitidas" con su número final.
  - El modo offline depende de que el navegador soporte Service Workers (todos los browsers modernos lo soportan — Chrome 40+, Firefox 44+, Safari 11.1+, Edge 17+). Si SW no está disponible (ej. modo incógnito en algunos browsers), el hook aún funciona encolando en IndexedDB vía `enqueueInvoice` directo desde el catch TypeError del fetch fallido.
  - No se encola creación de clientes nuevos offline: el cajero debe seleccionar un cliente existente (de la cache IDB) o ingresar nombre+NIT manualmente. El backend creará el tercero cuando sincronice si el payload no trae `terceroId` — actualmente `POST /api/facturas` requiere `terceroId` opcional, así que una factura encolada offline con cliente manual podría fallar al sincronizar si el backend exige el `terceroId`. Solución recomendada para futuro: añadir soporte en `POST /api/facturas` para crear tercero en línea si `terceroId` no viene (igual que ya hace con `POST /api/terceros` inline desde el frontend online).
