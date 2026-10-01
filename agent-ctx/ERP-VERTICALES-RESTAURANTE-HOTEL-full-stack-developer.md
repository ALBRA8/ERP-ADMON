# Agent Work Record — ERP-VERTICALES-RESTAURANTE-HOTEL

**Task ID:** ERP-VERTICALES-RESTAURANTE-HOTEL
**Agent:** full-stack-developer
**Status:** Completado

## Resumen

Implementación de los verticales nicho **Restaurante (Mesas+Comandas)** y **Hotelería (Habitaciones+Reservas)** del ERP Marsella. 14 endpoints API (8 Restaurante + 6 Hotelería) + 2 vistas UI con 4 tabs cada una + integración a sidebar y page.tsx. Acento emerald/teal, dark mode, responsive mobile-first.

## Archivos creados

### API Restaurante (8 rutas)
1. **`src/app/api/mesas/route.ts`** — `GET` (lista con filtros `estado/ubicacion`, orden `posicionY,posicionX`) + `POST` (Zod `mesaCreateSchema`) + `PUT` (Zod `mesaUpdateSchema`, verifica propiedad).
2. **`src/app/api/mesas/[id]/route.ts`** — `GET` (devuelve mesa con `comandaActiva` si la hay) + `PUT` + `DELETE` (desactiva a `inactiva`, bloquea si tiene comanda abierta).
3. **`src/app/api/comandas/route.ts`** — `GET` (filtros `estado/mesaId/fechaInicio/fechaFin`, paginación, include mesa + detalles, enriquece `itemsPendientes`) + `POST` (Zod con array `items`, calcula subtotales con `round()`, crea en estado `abierta`, marca mesa `ocupada`).
4. **`src/app/api/comandas/[id]/route.ts`** — `GET` (comanda completa con detalles ordenados por `createdAt`).
5. **`src/app/api/comandas/[id]/agregar-item/route.ts`** — `POST` (Zod, recalcula total excluyendo anulados).
6. **`src/app/api/comandas/[id]/cambiar-estado-item/route.ts`** — `POST` (Zod con enum `solicitado|preparando|listo|servido|anulado`, set `horaListo=now()` al pasar a `listo`, recalcula total).
7. **`src/app/api/comandas/[id]/anular/route.ts`** — `POST` (estado=`anulada`, `fechaCierre=now()`, mesa=`disponible`).
8. **`src/app/api/comandas/[id]/facturar/route.ts`** — `POST` (llamada fetch interna a `POST /api/facturas` reenviando cookie de sesión, `esPOS:true`, `tarifaIva:0` para que total comanda == total factura, mapea `detallesValidos` → items; actualiza comanda a `facturada` + libera mesa).

### API Hotelería (6 rutas)
9. **`src/app/api/habitaciones/route.ts`** — `GET` (filtros `estado/tipo/planta`, orden `planta,numero`) + `POST` (Zod `habCreateSchema` con enum `tipo`) + `PUT`.
10. **`src/app/api/reservas-hotel/route.ts`** — `GET` (filtros `estado/fechaCheckin/habitacionId`, include habitación, enriquece tercero vía lookup manual ya que el schema no tiene relación formal) + `POST` (Zod, calcula `noches=Math.round(diff/86400000)` y `tarifaTotal=noches*tarifaNoche`, valida `fechaCheckout>fechaCheckin`, solo crea si habitación está `disponible`, marca `reservada`).
11. **`src/app/api/reservas-hotel/[id]/route.ts`** — `GET` (reserva con habitación + tercero enriquecido).
12. **`src/app/api/reservas-hotel/[id]/checkin/route.ts`** — `POST` (cambia `checkin`, habitación=`ocupada`, body opcional `observaciones`).
13. **`src/app/api/reservas-hotel/[id]/checkout/route.ts`** — `POST` (cambia `checkout`, habitación=`sucia`, devuelve resumen `{noches, tarifaTotal, habitacion, huesped}`).
14. **`src/app/api/reservas-hotel/[id]/cancelar/route.ts`** — `POST` (cambia `cancelada`, libera habitación a `disponible`).

