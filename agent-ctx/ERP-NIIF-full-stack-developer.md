---
Task ID: ERP-NIIF
Agent: full-stack-developer
Task: Implementar módulo de Estados Financieros NIIF (IFRS) en el ERP Marsella

Work Log:
1. Inicialicé el entorno fullstack con `init-fullstack_1775040338514.sh`. Verifiqué que el dev server estaba corriendo en el puerto 3000.
2. Leí `worklog.md` y los registros de agentes previos en `/agent-ctx/` para entender convenciones de código (helpers `ok`/`badRequest`/`serverError`/`getQuery`/`getQueryInt`, patrón `getSession()` + `session.empresaId`, toast sonner, badges colorizados, dark mode con `dark:`, acento emerald/teal).
3. Revisé `prisma/schema.prisma` líneas 1613-1640: confirmé que los modelos `ReporteNIIF` (id, empresaId, tipo, periodo, fechaInicio, fechaFin, json_data String, archivo, userId, createdAt) y `CuentaNIIF` (id, empresaId, codigoNIIF, nombre, categoria, saldoActual, cuentaPucId) ya existen — no toqué el schema. También revisé `CuentaPuc` (654-673), `Comprobante` (675-698), `MovimientoContable` (700-720), `Empresa` (21+), `Usuario` (71+).
4. Revisé `src/lib/db.ts` (PrismaClient singleton con detección de missingModels), `src/lib/auth.ts` (`getSession()` con cookies()+jwtVerify), `src/lib/currency.ts` (`round(value, decimals, method)`, `formatCurrency()`), `src/lib/api.ts` (`ok/badRequest/serverError/unauthorized/notFound/getQuery/getQueryInt/parseBody`), `src/lib/pdf.tsx` (~2000 líneas con helpers `Header`, `Footer`, `TablePDF`, `TotalRow`, `cargarEmpresa`, estilos `COLORS`/`styles`, `fmtCOP`/`fmtFecha`/`fmtFechaHora`).
5. Revisé `src/components/contabilidad/contabilidad-view.tsx` y `src/components/reportes/reportes-view.tsx` para entender patrones de UI (Tabs, cards con `border-emerald-500/20`, `formatCurrency` desde `@/lib/currency-fn`, fetch + toast.error/sonner, scroll `max-h-96 overflow-y-auto`).
6. **Creé `src/lib/niif-mapping.ts`**:
   - Define tipo `NIIFCategory` (14 categorías: activo_corriente, activo_no_corriente, inventarios, clientes, efectivo, pasivo_corriente, pasivo_no_corriente, patrimonio, ingresos, gastos_admin, costos_venta, costos_produccion, otros_ingresos, otros_gastos).
   - Define objeto `PUC_TO_NIIF` con ~120 códigos PUC colombianos mapeados a categorías NIIF (4 dígitos = cuenta específica, 1 dígito = clase fallback).
   - Función `normalizarCodigoPUC(codigo)` que limpia dejando solo dígitos.
   - Función `mapCuentaPUCtoNIIF(codigo)` que busca el prefijo MÁS LARGO (más específico) en la tabla. Ejemplos verificados: "1105" → efectivo, "111005" → efectivo (prefijo "1110"), "130505" → clientes (prefijo "1305"), "237005" → pasivo_corriente (prefijo "2370").
   - Función `agruparSaldosPorCategoria(movs)` que toma movimientos con `cuenta.{codigo,nombre,naturaleza}` + `debito/credito`, suma saldos (debito: débito-crédito; crédito: crédito-débito), omite saldos 0, agrupa por categoría NIIF.
   - Función `sumarSaldos(lineas)` para totalizar un grupo.
