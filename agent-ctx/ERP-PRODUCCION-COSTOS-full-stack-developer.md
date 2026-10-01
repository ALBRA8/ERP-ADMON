# ERP-PRODUCCION-COSTOS — Costos y Órdenes de Producción

Task ID: ERP-PRODUCCION-COSTOS
Agent: full-stack-developer
Fecha: 2026-10-01

## Resumen

Implementé el módulo de **Costos y Órdenes de Producción (transformación)** del ERP Marsella (Hermes §5.7). El módulo cubre el flujo completo: recetas → órdenes en borrador → iniciar producción (salidas de materia prima) → finalizar (entrada de producto terminado + asiento contable) → anular (con reversión si estaba en_proceso).

## Archivos creados / modificados

### Nuevos
- `src/lib/produccion.ts` (~330 líneas): 5 funciones + 1 helper reversión.
- `src/app/api/produccion/recetas/route.ts` (GET/POST/PUT)
- `src/app/api/produccion/recetas/[id]/route.ts` (GET/PUT/DELETE)
- `src/app/api/produccion/recetas/[id]/calcular-costo/route.ts` (GET)
- `src/app/api/produccion/ordenes/route.ts` (GET/POST)
- `src/app/api/produccion/ordenes/[id]/route.ts` (GET)
- `src/app/api/produccion/ordenes/[id]/agregar-detalle/route.ts` (POST)
- `src/app/api/produccion/ordenes/[id]/iniciar/route.ts` (POST)
- `src/app/api/produccion/ordenes/[id]/finalizar/route.ts` (POST)
- `src/app/api/produccion/ordenes/[id]/anular/route.ts` (POST)
- `src/components/produccion/produccion-view.tsx` (~2700 líneas, 4 tabs)

### Modificados
- `src/lib/db.ts`: añadidos `ordenProduccion`, `detalleOrdenProduccion`, `recetaProducto`, `recetaIngrediente` a `hasAllModels` para auto-invalidar el cache de PrismaClient.
- `src/components/layout/sidebar.tsx`: añadido import `Factory`, `NavKey` extendido con `"produccion"`, item `{ key: "produccion", label: "Producción y Costos", icon: Factory, group: "Operación" }` después de "Compras".
- `src/app/page.tsx`: import `ProduccionView`, tipo `View` extendido, caso `view === "produccion"`.

## Funciones de `src/lib/produccion.ts`

1. `calcularCostoProduccion(orden)`: suma MP+MO+CI con `round`, calcula `costoUnitario = costoTotal / cantidadProducida` si > 0.
2. `aplicarReceta(receta, cantidadProducir, bodegaId)`: por cada ingrediente consulta `saldoInventario`, calcula `cantidadRequerida = ing.cantidad * cantidadProducir`, `subtotal`, `disponible`. Retorna `{ ingredientes, totalCosto, todoDisponible }`.
3. `registrarSalidaMateriasPrimas(ordenId, bodegaId)`: idempotente (`documentoTipo: "ORDEN_PRODUCCION"`), llama `registrarMovimientoInventario({ tipo: "salida", ... })` por cada detalle MP con productoId.
4. `registrarEntradaProductoTerminado(ordenId, bodegaId, cantidadProducida, costoUnitario)`: idempotente (`documentoTipo: "ORDEN_PRODUCCION_ENTRADA"`), llama `registrarMovimientoInventario({ tipo: "entrada", ... })` para el `productoResultanteId`.
5. `generarAsientoProduccion(ordenId, empresaId)`: idempotente, lookup cuentas PUC 150505/2335/7205 por `codigo`, ajusta diferencia por redondeo en crédito a 7205, crea `Comprobante` tipo `produccion` estado `contabilizado` con 4 `MovimientoContable` (débito 150505 x costoTotal, crédito 150505 x MP, crédito 2335 x MO, crédito 7205 x CI), vincula `comprobanteContableId` a la orden.
6. `reversarSalidasMateriasPrimas(ordenId, bodegaId)`: para anulación en_proceso, idempotente (`documentoTipo: "ORDEN_PRODUCCION_REVERSO"`), registra `entrada` por cada salida previa.

## Flujo de state machine

```
borrador ──iniciar──> en_proceso ──finalizar──> finalizada
   │                      │
   └──anular──> anulada   └──anular (con reversión)──> anulada
```

- `iniciar`: valida stock suficiente antes de registrar salidas.
- `finalizar`: registra entrada de producto terminado + genera asiento contable.
- `anular`: si estaba `en_proceso`, reversa salidas. No permite anular `finalizada`.

## Verificación funcional (curl autenticado)

- POST `/api/produccion/recetas` → 200, receta creada con `ingrediente.subtotal=2000`.
- GET `/api/produccion/recetas/[id]/calcular-costo?cantidad=10&bodegaId=BODEGA` → 200, `totalCosto=20000`, `verificacionStock.todoDisponible=false` (porque no había stock inicial).
- POST `/api/produccion/ordenes` (con receta, cant=10) → 200 `numero=PROD-2026-000001`, `costoTotal=20000`, detalle con `cantidad=20` (=ing.cantidad*cantProducir).
- POST `/api/produccion/ordenes/[id]/iniciar` (sin stock) → **400** `"Stock insuficiente..."` con `details.faltantes`.
- POST `/api/inventario` (entrada 50u x $1000) → 200 (saldo inicial).
- POST `iniciar` → 200 `estado=en_proceso`, `salidasRegistradas=1`. Saldo MP bajó 50→30.
- POST `finalizar` (cant=10) → 200 `estado=finalizada`, `costoUnitario=2000`. Saldo producto resultante = 10u @ $2000 = $20000.
- Sin cuenta PUC 2335 → `asientoContable=null`, `asientoError="No se encontraron las cuentas PUC con códigos: 2335..."` (no revierte la entrada).
- Tras crear 2335 vía prisma directo: POST `finalizar` orden 2 → 200 `asientoContable={numero:"CP-2026-000011"}`, comprobante con `totalDebito=10000`, `totalCredito=10000` (cuadrado ✓).
- POST `anular` (orden 3 en_proceso) → 200 `estado=anulada`, `reversion.reversados=1`. Saldo MP subió 14→20 (reversión de 6u).
- POST `anular` sobre orden ya finalizada → **400** `"No se puede anular una orden finalizada"`.
- POST `agregar-detalle` (CI 1x300) → 200 `costoIndirectos=1100`, `costoTotal=7600` (recalculo correcto).
- PUT `/api/produccion/recetas/[id]` → 200 actualiza nombre, rendimiento, ingredientes (subtotal=2.5*1200=3000).
- GET `ordenes?estado=finalizada` → 200 `total=2` (PROD-0001 + PROD-0002).

## Lint

`bun run lint` → **EXIT 0** (0 errores, 0 warnings).

## Notas

- El spec del asiento usa `150505` tanto para débito (producto terminado) como para uno de los créditos (materia prima) — parece typo del spec pero se sigue literalmente. Ambos movimientos se crean contra la cuenta `150505` (uno débito, otro crédito), lo cual es contablemente válido. Si se quiere separar inventarios, basta cambiar el código en `generarAsientoProduccion` y crear las cuentas adicionales en el Plan de Cuentas.
- Cuenta PUC `2335` NO está en `scripts/seed-marsella.ts` (solo trae `150505` y `7205`). Si la empresa no la tiene creada, el asiento falla gracefulmente al finalizar (la orden queda finalizada, la entrada de producto queda registrada, pero el comprobante no se crea y el cliente recibe un `warning` toast con el mensaje de error).