### UI (2 componentes client)
15. **`src/components/restaurante/restaurante-view.tsx`** (~1500 líneas, `RestauranteView` named + default export):
    - **Header** con icono `UtensilsCrossed` y KPIs (total/disponibles/ocupadas/reservadas).
    - **Tab Mapa**: grid por `ubicación` de cards con color por estado (emerald disponible / amber ocupada / violet reservada / neutral inactiva). Click mesa disponible → Dialog "Nueva comanda". Click mesa ocupada → abre Sheet lateral.
    - **Tab Comandas abiertas**: tabla con mesa, mesero, hora, total, # items pendientes (badge amber). Click fila → abre Sheet.
    - **Tab Historial**: tabla de comandas `facturadas`+`anuladas` con fecha de cierre y estado (badge).
    - **Tab Configuración**: tabla CRUD de mesas con cambio de estado inline (Select) + botones editar/desactivar.
    - **Sheet lateral** (derecho, 70vw): header con mesa + mesero + hora apertura; KPIs comanda (items totales/pendientes/listos/total acumulado); tabla de items con descripción, cantidad, precio, subtotal, estado (badge colorizado), acciones (Preparar/Listo/Servir/Anular); botones Agregar item + Anular comanda + Facturar.
    - **5 Diálogos**: Nueva mesa (código/nombre/capacidad/ubicación/posX/posY), Editar mesa, Nueva comanda (tabla editable con selector de producto + descripción + cantidad + precio + subtotal + eliminar línea + total dinámico), Agregar item, Facturar (cliente opcional + forma de pago).
    - Helpers `apiGet`/`apiPost` locales, `formatCurrency` desde `@/lib/currency-fn`, toast `sonner`.

16. **`src/components/hotel/hotel-view.tsx`** (~1100 líneas, `HotelView` named + default export):
    - **Header** con icono `BedDouble` y KPIs (total/disponibles/ocupadas/sucias/mantenim.).
    - **Tab Mapa**: grid por `planta` de cards con número grande, código, tipo (icon), capacidad, precio/noche, color por estado (emerald/amber/rose/neutral). Click disponible → Dialog "Nueva reserva". Click ocupada → abre Sheet con reserva activa.
    - **Tab Reservas**: tabla con código, habitación, huésped, check-in, check-out, noches, tarifa total, estado (badge) + botones por fila (Check-in / Check-out / Cancelar / Ver). Botón "Nueva reserva" arriba.
    - **Tab Habitaciones**: tabla CRUD (número, código, tipo, cap., precio, planta, estado) con cambio de estado inline (Select) + botón editar.
    - **Tab Tarifas**: 4 cards por tipo (sencilla/doble/matrimonial/suite) con precio promedio, ocupación actual %, barra de progreso visual + card adicional con conteo de reservas activas.
    - **Sheet lateral**: detalle de reserva con KPIs (noches/tarifa-noche/total/estado) + datos huésped + datos habitación + botones Check-in/Check-out/Cancelar.
    - **3 Diálogos**: Nueva habitación, Editar habitación, Nueva reserva (cliente opcional + nombre huésped + fechas + tarifa auto-rellena con `habitacion.precioBase` + noches calculadas + total estimado + observaciones).

### Modificaciones
17. **`src/components/layout/sidebar.tsx`**: imports `UtensilsCrossed`, `BedDouble`; `NavKey` añadidos `"restaurante"` y `"hotel"`; grupo nuevo `"Verticales"` con 2 items entre Financiero y Sistema.
18. **`src/app/page.tsx`**: imports `RestauranteView` y `HotelView`; `View` extendido con `"restaurante"` y `"hotel"`; casos de render añadidos.
19. **`src/lib/db.ts`**: añade 5 modelos nuevos (`mesa`, `comanda`, `detalleComanda`, `habitacion`, `reservaHotel`) a la lista `required` de `hasAllModels`; añade `bustPrismaClientCacheAndReload()` que borra `require.cache` para `@prisma/client` y sub-módulos para forzar recarga desde disco cuando el schema cambió o faltan modelos (resuelve bug stale PrismaClient class en memoria del dev server).

