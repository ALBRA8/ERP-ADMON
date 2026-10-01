# ERP-NIIF-FIX — Ajuste y corrección de cálculos NIIF

## Archivos modificados
- `/home/z/my-project/src/lib/niif-mapping.ts` — 6 entradas corregidas en `PUC_TO_NIIF`
- `/home/z/my-project/src/lib/niif.ts` — `generarEFE` reescrito en `ajustesNoCaja` y `flujosInversion`

## Bugs reales encontrados y corregidos

### 1. Mapeo PUC incorrecto (`niif-mapping.ts`)
- 2505 Salarios por pagar → `pasivo_corriente` (era `pasivo_no_corriente`)
- 2520 Prima servicios por pagar → `pasivo_corriente` (era `pasivo_no_corriente`)
- 2525 Vacaciones por pagar → `pasivo_corriente` (era `pasivo_no_corriente`)
- 2625 Provisión vacaciones consolidadas → `pasivo_no_corriente` (no existía, caía a fallback `pasivo_corriente`)
- 1690/1695 Depreciación acumulada → `activo_no_corriente` (no existía, caía a fallback `activo_corriente`)

### 2. EFE incoherente (`niif.ts`)
- **Doble conteo**: `deltaActivoNoCorriente` se sumaba en `ajustesNoCaja` Y se restaba en `flujosInversion`.
- **Faltante**: `deltaPasivoNoCorriente` no se agregaba como ajuste no-caja. Las provisiones (510525) reducen utilidadNeta pero la contrapartida es 26XX (no corriente) — debe reversarse. Esto causaba diff de -3.707.975 entre `aumentoNetoEfectivo` y el cambio real de efectivo.
- **Signo**: `flujosInversion` usaba `Math.abs` — impedía registrar ventas como ingresos.
- **Contra-activos**: `flujosInversion` consideraba cualquier movimiento 16/17/18 (incluyendo contra-activos naturaleza crédito como 1690). Ahora solo naturaleza débito.

## Hallazgos sobre la hipótesis del usuario
- **La naturaleza SÍ se respeta correctamente** en `agruparSaldosPorCategoria`: fórmula `pc.naturaleza === "credito" ? credito - debito : debito - credito` es correcta para PUC colombiano.
- **utilidadNeta = -11.364.154 NO es bug**: nómina demo ($11.4M) >> ingresos ($108K). Pérdida matemáticamente correcta.
- **saldoFinal = -5.076.000 NO es bug de cálculo**: la data demo paga nómina desde cuenta bancaria 111005 sin depósitos previos.
- **IMP-10 desbalanceado** (D 1105 100K sin crédito) genera diferencia 100.000 en ESF — DATA issue.

## Verificación post-fix (con data demo)
- **ESF**: `totalActivo=-4.915.783,53`, `totalPasivoPatrimonio=-5.015.783,53`, `diferencia=100.000` (IMP-10)
- **EER**: `utilidadNeta=-11.364.154,03` (negativa por nómina demo, no bug)
- **EFE**: `aumentoNetoEfectivo=-5.076.000` = cambio real de efectivo (COHERENTE, diff -100.000 = IMP-10)
- **ECP**: `saldoFinalPatrimonio=-11.364.154,03` = inicial + utilidad - dividendos ✓

## Lint
- `bun run lint` EXIT 0 (0 errores, 0 warnings).
- Sin cambios a Prisma schema, endpoints API, ni otros módulos.
- UI `niif-view.tsx` no requiere cambios (estructura JSON intacta).