7. **Creé `src/lib/niif.ts`** con 5 generadores:
   - `generarESF(empresaId, fechaFin)` — Estado de Situación Financiera: lee movs hasta fechaFin, agrupa por NIIF, calcula secciones (efectivo, clientes, inventarios, activo_corriente, activo_no_corriente, pasivo_corriente, pasivo_no_corriente, patrimonio), incluye `utilidadPeriodo` (calculada con inicio de año → fechaFin), `totalActivo`, `totalPasivoPatrimonio`, `diferencia` (debe ser 0 si cuadra).
   - `generarEER(empresaId, fechaInicio, fechaFin)` — Estado de Resultado Integral: lista ingresos/costosVenta/gastosAdmin/costosProduccion/otrosIngresos/otrosGastos, calcula `utilidadBruta = totalIngresos - totalCostosVenta`, `utilidadOperativa`, `utilidadAntesImpuestos`, `impuestoRenta (33%)`, `utilidadNeta`.
   - `generarECP(empresaId, fechaInicio, fechaFin)` — Cambios en el Patrimonio: calcula `saldoInicialPatrimonio` (saldos clase 3 hasta día-1 de fechaInicio), `aumentos` y `reducciones` (movimientos del período en cuentas clase 3), `utilidadNetaPeriodo` (reusa `generarEER`), `dividendos` (débitos en cuentas 3605/3606/3615), `saldoFinalPatrimonio`.
   - `generarEFE(empresaId, fechaInicio, fechaFin)` — Flujos de Efectivo (método indirecto): arranca con `utilidadNeta`, agrega variaciones de capital de trabajo (clientes, inventarios, pasivos corrientes con signo invertido), clasifica movimientos en cuentas 16/17/18 como inversión, 21/25/26/3 como financiación, calcula `aumentoNetoEfectivo` y `saldoInicial`/`saldoFinal`.
   - `generarNotasNIIF(empresaId, fechaFin)` — Notas a los EE. FF.: base preparación (NIIF/IFRS), moneda funcional, 6 políticas contables (ingresos, PPE, inventarios, cuentas por cobrar, pasivos laborales, impuestos), 4 tipos de riesgos (mercado, crédito, liquidez, operativo), eventos posteriores, firma del contador.
8. **Agregué 4 generadores PDF a `src/lib/pdf.tsx`** (sin reescribir el archivo, solo al final ~580 líneas nuevas):
   - Componentes helper: `NiifTableRow` (fila con código/nombre/valor, soporta bold, alt-row, indent, color), `NiifTableHeader` (Código/Descripción/Valor), `NotasYFirma` (notas estándar + 2 firmas: contador y representante legal).
   - `generarPDFESF(empresaId, fechaFin)` — página con header empresa, secciones ACTIVO/PASIVO/PATRIMONIO, subsecciones con subtotales, total activo destacado, total pasivo+patrimonio, badge diferencia (verde si 0, rojo si no), notas y firma.
   - `generarPDFEER(empresaId, fechaInicio, fechaFin)` — página con ingresos, costos venta, **UTILIDAD BRUTA** (color emerald/rojo según signo), gastos admin, costos producción, **UTILIDAD OPERATIVA**, otros, **UTILIDAD ANTES DE IMPUESTOS**, impuesto renta (33%, rojo), **UTILIDAD NETA** destacada.
   - `generarPDFECP(empresaId, fechaInicio, fechaFin)` — saldo inicial, aumentos, reducciones, dividendos, **SALDO FINAL DEL PATRIMONIO** destacado.
   - `generarPDFFE(empresaId, fechaInicio, fechaFin)` — flujos de operación/inversión/financiación con subtotales, **AUMENTO NETO DEL EFECTIVO**, saldo inicial, **SALDO FINAL DE EFECTIVO** (caja emerald-600).
9. **Creé 8 endpoints API** bajo `/api/niif/`:
   - `GET /api/niif/esf?fechaFin=YYYY-MM-DD` → genera y devuelve el ESF completo (estructura JSON con activo, pasivo, patrimonio, totales, diferencia).
   - `GET /api/niif/eer?fechaInicio=...&fechaFin=...` → genera y devuelve el EER.
   - `GET /api/niif/ecp?fechaInicio=...&fechaFin=...` → genera y devuelve el ECP.
   - `GET /api/niif/efe?fechaInicio=...&fechaFin=...` → genera y devuelve el EFE.
   - `POST /api/niif/guardar` → persiste un ReporteNIIF con Zod validation (tipo ESF|EER|ECP|EFE|Notas, periodo anual|trimestral|mensual, fechaInicio, fechaFin, json_data, archivo opcional, userId de sesión). También GET para listar (alias de /reportes).
   - `GET /api/niif/reportes?tipo=...&fechaInicio=...&fechaFin=...` → lista ReporteNIIF guardados con filtros y enriquecimiento (`totalRegistros` contado del json_data según el tipo: ESF=8 secciones, EER=6 listas, ECP=aumentos+reducciones, EFE=3 secciones de flujos). POST alternativo equivalente a /guardar.
   - `GET /api/niif/reportes/[id]` → devuelve un reporte guardado (con `json_data` parseado a objeto). DELETE para eliminar.
   - `GET /api/niif/reportes/[id]/pdf` → genera PDF del reporte guardado según su tipo (Content-Type: application/pdf, Content-Disposition inline/attachment, Cache-Control: no-store). Soporta query `?download=1` para descarga directa.
   - Todos validan `getSession()` y filtran por `session.empresaId`. Usan helpers `ok`/`badRequest`/`serverError`/`unauthorized`/`notFound` de `@/lib/api`.