## Decisiones técnicas

- **Llamada interna fetch para facturar**: en lugar de duplicar la lógica de creación de factura, `POST /api/comandas/[id]/facturar` hace `fetch(new URL("/api/facturas", req.url), { method: POST, headers: { cookie: req.headers.get("cookie") } })`. Esto reenvía la cookie de sesión al endpoint existente que ya maneja resolución DIAN, CUFE, asiento contable y todo el flujo. Si `/api/facturas` devuelve error (ej. falta resolución DIAN), se propaga al usuario con `badRequest()` y la comanda NO se marca como facturada (rollback natural).
- **`tarifaIva: 0` en items al facturar**: los precios de comanda en un POS restaurante incluyen IVA por simplicidad. Al facturar con `tarifaIva: 0`, el total de la factura == total de la comanda. Si se quisiera separar IVA (ej. tarifaIva=19 con descuento del subtotal), habría que añadir `tarifaIva` a `DetalleComanda` en el schema (futuro). No se tocó el schema por regla "No tocar Prisma".
- **Enriquecimiento manual de tercero en reservas**: el modelo `ReservaHotel` solo tiene `terceroId String?` sin relación formal a `Tercero`. Se hizo lookup manual con `db.tercero.findUnique({where: {id: terceroId}, select: {id, nombre, numeroDocumento}})` en los 5 endpoints que devuelven reservas. Solo se hace el lookup si hay `terceroId`. Si un agente futuro añade `tercero Tercero? @relation(fields:[terceroId], references:[id])` al schema, se puede simplificar a `include: { tercero: true }`.
- **`bustPrismaClientCacheAndReload()` en `db.ts`**: el dev server del sandbox cachea la clase `PrismaClient` en `require.cache` al primer load. Cuando `prisma generate` regenera el cliente (porque se añadieron modelos al schema), los archivos en disco se actualizan pero la clase en memoria sigue siendo la vieja. El patrón existente en `db.ts` invalida `global.__db` pero NO borra `require.cache`, así que `new PrismaClient(...)` instanciaba la clase stale. Mi función borra `require.cache` para `@prisma/client`, `@prisma/client/default`, `.prisma/client`, `.prisma/client/default` y re-requiere el módulo desde disco. Solo se ejecuta cuando `schemaChanged || missingModels` para no penalizar requests normales.
- **`hasAllModels` extendido**: añadí `mesa`, `comanda`, `detalleComanda`, `habitacion`, `reservaHotel` a la lista `required` para que la detección dispare correctamente cuando la cache stale no tiene estos modelos. Sin esto, `hasAllModels` retornaba true (porque los 18 modelos previos ya estaban) y el cache no se invalidaba.
- **Imports restringidos**: solo `@/components/ui/*` (card, tabs, button, input, label, badge, table, dialog, sheet, select, skeleton), `sonner`, `lucide-react`, `@/lib/currency-fn`, hooks de React (`useCallback`, `useEffect`, `useMemo`, `useState`). No se importó `cn` de `@/lib/utils` — los `className` se construyen con strings literales.
- **Formato moneda COP**: `formatCurrency` desde `@/lib/currency-fn` (cliente wrapper de `@/lib/currency`). Para fechas, helpers locales con `Intl.DateTimeFormat("es-CO", ...)`.
- **Color centinela para selects**: ningún valor placeholder artificial — el `Select` usa `<SelectValue placeholder="..." />` estándar de Radix.

## Validación

