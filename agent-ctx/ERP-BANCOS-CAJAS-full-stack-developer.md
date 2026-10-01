# Task ERP-BANCOS-CAJAS — Bancos, Cajas POS y Conciliación Bancaria

**Agent**: full-stack-developer
**Started**: 2026-10-01

## Scope
- 11 API endpoints (bancos, cuentas-bancarias, movimientos-bancarios, extractos, conciliación + [id] + [id]/match, cajas + [id]/abrir + [id]/cerrar, arqueos)
- 2 UI components: `bancos-view.tsx` (4 tabs) + `cajas-view.tsx` (3 tabs)
- Sidebar + page.tsx wiring

## Context reviewed (from prior agents)
- `prisma/schema.prisma` lines 931-1090: Banco, CuentaBancaria, MovimientoBancario, ExtractoBancario, ExtractoMovimiento, ConciliacionBancaria, CajaPOS, ArqueoCaja (do NOT modify).
- `src/lib/auth.ts` `getSession()` returns `SessionPayload { userId, empresaId, email, nombre, rol }`.
- `src/lib/api.ts`: `ok`, `badRequest`, `serverError`, `unauthorized`, `notFound`, `getQuery`, `getQueryInt`, `parseBody`.
- `src/lib/currency.ts`: `round(value, decimals=2, method="half_up")`, `formatCurrency`.
- `src/lib/currency-fn.ts`: client wrapper re-exporting `formatCurrency` from a `"use client"` module.
- `src/app/api/nomina/[id]/pagar/route.ts`: pattern for generating comprobantes (CG-YYYY-NNNNNN) + asiento (CuentaPuc by codigo 250505 / 111005) using `db.comprobante.count({ where: { empresaId } })`.
- `CuentaPuc.codigo` is `@unique` globally; `db.cuentaPuc.findUnique({ where: { codigo: "1110" } })` works.
- `src/components/layout/sidebar.tsx`: `NavKey` type + `NAV` array grouped by `"Financiero"`.
- `src/app/page.tsx`: SPA `view` state, `View` type union, conditional rendering by `view === "..."`.
- Existing UI lib: card, dialog, sheet, tabs, select, input, label, badge, table, checkbox, button, alert, sonner toast.

## Status: COMPLETED

## Deliverables
- 11 API endpoints (all verified 200 via curl auth):
  - `POST/GET /api/bancos` ✓
  - `POST/GET/PUT /api/cuentas-bancarias` (con `?include=movimientos` y validación de número único) ✓
  - `POST/GET /api/movimientos-bancarios` (ajusta `CuentaBancaria.saldoActual`, genera comprobante `CG-YYYY-NNNNNN` con asiento débito `1110`/crédito `1105` para depósitos, reverso para retiros) ✓
  - `POST/GET /api/extractos` (con bulk `extractoMovimiento.createMany`) ✓
  - `POST/GET /api/conciliacion` (calcula saldos finales + diferencia, estado `borrador`) ✓
  - `GET/PUT /api/conciliacion/[id]` (PUT con `cerrar=true` → `estado=conciliada` + marca `ExtractoBancario.estado=conciliado`) ✓
  - `POST /api/conciliacion/[id]/match` (vincula movimiento bancario ↔ extracto movimiento) ✓
  - `POST/GET/PUT /api/cajas` ✓
  - `POST /api/cajas/[id]/abrir` ✓
  - `POST /api/cajas/[id]/cerrar` (crea `ArqueoCaja` con cálculo de `saldoFinalSistema` + `diferencia`) ✓
  - `GET /api/arqueos` (filtros + paginación) ✓
- 2 UI components (client, dark mode, acento emerald/teal, responsive):
  - `src/components/bancos/bancos-view.tsx` (~970 líneas) — 4 tabs: Bancos y Cuentas (cards + Sheet), Movimientos (tabla+filtros+Dialog), Extractos (tabla+Dialog CSV), Conciliación (dos paneles lado a lado + Alert feedback + botón cerrar).
  - `src/components/cajas/cajas-view.tsx` (~700 líneas) — 3 tabs: Cajas POS (grid cards con estados), Arqueos (tabla+Sheet detalle), Cierre de caja (form standalone con calculadora visual).
- Sidebar actualizado: items `bancos` (Landmark) y `cajas` (Store) en grupo Financiero.
- `page.tsx` actualizado con casos `view === "bancos"` y `view === "cajas"`.
- `src/lib/db.ts` actualizado: 8 modelos bancarios en `required` de `hasAllModels`.
- `bun run lint` EXIT 0, dev.log limpio, verificación funcional OK.

## Notes
- `touch next.config.ts` fue necesario para forzar reload completo de Turbopack y resolver el stale `@prisma/client` cacheado en memoria (tras `prisma db push` los modelos nuevos estaban en disco pero la clase PrismaClient en memoria del dev server seguía siendo la anterior, así que `db.banco` era `undefined`).
- Un agente concurrente añadió modelos de restaurante (mesa, comanda, habitación, reservaHotel) y la función `bustPrismaClientCacheAndReload` con `require.cache` cleanup; limpié sus `eslint-disable` comments unused.
- Prisma schema no fue tocado (los modelos ya existían por el agente principal).
- Test de saldo correcto: cuenta inicial $1.000.000 → depósito $500.000 → retiro $200.000 → $1.300.000 ✓.
- Test de arqueo correcto: saldoInicial $200.000 + ventasEfectivo $1.500.000 + otrosIngresos $50.000 - gastosMenores $100.000 = saldoFinalSistema $1.650.000, conteo $1.650.000 → diferencia $0 ✓.
- Test de conciliación correcto: saldoInicialLibro $1.000.000 + ajustes $300.000 = saldoFinalLibro $1.300.000; mismo cálculo en extracto; diferencia $0; cerrar conciliación marca extracto como `conciliado` ✓.