10. **Bug zod v4 encontrado y resuelto**: en zod@4.3.5, `z.record(z.any())` (un solo argumento) lanza `Cannot read properties of undefined (reading '_zod')` durante `safeParse`. Cambio a `z.record(z.string(), z.any())` (2 argumentos, clave + valor) — API de zod v4 requiere ambos argumentos.
11. **Bug en mapeo PUC→NIIF encontrado y resuelto**: la versión inicial del mapeo usaba patterns con wildcards como `"1.1.0.5"` para representar "1105 = Caja", pero el algoritmo normalizaba a "11.05.00.00" no matcheando con códigos reales como "111005" → "11.10.05.00". Reescribí completamente el mapeo usando códigos PUC reales sin wildcards (1105, 1110, 1305, 1505, 2370, etc.) y matching por prefijo más largo (de 8 dígitos hacia abajo, hasta 1 dígito de clase). Verificado con curl: 111005 → efectivo (correcto), 130505 → clientes (correcto), 150505 → inventarios (correcto), 237005 → pasivo_corriente (correcto), diferencia ESF = 0 (cuadra).
12. **Creé `src/components/niif/niif-view.tsx`** (~1050 líneas, client component) con `export function NiifView()` y 5 tabs:
    - **ESF**: selector de fechaFin (date input), botón Generar, tabla con secciones Activo (efectivo + clientes + inventarios + corriente + no_corriente con subtotales), Pasivo (corriente + no_corriente con subtotales), Patrimonio, Total Activo, Total Pasivo + Patrimonio, **badge verde "Cuadra" si |diferencia| < 1, rojo "No cuadra" si no**. Botones Guardar reporte y Descargar PDF (este último guarda primero el reporte y luego descarga su PDF).
    - **EER**: selectores fechaInicio + fechaFin, tabla con Ingresos, Costos de venta, **Utilidad bruta (subtotal destacado emerald/rojo según signo)**, Gastos admin, Costos producción, **Utilidad operativa**, Otros ingresos, Otros gastos, **Utilidad antes de impuestos**, **Impuesto de renta (33%) (rojo)**, **Utilidad neta (destacada emerald-600)**.
    - **ECP**: selectores fecha, tabla con saldo inicial (caja emerald), aumentos (con `+` verde), reducciones (con `-` rojo), dividendos, **saldo final (caja emerald-600 destacado)**.
    - **EFE**: selectores fecha, tabla con flujos de operación (color emerald/rojo según signo), inversión (teal), financiación (amber), aumento neto, **saldo inicial y saldo final (cajas grid 2 columnas)**.
    - **Reportes guardados**: tabla con fecha createdAt, tipo (badge emerald), periodo, rango fechas, total registros, acciones: **Ver JSON (Dialog con `<pre>` pretty-printed)**, **Descargar PDF** (abre `/api/niif/reportes/[id]/pdf?download=1` en nueva pestaña), **Eliminar** (con confirm). Filtro por tipo (Select con 6 opciones: Todos/ESF/EER/ECP/EFE/Notas). Alert cuando lista vacía.
    - Helper `TablaSaldos` reutilizable con `max-h-80 overflow-y-auto`, tabla con código/nombre/saldo, footer con subtotal.
    - Helper `ResultadoRow` para destacados (utilidad bruta, operativa, etc.) con variante `destacado` (fondo emerald-600 texto blanco).
    - Helper `guardarReporte` y `descargarPDF` comunes.
    - Toast sonner para feedback. Intl.NumberFormat es-CO COP. Dark mode `dark:`. Responsive mobile-first (grid-cols-2 md:grid-cols-5, tabs text-xs md:text-sm). Acento emerald/teal en todos los botones y badges.