- `bun run lint` **EXIT 0** (0 errores, 0 warnings) en mis archivos y en la modificación a `src/lib/db.ts`.
- Pruebas curl con cookie demo válida (login vía `POST /api/auth/demo`):
  - `GET /api/mesas` → **HTTP 200**, `{"items":[...],"total":1}`
  - `POST /api/mesas` → **HTTP 200**, crea mesa `M01`
  - `GET /api/mesas/[id]` → **HTTP 200**, devuelve mesa con `comandaActiva: null`
  - `POST /api/comandas` → **HTTP 200**, crea comanda con `total=25000`, mesa → `ocupada`
  - `GET /api/comandas/[id]` → **HTTP 200**, devuelve comanda con `mesa` y `detalles`
  - `POST /api/comandas/[id]/agregar-item` → **HTTP 200**, recalcula total a 35000
  - `POST /api/comandas/[id]/cambiar-estado-item` → **HTTP 200**, item `estado=listo`, `horaListo=now()`
  - `POST /api/comandas/[id]/anular` → **HTTP 200**, comanda `anulada`, mesa `disponible`
  - `POST /api/comandas/[id]/facturar` → **HTTP 400** con `{"error":"No hay resolución DIAN activa para facturación POS"}` (esperado: la empresa demo no tiene resolución POS configurada; el endpoint propaga el error de `/api/facturas`)
  - `GET /api/habitaciones` → **HTTP 200**, `{"items":[...],"total":1}`
  - `POST /api/habitaciones` → **HTTP 200**, crea habitación `101`
  - `POST /api/reservas-hotel` → **HTTP 200**, calcula `noches=3`, `tarifaTotal=360000` a partir de `tarifaNoche=120000`, marca habitación `reservada`
  - `POST /api/reservas-hotel/[id]/checkin` → **HTTP 200**, estado=`checkin`, habitación=`ocupada`
  - `POST /api/reservas-hotel/[id]/checkout` → **HTTP 200**, estado=`checkout`, habitación=`sucia`, devuelve resumen con `noches=3, tarifaTotal=360000, habitacion={numero:101, tipo:sencilla}, huesped:"—"`
  - `POST /api/reservas-hotel/[id]/cancelar` → **HTTP 200**, estado=`cancelada`, habitación=`disponible`
- Dev log final: compilación exitosa para RestauranteView (~12.5s primera vez por tamaño de código nuevo, <120ms en requests subsiguientes). Sin errores de runtime. Todas las rutas responden con códigos HTTP correctos.
- Página `/` carga con **HTTP 200**.

## Notas para el agente principal / siguientes agentes

- **`src/lib/db.ts` fue modificado** para resolver el bug stale PrismaClient que afectaba a los verticales nuevos (Restaurante/Hotel) Y al vertical Bancos (que el agente anterior dejó roto por el mismo problema). El fix es genérico: cualquier modelo nuevo añadido al schema Prisma debe ir en la lista `required` de `hasAllModels` para que el cache se invalide y el `bustPrismaClientCacheAndReload()` recargue la clase desde disco. **Si añades modelos nuevos en el futuro, añádelos también a esta lista.**
- **Falta relación `Tercero.reservaHotels`**: el schema actual no tiene `tercero Tercero? @relation(fields:[terceroId], references:[id])` en `ReservaHotel`. Si un agente futuro lo añade (más `reservaHotels ReservaHotel[]` a `Tercero`), se puede simplificar el enriquecimiento manual a `include: { tercero: true }` en los 5 endpoints de reservas-hotel.
- **Facturación desde comanda requiere resolución DIAN POS**: el usuario/admin debe configurar primero una resolución DIAN con `tipoOperacion: "pos"` y `activa: true` en Parámetros → Resoluciones DIAN. Sin esto, `POST /api/comandas/[id]/facturar` devuelve 400 con el mensaje de error. No es un bug — es el comportamiento esperado del endpoint `/api/facturas` subyacente.
- **`POST /api/comandas/[id]/facturar` no es atómico**: si el fetch interno a `/api/facturas` tiene éxito pero falla la actualización de la comanda, la factura se crea pero la comanda queda `abierta`. Esto es muy poco probable (ambas operaciones son locales), pero se podría mejorar con transacción Prisma si se extrajera la lógica de factura a un helper compartido.
- **RestauranteView y HotelView comparten muchos patrones** (helpers, KPIs, badges, dialogos) — futuras refactorizaciones podrían extraer componentes compartidos a `@/components/verticales/` (ej. `BadgeEstado`, `KPI`, `DialogForm`). Por ahora se mantienen autocontenidos para evitar acoplamiento entre verticales.
EOF