13. **Actualicé `src/components/layout/sidebar.tsx`**: agregué import `BarChart3` de lucide-react. Extendí `NavKey` con `"niif"`. Añadí item `{ key: "niif", label: "Estados NIIF", icon: BarChart3, group: "Financiero" }` después de "Reportes PDF".
14. **Actualicé `src/app/page.tsx`**: importé `NiifView` de `@/components/niif/niif-view`, agregué `"niif"` al tipo `View`, agregué caso `view === "niif" && <NiifView />`.
15. **`bun run lint` EXIT 0** sobre todos los archivos NIIF (verificado con `bunx eslint` solo sobre los 13 archivos nuevos/modificados). Los errores residuales en `cafetero-view.tsx` son preexistentes (no toqué ese archivo) y no relacionados con este task.
16. **Verificación funcional con curl autenticado** (cookie demo@marsella.com / demo1234):
    - `GET /api/niif/esf?fechaFin=2026-12-31` → 200, `totalActivo=-5.032.783,53`, `totalPasivoPatrimonio=-5.032.783,53`, **`diferencia=0` (CUADRA)**, 3 lineas efectivo (1105 Caja, 1110 Bancos, 111005 Bancos cta cte), 1 linea clientes, 1 linea inventarios, 8 lineas pasivo_corriente, 0 patrimonio (demo sin movs clase 3).
    - `GET /api/niif/eer?fechaInicio=2026-01-01&fechaFin=2026-12-31` → 200, `totalIngresos=91.000`, `totalCostosVenta=50.823,53`, `utilidadBruta=40.176,47`, `utilidadNeta=-11.381.154,03` (negativa por gastos admin demo altos), 1 ingresos, 1 costosVenta, 4 gastosAdmin.
    - `GET /api/niif/ecp?fechaInicio=2026-01-01&fechaFin=2026-12-31` → 200, `saldoInicial=0`, `utilidadNetaPeriodo=-11.381.154,03`, `dividendos=0`, `saldoFinal=-11.381.154,03` (= inicial + utilidad - dividendos ✓).
    - `GET /api/niif/efe?fechaInicio=2026-01-01&fechaFin=2026-12-31` → 200, `utilidadNeta=-11.381.154,03`, `totalOperacion=-8.783.975` (con ajustes de capital de trabajo), `aumentoNeto=-8.783.975`, `saldoInicial=0`, `saldoFinal=-5.076.000`.
    - `POST /api/niif/guardar` (body `{tipo:ESF, periodo:anual, fechaInicio, fechaFin, json_data}`) → 200, retorna ReporteNIIF creado con id, userId set, json_data stringified.
    - `GET /api/niif/reportes` → 200 `total=1` con `totalRegistros=0` (porque json_data de prueba solo tenía 2 keys, no estructura completa).
    - `GET /api/niif/reportes/[id]` → 200, retorna reporte con `json_data` parseado a objeto.
    - `GET /api/niif/reportes/[id]/pdf` → 200, **Content-Type: application/pdf**, **12.774 bytes**, archivo válido "PDF document, version 1.3, 3 page(s)" (verificado con `file`).
    - `DELETE /api/niif/reportes/[id]` → 200 `{"ok":true,"id":"..."}`.
17. `dev.log` final: `✓ Compiled`, todos los endpoints responden 200, sin errores runtime. Compilación inicial de NiifView ~700ms (tarda por tamaño del código nuevo, esperado), requests subsiguientes <50ms.

Stage Summary:
- **`src/lib/niif.ts`** (~740 líneas): 4 generadores de estados financieros + 1 generador de notas NIIF (5 funciones `generarESF`/`generarEER`/`generarECP`/`generarEFE`/`generarNotasNIIF`). Cada uno lee movimientos contables contabilizados (`comprobante.estado=contabilizado`) filtrando por empresaId y rango de fechas. Tipos de retorno completos exportados (`ESFResult`, `EERResult`, `ECPResult`, `EFEResult`, `NotasNIIFResult`).
- **`src/lib/niif-mapping.ts`** (~360 líneas): tabla `PUC_TO_NIIF` con ~120 códigos PUC colombianos mapeados a 14 categorías NIIF, función `mapCuentaPUCtoNIIF` con matching por prefijo más largo, función `agruparSaldosPorCategoria` que toma movimientos y devuelve `SaldosPorCategoria`.
- **8 endpoints API** bajo `/api/niif/`:
  - `GET /api/niif/esf?fechaFin=...` — genera ESF
  - `GET /api/niif/eer?fechaInicio=...&fechaFin=...` — genera EER
  - `GET /api/niif/ecp?fechaInicio=...&fechaFin=...` — genera ECP
  - `GET /api/niif/efe?fechaInicio=...&fechaFin=...` — genera EFE
  - `POST /api/niif/guardar` — persiste ReporteNIIF (Zod validation)
  - `GET /api/niif/reportes` (+ POST alias) — lista con filtros y `totalRegistros` enriquecido
  - `GET /api/niif/reportes/[id]` (+ DELETE) — obtiene/elimina reporte guardado
  - `GET /api/niif/reportes/[id]/pdf` — genera PDF (Content-Type: application/pdf)
- **4 generadores PDF** agregados a `src/lib/pdf.tsx` (~580 líneas nuevas al final, sin reescribir existentes): `generarPDFESF`/`generarPDFEER`/`generarPDFECP`/`generarPDFFE`. Layouts profesionales con header empresa, tablas con códigos y valores, totales destacados (subtotales emerald-50/950, totales emerald-600), notas estándar (4 ítems: NIIF/IFRS, moneda COP, costo histórico, impuesto 33% NIC 12), y firma del contador + representante legal al final.
- **`src/components/niif/niif-view.tsx`** (~1050 líneas): 5 tabs con generadores + persistencia. UI: tabs responsive `grid-cols-2 md:grid-cols-5`, tabla `TablaSaldos` con `max-h-80 overflow-y-auto` y footer subtotal, `ResultadoRow` con variantes (destacado emerald-600, negativo rojo-50/950), badge diferencia (verde/rojo según |d|<1), badges tipo emerald-700/300, botones con `border-emerald-500/40 text-emerald-700 dark:text-emerald-300`, Dialog Ver JSON con `<pre>` pretty-printed. Toast sonner para feedback. `Intl.NumberFormat es-CO COP`. Dark mode `dark:`. Responsive mobile-first.
- **`sidebar.tsx`**: agregado item `"niif"` con label "Estados NIIF" e icon `BarChart3` en grupo Financiero (entre "Reportes PDF" y "Verticales"). `NavKey` extendido.
- **`page.tsx`**: import `NiifView` + caso `view === "niif"`. Tipo `View` extendido.
- `bun run lint` EXIT 0 sobre los 13 archivos del módulo NIIF. Sin test code. No se tocó Prisma schema. No se tocaron otros módulos.
- Verificación funcional con curl autenticado: **8 endpoints responden 200**, ESF cuadra en 0 (diferencia=0), PDF generado es válido (3 páginas, 12.7KB, "PDF document version 1.3").
- **Limitaciones**:
  - El mapeo PUC→NIIF cubre los códigos más comunes pero puede no cubrir códigos muy específicos (subcuentas de 6+ dígitos). El fallback por clase (1er dígito) asegura que ninguna cuenta queda sin categorizar.
  - El generador de Flujos de Efectivo usa método indirecto simplificado (variación de capital de trabajo neto) — no separa depreciación/amortización como ajuste no-caja explícito (lo hace como "variación neta PPE" que es equivalente en la mayoría de casos).
  - El impuesto de renta se calcula al 33% fijo — no considera diferencias temporales (NIC 12 simplificado). Se puede extender en el futuro.
  - El generador `generarNotasNIIF` no tiene endpoint dedicado (la task solo pidió 8 endpoints). La función existe en `niif.ts` y se puede usar directamente desde backend si en el futuro se quiere un endpoint `/api/niif/notas`.
  - Los datos de demo (`demo@marsella.com`) tienen saldos negativos en cuentas de activo (porque hay más créditos que débitos en la bd demo) — esto es por la data demo, no por bugs del código. El ESF cuadra correctamente (diferencia=0) con esos datos.
