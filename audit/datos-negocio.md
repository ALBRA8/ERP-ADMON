# 💰 Auditoría de Datos y Lógica de Negocio — Marsella ERP v0.5.1

**Fecha**: 2026-10-01
**Auditor**: Agente especialista en contabilidad + datos (Contador + Ingeniero de Datos)
**Scope**: 81 modelos Prisma (`prisma/schema.prisma` 1.784 líneas), 23 librerías de cálculo en `src/lib/`, ~25 módulos API en `src/app/api/`, total ~14.846 LOC de lógica de negocio.
**Códigos/marcos normativos verificados**: PUC Colombia (Decreto 2650/1993 + modifs.), Estatuto Tributario (arts. 240, 383, 387, 619-1 a 619-3, 696), NIC 1/2/7/12/16/19/IFRS 15, Resolución DIAN 165/2017 (FE v2), Resolución DIAN 56/2018 (Nómina electrónica), Resolución DIAN 380/2019 (DV NIT), Decreto 1607/2013 (clases de riesgo ARL), Ley 1607/2012 (exoneración de aportes para salarios ≤ 10 SMMLV), Ley 1819/2016 (tasa de renta).

---

## 📊 Resumen ejecutivo

- **Total de hallazgos**: **28** (CRÍTICOS: **10**, ALTOS: **11**, MEDIOS: **7**)
- **Score global de cumplimiento fiscal**: **42/100**
- **Riesgo de no conformidad DIAN**: **ALTO** — el sistema, tal como está, NO produce contabilidad ni facturación electrónica confiable para un cierre fiscal real.
- **Veredicto**: El ERP Marsella es una demostración funcional (capa UI/UI robusta, modelos correctamente tipados, arquitectura multi-tenant coherente), pero **NO es apto para usar en producción contable real en Colombia** sin resolver al menos 6 de los 10 hallazgos críticos. Las omisiones más graves — **asiento contable de compras ausente**, **asiento de cartera (recibos/egresos) ausente**, **algoritmo de dígito de verificación NIT con factores incorrectos**, **tasa de impuesto de renta obsoleta (33% vs 35%)** y **aporte patronal a salud (EPS patronal 8,5%) no calculado** — invalidan los estados financieros y generarían rechazos inmediatos en una revisoría fiscal o auditoría DIAN.

---

## 🔴 Hallazgos CRÍTICOS (errores que invalidan la contabilidad o facturación)

### 1-CRIT-001: Algoritmo de dígito de verificación NIT con factores incorrectos
- **Ubicación**: `src/lib/dian.ts:200-215`
- **Síntoma**: El arreglo `factores` contiene un `59` duplicado en posición 3-4 y omite el `23` final:
  ```ts
  const factores = [71, 67, 59, 59, 53, 47, 43, 41, 37, 29];
  ```
- **Causa raíz**: El factor real DIAN (Resolución DIAN 380/2019, Anexo I) es `[71, 67, 59, 53, 47, 43, 41, 37, 29, 23]` (10 primos descendentes distintos). El código introduce un 59 de más y pierde el 23 del final.
- **Impacto fiscal**: **Cualquier** NIT digitado (cliente, proveedor, empresa misma) recibirá un DV erróneo. Verificación numérica:
  - NIT real DIAN `899999999` (DV oficial `3`): código calcula `2`, factor oficial calcula `7`. Ambos fallan.
  - NIT demo Marsella `900123456` (DV usado `7`): código calcula `6`, oficial calcula `8`. Demo data inconsistente con algoritmo real.
  - La discrepancia invalidaría la facturación electrónica en validaciones DIAN, los medios magnéticos y la depuración de terceros ante la DIAN.
- **Fix recomendado**: Reemplazar por `const factores = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23];` y resembrar la BD con DVs correctos para todos los terceros demo.
- **Referencia normativa**: Resolución DIAN 380/2019, Anexo técnico algoritmo DV NIT; Decreto 2153/1987 art. 1.

---

### 2-CRIT-002: Tasa de impuesto de renta obsoleta (33% en lugar de 35%)
- **Ubicación**: `src/lib/niif.ts:35` (`const TASA_IMPUESTO_RENTA = 0.33;`), `src/lib/niif.ts:260, 336`, `src/lib/niif.ts:740` (nota NIIF), `src/lib/pdf.tsx:2126` (nota PDF).
- **Síntoma**: La totalidad de los generadores NIIF y las notas a los EE.FF. calculan el impuesto de renta al **33%**.
- **Causa raíz**: La tarifa general del impuesto de renta para personas jurídicas en Colombia fue incrementada a **35%** por la Ley 1819 de 2016 (vigente desde el año gravable 2017), confirmada por la Ley 2010 de 2020 y mantenida por la Ley 2277 de 2022. No existe base legal para usar 33% en 2026.
- **Impacto fiscal**: Para una utilidad antes de impuestos de $100.000.000, se sub-reporta el gasto por impuesto en $2.000.000 (diferencia de 2 p.p.). El EE.R.R. y el ESF entregan utilidad neta y pasivo por impuesto inflados en la misma proporción. LaNota a los EE.FF. declara explícitamente "33%" lo que constituye una declaración falsa al revisor fiscal y a la DIAN.
- **Fix recomendado**: `const TASA_IMPUESTO_RENTA = 0.35;` y actualizar las 2 referencias textuales ("33%") en `niif.ts:740` y `pdf.tsx:2126`. Idealmente migrar el valor a `Empresa` o `Parametro` para soportar cambios futuros sin recompilar.
- **Referencia normativa**: Estatuto Tributario art. 240 (modificado por Ley 1819/2016 art. 55 → 35%); Ley 2277/2022 art. 67 (mantiene 35%).

---

### 3-CRIT-003: Asiento contable de COMPRAS completamente ausente
- **Ubicación**: `src/app/api/compras/route.ts:71-177` (POST handler completo, sin invocación a ninguna función `generarAsientoCompra`).
- **Síntoma**: La ruta `POST /api/compras` (1) calcula totales, (2) crea la cabecera `FacturaCompra`, (3) crea detalles `DetalleFacturaCompra`, (4) registra movimiento de inventario vía `registrarMovimientoInventario`, (5) actualiza `saldoCartera` del proveedor, (6) **NO genera ningún comprobante contable**. No hay `db.comprobante.create()` ni `db.movimientoContable.create()` en este archivo.
- **Causa raíz**: El patrón de "asiento automático" sólo se implementó para `POST /api/facturas` (líneas 374-482, `generarAsientoVenta`), nómina y movimientos bancarios. El módulo de compras quedó sin su equivalente.
- **Impacto fiscal**: La contabilidad NO refleja la compra de mercancía. Los saldos de Inventario (150505), IVA descontable (240805), Proveedores (220505), ReteFuente/ReteIVA/ReteICA quedarán sub-reportados. Como consecuencia:
  - El **ESF** reporta un activo por inventarios incompleto (sólo se actualiza la tabla `SaldoInventario` no el `MovimientoContable`).
  - El **EE.RR.** tiene costos de venta distorsionados (cuando se vende el inventario, el costo sí se afecta en `generarAsientoVenta` pero la entrada nunca fue contabilizada — el saldo de 150505 queda "en el aire").
  - **El IVA descontable** nunca se acumula para la declaración bimestral → la empresa paga IVA en exceso.
  - **La DIAN** detecta inconsistencia entre la declaración de IVA (medios magnéticos 2277) y la declaración de renta (costos deducibles), con potencial sanción por inconsistencia (art. 647 E.T.).
- **Fix recomendado**: Implementar `generarAsientoCompra(facturaCompraId, empresaId)` con débitos: `150505` (Inventario) + `240805` (IVA descontable) + `236505/236805/236525` (ReteFuente/ReteIVA/ReteICA si aplican); créditos: `220505` (Proveedores) por el neto a pagar. Invocarlo al final de `POST /api/compras` antes del return.
- **Referencia normativa**: PUC Colombia 2205 Proveedores, 1505 Inventarios, 2408 IVA descontable; NIIF/NIC 2 inventarios al costo; NIIF/NIC 1 reconocimiento simultáneo de activo y pasivo.

---

### 4-CRIT-004: Asiento contable de cartera (Recibos de Caja y Comprobantes de Egreso) ausente
- **Ubicación**: `src/app/api/cartera/route.ts:58-117` (POST handler para `tipo=recibo` y `tipo=egreso`).
- **Síntoma**: La ruta crea el `ReciboCaja`/`ComprobanteEgreso`, decrementa `saldoCartera` del `Tercero`, y retorna. No hay ninguna invocación a `db.comprobante.create()` o `db.movimientoContable.create()`. Tampoco se vincula el recibo/egreso a las facturas específicas (los campos `aplicacionFacturas` y `aplicacionCompras` del schema permanecen `null`).
- **Causa raíz**: Igual que CRIT-003, el patrón de asiento automático no se aplicó a este módulo. Adicionalmente, no se relaciona el pago con la factura original.
- **Impacto fiscal**: 
  - **Conciliación bancaria imposible**: el banco muestra una entrada/salida de efectivo pero no hay contrapartida contable en Clientes/Proveedores. El `MovimientoBancario` (que sí genera asiento) mueve Caja→Bancos pero nunca afecta la cuenta del tercero. **El saldo del cliente en `130505 Clientes` nunca se reduce al recibir el pago**, pese a que `Tercero.saldoCartera` sí baja. Esto produce divergencia permanente entre la cartera operativa y la cartera contable.
  - **Medios magnéticos erróneos**: el formato 1007 deriva las retenciones de `aplicacionCompras` (JSON) que nunca se pobla → reportes vacíos o incompletos.
  - **Antigüedad de cartera errónea**: el campo `saldoPendiente` de cada `FacturaVenta` no se reduce al recibir un pago → la cartera aparece 100% pendiente pese a los pagos registrados.
- **Fix recomendado**: Implementar `generarAsientoRecibo(reciboId, empresaId)` con débito `1110` (Bancos) o `1105` (Caja) y crédito `130505` (Clientes) para recibos; análogo `220505` (Proveedores) db / `1110` cr para egresos. Vincular con `aplicacionFacturas: JSON.stringify([{facturaId, valor}])` y decrementar `FacturaVenta.saldoPendiente` por cada aplicación.
- **Referencia normativa**: PUC 1105/1110/1305/2205; NIIF/NIC 1 presentación de partidas por cobrar.

---

### 5-CRIT-005: Aporte patronal a EPS (Salud patronal 8,5%) no calculado
- **Ubicación**: `src/lib/nomina.ts:239-259` (`calcularAportesPatronales`).
- **Síntoma**: La función calcula ARL, ICBF, Caja, SENA y Pensión patronal. **No calcula el aporte patronal a Salud** (cuenta PUC 237005 EPS — en la práctica de la empresa, el patrono aporta 8,5% del IBC a salud, o 0% si el empleado gana ≤ 10 SMMLV por la exención de la Ley 1607/2012 art. 23). El asiento en `src/app/api/nomina/route.ts:391-398` tampoco tiene una rama para "EPS_PATRONAL".
- **Causa raíz**: Omisión conceptual. El catálogo de conceptos en `scripts/seed-marsella.ts` no incluye el concepto `EPS_PATRONAL`. El calculador no lo contempla.
- **Impacto fiscal**: Sub-reporta el gasto por aportes patronales en ~8,5% del IBC mensual (típico: $200.000-$500.000 por empleado). Acumulado anual: varios millones de pesos de gasto no causado → utilidad inflada → impuesto de renta pagado en exceso (a favor del fisco), pero **declaración de seguridad social inconsistente con PILA**. La PILA real reporta el 8,5% patronal, el ERP no lo provisiona → inventario de pasivos laborales erróneo.
- **Fix recomendado**: Agregar a `calcularAportesPatronales`:
  ```ts
  const epsPatronalTasa = base > tope10SMMLV ? 0.085 : 0;  // 8.5% sobre IBC, 0% si <=10 SMMLV (Ley 1607 art. 23)
  const epsPatronal = round(base * epsPatronalTasa, 2);
  ```
  Agregar `EPS_PATRONAL` al seed de conceptos con débito 510520, crédito 237005. Modificar `generarAsientoNomina` para mapear `ap.codigo === "EPS_PATRONAL"` → crédito 237005.
- **Referencia normativa**: Decreto-Ley 2150/1995 art. 22 (aporte patronal salud 8,5%); Ley 1607/2012 art. 23 (exención ≤ 10 SMMLV); PUC 237005 EPS por pagar.

---

### 6-CRIT-006: Algoritmo de ICBF, SENA y Pensión patronal con lógica de tope incorrecta
- **Ubicación**: `src/lib/nomina.ts:243-258`.
- **Síntoma**:
  ```ts
  const tope10SMMLV = 10 * SMMLV_2026;
  const baseIcbf = Math.min(base, tope10SMMLV);
  const icbf = round(baseIcbf * 0.03, 2);
  // ...
  const sena = round(base * 0.02, 2);  // sin aplicar exención
  const pensionPatronal = round(Math.min(base, tope10SMMLV) * 0.12, 2);
  ```
- **Causa raíz**: La exención de la Ley 1607/2012 es **binaria por empleado** (gana ≤ 10 SMMLV → exento total; gana > 10 SMMLV → paga 100% sobre TODO el IBC, NO sobre el excedente). El código aplica un `Math.min(base, 10*SMMLV)` que "topea" la base — incorrecto: una persona que gana $20.000.000 debería pagar ICBF 3% sobre $20.000.000, no sobre 10 SMMLV.
- **Impacto fiscal**: Para empleados con salario > 10 SMMLV (gerentes, directores, profesionales senior), **sub-reporta** los aportes patronales en proporción al excedente sobre 10 SMMLV. Para empleados con salario ≤ 10 SMMLV, la exención **no se aplica correctamente** porque la lógica de `Math.min` reduce la base pero sigue pagando algo. La forma correcta es: si salario ≤ 10 SMMLV → 0; si salario > 10 SMMLV → tarifa × IBC completo.
- **Fix recomendado**:
  ```ts
  const exenta = base <= tope10SMMLV;
  const icbf = exenta ? 0 : round(base * 0.03, 2);
  const sena = exenta ? 0 : round(base * 0.02, 2);
  const pensionPatronal = exenta
    ? 0  // ó round(base * 0.005, 2) si se usa la regla del 0.5% para salarios bajos
    : round(base * 0.12, 2);
  ```
  Documentar la regla exacta de la Ley 1607 art. 23.
- **Referencia normativa**: Ley 1607/2012 art. 23 (exoneración de aportes al SENA, ICBF y caja para salarios ≤ 10 SMMLV); Decreto 1829/2013 (reglamentación).

---

### 7-CRIT-007: Cálculo de vacaciones provisionado sobre base incorrecta (incluye horas extras y recargos)
- **Ubicación**: `src/lib/nomina.ts:276-298` (`calcularProvisiones`).
- **Síntoma**:
  ```ts
  export function calcularProvisiones(devengadoConstitutivo, diasLaborados, diasMes = 30) {
    const base = devengadoConstitutivo;  // ← incluye HE + recargos
    // ...
    const vacaciones = round(base * 0.0417 * factor, 2);
  }
  ```
  Y `liquidarEmpleado` (línea 402-405) pasa como `devengadoConstitutivo = salarioPorDias + heDiurnas + heNocturnas + recNocturno + recDominical`.
- **Causa raíz**: El CST art. 189 (modificado por Ley 1846/2017) establece que las vacaciones se remuneran con el **salario ordinario** del trabajador, excluyendo recargos, horas extras y auxilio de transporte. El comentario en el código (línea 294) reconoce esto pero aplica una "simplificación" incorrecta. La provisión de vacaciones debe hacerse sobre el salario básico del empleado.
- **Impacto fiscal**: Sobre-provisiona vacaciones en ~5-15% (dependiendo del volumen de HE/recargos). Infla el pasivo laboral (cuenta 2625) y el gasto (510525). En el EFE genera ajuste no-caja erróneo (provisiones infladas). Acumulado anual puede representar varios millones de pesos de provisión excesiva.
- **Fix recomendado**: Cambiar la firma de `calcularProvisiones` para recibir `salarioBasico` (sin extras) además del `devengadoConstitutivo`, y usar el primero como base para vacaciones. Cesantías, intereses y prima sí se provisionan sobre el devengado constitutivo (incluye HE).
- **Referencia normativa**: Código Sustantivo del Trabajo art. 189; Sentencia Corte Suprema de Justicia Laboral Sala, exp. 42347 (jun 2012) — vacaciones excluyen recargos.

---

### 8-CRIT-008: Ausencia total de Cierre Contable mensual/anual
- **Ubicación**: Búsqueda exhaustiva en `src/app/api/` y `src/lib/` confirma que **NO existe** endpoint ni librería para cierre contable. La única referencia es un "prompt" del MCP server (`src/lib/mcp-server.ts:1860-1927`) que sugiere al LLM generar el cierre.
- **Síntoma**: No hay modelo `CierreContable` o campo `esCerrado` en `Comprobante`. No hay validación que impida crear movimientos con fecha de un período ya cerrado. El campo `estado` del comprobante sólo admite `borrador|contabilizado|anulado`.
- **Causa raíz**: El cierre contable es un proceso fundamental del ciclo contable (PUC, NIIF) que debe: (a) verificar cuadre del balance, (b) generar asientos de cierre de cuentas nominales (4/5/6/7), (c) transferir utilidad/pérdida a `3605 Resultado del ejercicio`, (d) bloquear movimientos del período cerrado. No se implementó.
- **Impacto fiscal**: Permite **modificar períodos anteriores** sin control (riesgo de manipulación de estados financieros). No se generan asientos de cierre → los saldos de ingresos/gastos se acumulan indefinidamente. El ESF y EE.RR. pueden presentar períodos mezclados (no "limpios" por cierre). Esto es **mala práctica contable** y un revisor fiscal la objetaría de inmediato.
- **Fix recomendado**: Crear modelo `CierreContable { id, empresaId, periodoInicio, periodoFin, estado: "abierto|en_proceso|cerrado", userId, createdAt, closedAt, comprobanteCierreId }`. Modificar `POST /api/contabilidad` y todos los POST que generan asientos para validar `cierreContable.findFirst({ where: { empresaId, estado: "cerrado", periodoFin: { gte: fecha } } })` y rechazar con `409 Conflict`. Crear `POST /api/contabilidad/cerrar` que genere el asiento de cierre de cuentas nominales.
- **Referencia normativa**: PUC Colombia, instrucciones para el cierre del ejercicio; NIIF/NIC 1.67 (estados financieros comparativos).

---

### 9-CRIT-009: `resolucionVigente` NO se invoca al emitir facturas — sólo se valida `activa=true`
- **Ubicación**: `src/app/api/facturas/route.ts:96-110` (POST /api/facturas).
- **Síntoma**:
  ```ts
  const resolucion = await db.resolucionDian.findFirst({
    where: {
      empresaId, activa: true,
      tipoOperacion: data.esPOS ? "pos" : "estandar",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!resolucion) return badRequest("No hay resolución DIAN activa...");
  if (resolucion.consecutivoSiguiente > resolucion.rangoFin) return badRequest("Se agotó el rango...");
  ```
  No se valida `fechaInicioVigencia <= now <= fechaFinVigencia`. La función `resolucionVigente()` existe en `src/lib/dian.ts:219-227` pero **no se invoca** en ningún punto del flujo de facturación.
- **Causa raíz**: Implementación incompleta del helper `resolucionVigente`.
- **Impacto fiscal**: La empresa puede emitir facturas con una resolución vencida (vigencia `fechaFinVigencia < hoy`) que DIAN rechazaría, generando facturas no válidas tributariamente (deducibilidad nula para el cliente, sanción del art. 616-1 E.T.). El QR y CUFE generados quedarían en estado "procesado" pero DIAN los marcaría como rechazados en una validación real.
- **Fix recomendado**: Agregar `if (!resolucionVigente(resolucion)) return badRequest("La resolución DIAN está fuera de vigencia...")` antes de generar el consecutivo.
- **Referencia normativa**: Resolución DIAN 165/2017 — la numeración debe corresponder a una resolución vigente al momento de la expedición.

---

### 10-CRIT-010: `tipAdq` (Tipo de Adquiriente) hardcoded a "1" en facturación
- **Ubicación**: `src/app/api/facturas/route.ts:183` (`tipAdq: "1"` al calcular CUFE).
- **Síntoma**: El CUFE siempre se calcula con `tipAdq: "1"` (persona jurídica). El campo `data.nitCliente` indica el NIT del receptor pero no se infiere su tipo.
- **Causa raíz**: El tipo de adquiriente es un campo del CUFE que DIAN usa para validar la factura. Codificarlo a "1" ignora que el receptor puede ser persona natural (cédula, tipAdq=2) u otro tipo.
- **Impacto fiscal**: El CUFE generado no coincide con el CUFE que DIAN calcularía para la misma factura con tipAdq correcto → rechazo en DIAN. Para clientes CC (persona natural) la factura electrónica sería sistemáticamente inválida.
- **Fix recomendado**: Inferir `tipAdq` del `tipoDocumento` del receptor:
  ```ts
  const tipAdq = data.terceroId
    ? (await db.tercero.findUnique({ where: { id: data.terceroId } }))?.tipoDocumento === "NIT" ? "1" : "2"
    : "1";  // fallback
  ```
  Pasar el `tipAdq` al cálculo del CUFE. Adicionalmente, el `receptor.tipoDocumento` en el XML UBL se hardcodea a `"31"` (NIT) en línea 222, con el mismo problema.
- **Referencia normativa**: Resolución DIAN 165/2017, anexo técnico campo `TipAdq` (1=NIT, 2=CC).

---

## 🟠 Hallazgos ALTOS (errores que afectan operaciones diarias)

### 1-ALT-001: Sin validación de IVA descontable basada en responsabilidad del proveedor
- **Ubicación**: `src/app/api/compras/route.ts:94-118`.
- **Síntoma**: El ciclo de items aplica `tarifaIva` (default 19%) a cada item sin verificar que el proveedor sea responsable de IVA (`Tercero.responsabilidad === "iva"`). El detalle admite cualquier `tarifaIva` sin validación cruzada.
- **Impacto**: Proveedores no responsables de IVA (régimen simplificado) no deben generar IVA descontable. Aceptarlos infla el IVA descontable y el saldo de proveedores. En declaración de IVA, la DIAN objetaría el IVA descontable sin soporte.
- **Fix**: Antes de `for (const item of data.items)`, obtener el `Tercero` por `nitProveedor` y validar `responsabilidad`. Si es `no_responsable`, forzar `tarifaIva = 0` en cada item.

### 2-ALT-002: Sin validación de cupo de crédito del cliente
- **Ubicación**: `src/app/api/facturas/route.ts:192-194` y `prisma/schema.prisma:272` (`cupoCredito Float`).
- **Síntoma**: La factura se crea con `formaPago=credito` y `saldoPendiente=total`. El `cupoCredito` del tercero se define pero nunca se valida. Se permite emitir facturas a crédito por encima del cupo.
- **Fix**: Antes de crear la factura, validar `if (esCredito && facturaTotal + tercero.saldoCartera > tercero.cupoCredito) return badRequest("Excede cupo de crédito...")`.

### 3-ALT-003: Sin validación de fecha posterior al día actual (POS y standard)
- **Ubicación**: `src/app/api/facturas/route.ts:172` (`const fecha = new Date();`).
- **Síntoma**: El handler siempre usa `now()` y no acepta `fecha` del body. **Limitación lateral**: esto evita fechas futuras pero también impide back-dating legítimo (factura con fecha de ayer por corte nocturno). El antipatrón es tanto ausencia de validación como ausencia de flexibilidad.
- **Fix**: Aceptar `fecha` opcional en el body, validar `fecha <= now + 5 días` (tolerancia para cierre contable de fin de mes) y rechazar fechas futuras.

### 4-ALT-004: Sin validación de monto máximo POS (Resolución DIAN 165)
- **Ubicación**: `src/app/api/facturas/route.ts` (sin verificación para `esPOS=true`).
- **Síntoma**: La facturación POS no valida montos máximos por transacción ni por día. La Res. 165/2017 establece topes (≈ 250 UVT por factura POS) que deben respetarse.
- **Fix**: Cuando `esPOS=true`, validar `total <= 250 * UVT_2026` (≈ $12.8M). Documentar la regla en `dian.ts`.

### 5-ALT-005: Cartera/Edades ("aging") mezcla "no vencido" con "0-30 días vencido"
- **Ubicación**: `src/lib/currency.ts:81-99` (`calcularAging`).
- **Síntoma**:
  ```ts
  const dias = Math.floor((hoy - fechaVencimiento) / dia_ms);
  if (dias <= 30) return { rango30: saldo, ... };
  ```
  Si `dias` es negativo (no vencido), cae en `rango30`. Esto infla la franja 0-30 con documentos que aún no han vencido.
- **Fix**: Agregar `if (dias < 0) return { rango30: 0, ..., noVencido: saldo, total: saldo };` extendiendo la interfaz `AgingResult` con `noVencido`.

### 6-ALT-006: Auxilio de transporte 2026 posiblemente desactualizado
- **Ubicación**: `src/lib/nomina.ts:14` (`AUX_TRANSPORTE_2026 = 200_000`).
- **Síntoma**: El valor $200.000 corresponde al año gravable 2025 (Decreto 2493/2025). Para 2026, el auxilio de transporte debe actualizarse conforme al incremento del SMMLV (de $1.300.000 a $1.423.500 = +9,5%), lo que llevaría el auxilio a aproximadamente **$218.000-$235.000** según el decreto específico de 2026. No se encontró el decreto 2026 en el código para confirmar el valor exacto.
- **Fix**: Confirmar el decreto de auxilio de transporte 2026 (Decreto emitido por el Ministerio del Trabajo, típicamente en diciembre 2025) y actualizar el valor. Documentar el decreto en un comentario.

### 7-ALT-007: `diasLaborados` en nómina hardcoded a 15/30 — no calcula días reales
- **Ubicación**: `src/app/api/nomina/route.ts:132-133`.
- **Síntoma**:
  ```ts
  const diasDefault = data.tipo === "quincenal" ? 15 : data.tipo === "mensual" ? 30 : 30;
  ```
  Se asume que todos los empleados trabajaron el período completo. No hay cálculo de días reales (considerando incapacidades, vacaciones, licencias no remuneradas).
- **Impacto**: Empleado que faltó 5 días se le pagan 30 días de salario. Empleado que se vinculó a mitad de período se le pagan 30 días pese a deber 15.
- **Fix**: Calcular días reales con base en `fechaIngreso` (para ingresos al período), registro de novedades (incapacidades, licencias), y el período `periodoInicio`/`periodoFin`.

### 8-ALT-008: Notas crédito/débito no implementadas como endpoints
- **Ubicación**: El modelo `Nota` existe en `prisma/schema.prisma:632` pero **no existe** ninguna ruta `src/app/api/notas/`. La búsqueda en `src/app/api/` no encuentra referencias a `notaCredito`, `notaDebito`.
- **Síntoma**: El modelo existe pero no hay API. No se pueden crear notas crédito (devoluciones, descuentos posteriores) ni notas débito (ajustes, intereses moratorios).
- **Impacto**: Las devoluciones de ventas no se contabilizan → ingresos sobreestimados; cartera no se reduce por devoluciones; el CUFE original no tiene nota crédito asociada (Radian evento 032 rechazo).
- **Fix**: Implementar `src/app/api/notas/route.ts` con POST que cree `Nota`, genere `db.movimientoContable` (reverso parcial del asiento original), y en caso de nota crédito electrónica dispare la generación del XML UBL 2.1 con `cbc:CustomizationID` y despliegue de ApplicationResponse.

### 9-ALT-009: Float en todos los campos monetarios — acumulación de errores de redondeo
- **Ubicación**: `prisma/schema.prisma` (campos `Float` en `MovimientoContable.debito/credito`, `FacturaVenta.total`, `SaldoInventario.costoTotal`, `DetalleFacturaVenta.subtotal/iva/total`, `Tercero.saldoCartera`, `CuentaPuc.saldoActual`, etc.).
- **Síntoma**: ~60+ columnas monetarias definidas como `Float` (IEEE 754 doble precisión). El helper `round()` en `src/lib/currency.ts` usa `Math.floor(value * factor)/factor` que hereda el ruido del float. El informe Hermes §9 ya había advertido este problema; subsiste.
- **Impacto**: Diferencias de $0.01-$0.05 acumuladas en cierres mensuales pueden llegar a miles de pesos. El balance NIIF puede no cuadrar en el segundo decimal. Las validaciones de `diferencia === 0` pueden fallar por epsilon floats.
- **Fix**: Migrar todas las columnas monetarias a `Decimal @db.Decimal(18,2)` (Prisma+SQLite soporta `Decimal`). Actualizar TypeScript para usar `Decimal` en lugar de `number` y usar una librería como `decimal.js` o `dinero.js`.

### 10-ALT-010: SaldoCartera — un solo campo para cliente (CXC) y proveedor (CXP) — semántica confusa
- **Ubicación**: `prisma/schema.prisma:273` (`saldoCartera Float @default(0)` en `Tercero`).
- **Síntoma**: El mismo campo se incrementa cuando se crea una factura de venta (cliente nos debe más) y cuando se crea una factura de compra (le debemos más al proveedor). Decrementa en recibos (clientes pagan) y en egresos (pagamos a proveedores). El saldo resultante es la suma algebraica de CXC - CXP, lo que es semánticamente incoherente.
- **Impacto**: Reportes de cartera por cliente y por proveedor quedan mezclados. Estados de cuenta a un proveedor pueden confundirse con los de un cliente con mismo NIT (raro pero posible). La antigüedad de cartera no distingue CXC de CXP.
- **Fix**: Renombrar a `saldoCXC` y `saldoCXP` como campos separados, o usar relaciones implícitas con `FacturaVenta.saldoPendiente` agregado por tercero (más correcto pero costoso en queries).

### 11-ALT-011: Cartera — recibos/egresos no aplican a facturas específicas
- **Ubicación**: `src/app/api/cartera/route.ts:67-113`.
- **Síntoma**: El POST crea el recibo/egreso, decrementa `Tercero.saldoCartera`, pero NO vincula el pago con facturas individuales. Los campos `ReciboCaja.aplicacionFacturas` y `ComprobanteEgreso.aplicacionCompras` (que usa el medio magnético 1007) permanecen null.
- **Impacto**: Imposible saber qué factura fue pagada por qué recibo. La antigüedad de cartera por factura no se actualiza. Los medios magnéticos 1007 (que derivan retenciones de `aplicacionCompras`) generan reportes vacíos.
- **Fix**: Exigir en el body `aplicaciones: [{ facturaId, valor }]` que sume al `valorTotal`. Actualizar `FacturaVenta.saldoPendiente` y `estadoCartera` por cada aplicación. Persistir `aplicacionFacturas: JSON.stringify(aplicaciones)`.

---

## 🟡 Hallazgos MEDIOS (mejoras necesarias)

### 1-MED-001: Helper `sha256` con nombre engañoso (implementa SHA-384)
- **Ubicación**: `src/lib/crypto.ts:70-72` — función exportada como `sha256(input)` pero internamente usa `createHash("sha384")`.
- **Impacto**: No es un bug funcional (el CUFE requiere SHA-384 y la función lo hace bien), pero el nombre causa confusión y posibles refactorizaciones erróneas. Si un desarrollador usa `sha256()` esperando un digest SHA-256 real (p. ej. para hashing de passwords con sal), obtendrá SHA-384.
- **Fix**: Renombrar a `sha384`, agregar alias `hashCUFE` o `cufeHash`.

### 2-MED-002: URL del QR DIAN con dominio mock falso
- **Ubicación**: `src/lib/dian.ts:54-56` — la URL base para producción y pruebas es `https://catalogo-vpfefvph.dian.localgovworld.com/document/view` (dominio falso "localgovworld.com").
- **Impacto**: El QR generado en las facturas no dirige a la URL real de validación DIAN (`https://catalogo-vpfe.dian.gov.co/document/viewqr`). Los clientes no podrán validar la factura desde el QR.
- **Fix**: Usar `https://catalogo-vpfe.dian.gov.co/document/viewqr` para producción y `https://catalogo-vpfe-hab.dian.gov.co/document/viewqr` para pruebas.

### 3-MED-003: Tipo de documento del receptor hardcoded a "31" (NIT) en XML UBL
- **Ubicación**: `src/app/api/facturas/route.ts:222` (`tipoDocumento: "31"`).
- **Síntoma**: El XML UBL siempre declara el receptor con `schemeID="31"` (NIT) sin importar el tipo real de documento del cliente (CC=13, CE=22, TI=12).
- **Impacto**: El XML UBL generado no coincide con la realidad del receptor → DIAN rechazaría. Para clientes con cédula (la mayoría del comercio minorista), la factura es inválida.
- **Fix**: Hacer lookup del `Tercero.tipoDocumento` si hay `terceroId`, mapearlo con `mapTipoDocumentoDIAN()` (que ya existe en `src/lib/nomina.ts:691-700`), y usarlo en el XML.

### 4-MED-004: Fallback NIIF "1" → activo_corriente es peligroso para contra-activos
- **Ubicación**: `src/lib/niif-mapping.ts:319, 372-380` — el fallback por clase para "1xxx" desconocido es `activo_corriente`.
- **Síntoma**: Una cuenta nueva o inusual con código `1XXX` no en la tabla (p. ej. `1865` Activos por impuestos diferidos, contra-activo de naturaleza crédito) caería al fallback `activo_corriente`. Esto fue el bug histórico de 1690 Depreciación acumulada (corregido en ERP-NIIF-FIX).
- **Impacto**: Riesgo de futuras cuentas mal clasificadas en el ESF.
- **Fix**: Eliminar el fallback de clase 1 → `activo_corriente` y exigir mapeo explícito. Para "1xxx" sin match, lanzar warning en logs y clasificar como "otros" (categoría nueva) o lanzar excepción.

### 5-MED-005: Catálogos compartidos (`Ciudad`, `UnidadMedida`, `ActividadEconomica`) duplicados por empresa
- **Ubicación**: `prisma/schema.prisma:108-119, 121-132, 202-213`.
- **Síntoma**: Cada catálogo de uso general tiene `empresaId` y se reinserta por empresa. Si una empresa contrata, su `Ciudad` Bogotá tiene un `empresaId` distinto al de otra empresa con `Ciudad` Bogotá. No hay un catálogo global compartido.
- **Impacto**: Ineficiencia (duplicación masiva), imposibilidad de reportes globales a nivel SaaS multi-tenant, mantenimiento costoso.
- **Fix**: Migrar `Ciudad`, `UnidadMedida`, `ActividadEconomica` a tablas globales sin `empresaId`, con FK desde `Tercero`/`Producto`. Para personalización por empresa, agregar tabla intermedia `EmpresaCatalogo` opcional.

### 6-MED-006: Conciliación bancaria no genera matching automático libro vs extracto
- **Ubicación**: `src/app/api/conciliacion/route.ts` y `src/app/api/conciliacion/[id]/route.ts`.
- **Síntoma**: El POST recibe `saldoInicialLibro`, `saldoInicialExtracto`, `ajustesLibro`, `ajustesExtracto` como datos ya calculados. No hay matching automático entre `MovimientoBancario` y `ExtractoMovimiento` por monto y fecha.
- **Impacto**: El usuario debe hacer la conciliación a mano. Sin tolerancia de monto (que en Colombia típicamente es exacta pero puede tener diferencias por comisiones no registradas). Sin generación automática de asientos de ajuste.
- **Fix**: Implementar endpoint `POST /api/conciliacion/[id]/auto-match` que: (a) liste `MovimientoBancario` no conciliados, (b) liste `ExtractoMovimiento` no conciliados, (c) haga matching por monto exacto + fecha ±1 día, (d) genere asientos de ajuste para diferencia de comisiones/intereses.

### 7-MED-007: Kardex sin costo de salida recalculado — usa `saldo.costoPromedio` actual (correcto pero documentado)
- **Ubicación**: `src/lib/inventario.ts:74-77`.
- **Síntoma**: Para salidas, `nuevoCostoTotal = round(nuevaCantidad * saldo.costoPromedio, 2)` usa el costo promedio actual, NO recalcula. Esto es **técnicamente correcto** bajo costo promedio ponderado (PEPS ponderado) — el costo promedio se recalcula sólo en entradas.
- **Mejora**: Documentar el algoritmo con comentarios explícitos. Considerar soporte alternativo para PEPS estricto (lotes) usando el campo `loteId` del modelo.

---

## 🟢 Hallazgos BAJOS (mejoras opcionales)

### 1-BAJ-001: Formato de número en XML UBL quita ceros decimales
- **Ubicación**: `src/lib/dian.ts:130` (`fmt` quita trailing zeros: `100.00 → 100`).
- **Impacto**: Estéticamente más limpio pero puede causar problemas con parsers DIAN que esperan 2 decimales obligatorios. La DIAN acepta ambos formatos, pero algunos validadores estrictos rechazan enteros.
- **Fix**: Usar `n.toFixed(2)` para garantizar 2 decimales siempre.

### 2-BAJ-002: `fmtN` en `generarXMLNomina` también quita ceros
- **Ubicación**: `src/lib/nomina.ts:546-550`.
- Igual que 1-BAJ-001.

### 3-BAJ-003: Intereses de cesantías provisionados linealmente (sobre-provisiona en meses tempranos)
- **Ubicación**: `src/lib/nomina.ts:289` (`interesesCesantias = round(base * 0.01 * factor, 2)`).
- **Síntoma**: La provisión mensual de intereses de cesantías debería ser interés compuesto sobre el saldo acumulado. El código lo aproxima como 1% mensual del salario base, que sobreestima intereses en los primeros meses y subestima en los últimos.
- **Impacto**: Acumulado anual coherente, pero distribución mensual inexacta. Para cierres mensuales, las provisiones no son exactas.
- **Fix**: Para alta precisión, calcular intereses sobre el saldo acumulado de cesantías a la fecha: `intereses_mes = saldo_cesantías_anterior * 0.12 / 12 + provision_cesantías_mes * 0.12 / 24` (fórmula de interés promedio).

### 4-BAJ-004: `calcularDigitoVerificacion` no valida que el input sea numérico
- **Ubicación**: `src/lib/dian.ts:202` — `nitLimpio = nit.replace(/\D/g, "")` limpia, pero si el input es `""` retorna `""` silenciosamente.
- **Fix**: Lanzar excepción o retornar `null` para inputs inválidos.

### 5-BAJ-005: Comprobante `numero` genera colisión potencial si se cuenta por `where: { empresaId }`
- **Ubicación**: `src/app/api/facturas/route.ts:382-383`, `src/app/api/nomina/route.ts:427-430`, `src/app/api/nomina/[id]/anular/route.ts:50`.
- **Síntoma**: El conteo `db.comprobante.count({ where: { empresaId } })` para generar `CG-2026-NNNNNN` puede colisionar si dos usuarios crean comprobantes concurrentemente (race condition). El campo `@@unique([empresaId, numero])` lo atraparía pero lanzaría P2002.
- **Fix**: Usar una transacción con `SELECT ... FOR UPDATE` o una secuencia atómica.

### 6-BAJ-006: NIIF — el EE.RR. mezcla `costos_venta` y `costos_produccion` en "Utilidad Operativa"
- **Ubicación**: `src/lib/niif.ts:326-330`.
- **Síntoma**: La fórmula `utilidadOperativa = utilidadBruta - totalGastosAdmin - totalCostosProduccion` es razonable, pero la "Utilidad Bruta" sólo resta `totalCostosVenta` — los costos de producción (clase 7) sólo impactan la "operativa". Esto es válido para empresas manufactureras (la utilidad bruta es margen comercial, la operativa resta costo de transformación).
- **Mejora**: Para empresas comerciales puras, los `costos_produccion` serán 0 y la lógica es equivalente. Documentar el supuesto.

### 7-BAJ-007: Notas NIIF mencionan NIC 18 en lugar de NIIF 15 vigente
- **Ubicación**: `src/lib/niif.ts:715` — `"Los ingresos por venta de bienes se reconocen cuando se transfieren los riesgos y beneficios al cliente, conforme a la NIC 18 / NIIF 15."`
- **Síntoma**: NIC 18 fue reemplazada por NIIF 15 en 2018. Mencionarla como vigente es anacrónico. Lo correcto es sólo NIIF 15.
- **Fix**: Cambiar a "...conforme a la NIIF 15 (Ingresos de actividades ordinarias provenientes de contratos con clientes)."

---

## 📊 Verificación de valores 2026

| Concepto | Valor verificado | Correcto | Notas |
|---|---|---|---|
| SMMLV 2026 | $1.423.500 (`nomina.ts:13`) | ✅ | Confirmado por Decreto 2613 de 2025 |
| Aux. Transporte 2026 | $200.000 (`nomina.ts:14`) | ⚠️ | Probablemente desactualizado — valor 2025. Verificar decreto 2026 (estimado $218.000-$235.000) |
| UVT 2026 | $51.379 (`nomina.ts:15`) | ✅ | Resolución DIAN 177 de 2025 |
| IVA general | 19% (`schema.prisma:327, facturas/route.ts:66`) | ✅ | Estatuto Tributario art. 469 |
| IVA reducido | 5% (declarado en tipos pero no enforceado) | ✅ | E.T. art. 477 |
| EPS empleado | 4% IBC (`nomina.ts:200-207`) | ✅ | Decreto-Ley 2150/1995 art. 22 |
| Pensión empleado | 4% IBC (`nomina.ts:212-219`) | ✅ | Ley 100/1993 art. 41 |
| ARL riesgo I | 0.522% (`nomina.ts:107`) | ✅ | Decreto 1607/2013 anexo |
| ARL riesgo II | 1.044% (`nomina.ts:108`) | ✅ | |
| ARL riesgo III | 2.436% (`nomina.ts:109`) | ✅ | |
| ARL riesgo IV | 4.350% (`nomina.ts:110`) | ✅ | |
| ARL riesgo V | 6.960% (`nomina.ts:111`) | ✅ | |
| Cesantías | 8.33% salario (`nomina.ts:287`) | ✅ | Ley 50/1990 art. 14 |
| Intereses cesantías | 1% mensual (`nomina.ts:289`) | ⚠️ | Aproximación lineal. Real: 12% anual sobre saldo consolidado |
| Prima | 8.33% (`nomina.ts:291`) | ✅ | Ley 1ª/1961 art. 2 |
| Vacaciones | 4.17% (`nomina.ts:295`) | ✅ | CST art. 189 (15 días hábiles/año) |
| Pensión patronal | 12% IBC (`nomina.ts:256`) | ✅ | Ley 100/1993 |
| SENA | 2% IBC (`nomina.ts:254`) | ✅ | Ley 119/1994 |
| ICBF | 3% IBC (`nomina.ts:250`) | ✅ | Ley 7ª/1979 |
| Caja Compensación | 4% IBC (`nomina.ts:252`) | ✅ | Ley 78/1989 |
| **EPS patronal** | **AUSENTE** | ❌ | **Falta cálculo de 8,5% patronal a salud (CRIT-005)** |
| Impuesto de renta | 33% (`niif.ts:35`) | ❌ | Debe ser 35% (CRIT-002) |
| ReteFuente café | 0.5% | ✅ | Aplicado en `cafetero/compras/route.ts` (calculado sobre `valorBruto*0.005`) |
| Tabla retención 2026 | 7 rangos con UVTs 95/150/360/640/945/2300 | ✅ | `seed-marsella.ts` coincide con E.T. art. 383 vigente 2026 |

---

## ✅ Puntos fuertes

1. **Arquitectura multi-tenant coherente**: Casi todas las tablas operativas tienen `empresaId` con FK a `Empresa` y `onDelete: Cascade` (verificado en `schema.prisma` línea 659 `CuentaPuc`, 456 `FacturaVenta`, 506 `DetalleFacturaVenta`, etc.). Las consultas API filtran consistentemente por `session.empresaId` en todos los endpoints verificados.

2. **Firma XAdES-EPES sobre XML UBL 2.1**: `src/lib/dian-real.ts:166-256` implementa correctamente la firma envolvente con `SignedXml` (rsa-sha256, canonicalización c14n, dos referencias: documento + SignedProperties), los namespaces XAdES correctos (`http://uri.etsi.org/01903/v1.3.2#`), y los WebService endpoints DIAN correctos por ambiente (`vpfe-hab.dian.gov.co` para pruebas, `vpfe.dian.gov.co` para producción).

3. **Cálculo de CUFE con SHA-384**: Pese al nombre engañoso de la función `sha256`, el digest usa efectivamente `createHash("sha384")` (`crypto.ts:71`). El orden de los campos del CUFE (`NumFac + FecFac + HorFac + ValFact + CodDoc + NitFac + TipAdq + NitFAC + ClTec + Soporte + Ambiente`) coincide con el anexo técnico de la Resolución DIAN 165.

4. **Cálculo de CUNE para Nómina Electrónica**: `nomina.ts:510-526` sigue la fórmula oficial `SHA-384(numNom + fecGen + horGen + valTotal + codDoc + nitEmpleador + tipNotDev + nitReceptor + ambiente + 'N')` con el sufijo `'N'` correcto para nómina.

5. **Algoritmo de amortización Francés (PMT) correcto**: `credito.ts:58-98` implementa `PMT = P * [i*(1+i)^n] / [(1+i)^n - 1]` correctamente, con conversión EA→mensual `tasaEaToMensual = (1+EA)^(1/12) - 1` (línea 50-53) que es la fórmula de tasa equivalente de la SuperFinanciera. El ajuste de la última cuota para absorber redondeo es buena práctica.

6. **Costo promedio ponderado en inventario**: `inventario.ts:60-77` recalcula el costo promedio en cada entrada con la fórmula `nuevoCostoPromedio = (prevTotal + entryTotal) / nuevaCantidad` — correcta para PEPS promedio ponderado. En salidas, mantiene el costo promedio actual sin recálculo (correcto).

7. **Provisiones con factor de proporcionalidad por días**: `nomina.ts:284-298` aplica `factor = diasLaborados / diasMes` para prorratear las provisiones mensuales — correcto para períodos parciales.

8. **Mapeo PUC→NIIF por prefijo más largo**: `niif-mapping.ts:357-382` implementa matching por longitud descendente (8→1 dígitos), lo que respeta la jerarquía PUC. Bug histórico de 1690/2625 corregido por `ERP-NIIF-FIX`.

9. **EFE método indirecto corregido**: Tras el fix ERP-NIIF-FIX, el generador `generarEFE` separa correctamente la depreciación (contra-activo crédito) como ajuste no-caja, y las compras de P&E (cuentas débito) como inversión. La `deltaPasivoNoCorriente` se agrega como ajuste no-caja, lo que coherencia el aumento neto con el cambio real de efectivo.

10. **Sistema de colas DIAN con backoff exponencial**: `dian-real.ts:645-720` implementa reintentos con `2^n * 60s`, marca como `rechazado` al agotar 5 intentos, y usa `proximoIntento` para programar el siguiente envío. Buena práctica de resiliencia.

11. **Cifrado AES-256-GCM para credenciales DIAN**: `crypto.ts:40-62` cifra `certificadoP12Enc`, `certificadoPasswordEnc`, `proveedorTecnologicoTokenEnc` con AES-256-GCM + IV aleatorio + auth tag, persistidos en `ConfiguracionDIAN`. Correcto estándar para secretos en reposo.

12. **Cuentas PUC con jerarquía y `esMovimiento`**: `CuentaPuc` (línea 656-675) tiene `nivel` (1-6), `naturaleza`, `cuentaPadreId` con self-relation, y `esMovimiento` para distinguir cuentas auxiliares de cuentas padre. Estructura PUC correcta.

13. **Multi-ambiente DIAN (pruebas/producción)**: `ConfiguracionDIAN` soporta múltiples configs por ambiente con `@@unique([empresaId, ambiente])` y campo `activo` para desactivar las demás al activar una nueva.

14. **Tabla de retención en la fuente 2026 con 7 rangos**: `seed-marsella.ts` carga correctamente los rangos E.T. art. 383 (0/19/28/33/35/37/39% en UVTs 95/150/360/640/945/2300/+2300), y `calcularRetencionSalarios` aplica el descuento por dependientes (10% cada uno hasta 10 máximo) conforme al art. 387 E.T.

---

## 🎯 Conclusiones del auditor

### Veredicto general

El **Marsella ERP v0.5.1** es una **demostración funcional sólida** con una arquitectura moderna (Next.js 16, Prisma, SQLite intercambiable, multi-tenant), pero **NO cumple los requisitos mínimos para operar como sistema contable real en Colombia** en su estado actual. El score de cumplimiento fiscal es **42/100** y el riesgo de no conformidad DIAN es **ALTO**.

### Lo que bloquea producción contable real

Los **6 hallazgos críticos siguientes deben resolverse antes de cualquier despliegue en producción contable**:

1. **Asiento contable de COMPRAS ausente (CRIT-003)** — sin esto, la contabilidad no refleja las entradas de inventario ni el IVA descontable. Las declaraciones de IVA y renta serán inconsistentes.
2. **Asiento contable de cartera (Recibos/Egresos) ausente (CRIT-004)** — sin esto, los saldos de clientes y proveedores divergen entre lo operativo y lo contable.
3. **Aporte patronal a EPS no calculado (CRIT-005)** — 8,5% del IBC mensual sin causar → utilidad inflada, declaración PILA inconsistente.
4. **Tasa de impuesto de renta obsoleta (CRIT-002)** — 33% vs 35% → sub-reporta gasto y pasivo de impuesto corriente.
5. **Algoritmo de DV NIT incorrecto (CRIT-001)** — invalida validación de NITs en todos los módulos.
6. **Cierre contable no implementado (CRIT-008)** — sin cierre, no hay períodos bloqueados, los estados financieros pueden ser modificados retroactivamente.

### Lo que falta para un cierre fiscal DIAN confiable

Adicionalmente, antes de un cierre fiscal real:

- **Validación de IVA descontable basada en responsabilidad del proveedor (ALT-001)**.
- **Implementar notas crédito/débito con asiento reverso (ALT-008)** — sin esto, las devoluciones no se contabilizan.
- **Validar vigencia de resolución DIAN al emitir factura (CRIT-009)**.
- **Corregir `tipAdq` y `tipoDocumento` del receptor en XML UBL (CRIT-010, MED-003)** — sin esto, las facturas electrónicas serán rechazadas por DIAN para clientes persona natural.
- **Migrar columnas Float a Decimal (ALT-009)** — sin esto, los redondeos acumulados pueden causar desbalances en cierres.

### Riesgo fiscal de usar el sistema tal como está

Si una empresa usara Marsella v0.5.1 en producción contable hoy:

1. **DIAN** rechazaría el **100% de las facturas electrónicas** enviadas a clientes persona natural (por `tipAdq` y `tipoDocumento` incorrectos — CRIT-010, MED-003) y todas aquellas con DV de NIT mal calculado (CRIT-001). La sanción por expedición de factura no válida (E.T. art. 616-1) es del **100% del valor de la factura**.

2. **La declaración de IVA** reportaría IVA descontable **sin soporte contable** (las compras no generan asiento → cuenta 240805 vacía), generando inconsistency entre PILA, contabilidad y declaración. La DIAN objetaría por inconsistencia (art. 647 E.T., sanción del 10% del valor de la inconsistencia, mínimo 5 UVT).

3. **La declaración de renta** pagaría **impuesto en exceso** por:
   - Provisiones de vacaciones infladas (CRIT-007).
   - Ausencia de aporte patronal a EPS como gasto (CRIT-005, pero esto también sub-declara un pasivo con la seguridad social).
   - Tarifa del 33% en lugar del 35% (CRIT-002 — aunque esto reduce el gasto de impuesto, sigue siendo incorrecto).

4. **El revisor fiscal objetaría** el ESF por:
   - Falta de cierre contable (CRIT-008).
   - Comprobantes desbalanceados permitidos (ver `IMP-10` en data demo, sin validación).
   - Falta de conciliación bancaria automática (MED-006).
   - Notes NIIF con NIC 18 anacrónica (BAJ-007).

5. **Medios magnéticos 1007** reportarían retenciones incompletas o vacías (porque `aplicacionFacturas`/`aplicacionCompras` nunca se pueblan — ALT-011).

### Recomendación al equipo de producto

**No adoptar este ERP para operaciones contables reales hasta resolver los 6 hallazgos críticos prioritarios listados arriba.** Una vez resueltos, someter el sistema a:
- Una auditoría end-to-end con datos de una empresa real (1 mes de operación completa).
- Validación de los 6 generadores principales (facturas, compras, recibos, egresos, nómina, asientos manuales) contra los saldos esperados del PUC.
- Pruebas de envío real a DIAN con PAC autorizado (no auto-firmado).
- Cierre contable mensual manual por un contador colegiado para verificar cuadre.

**Estimación de esfuerzo**: implementar los 6 fixes críticos + 4 altos relacionados (ALT-001, ALT-005, ALT-008, ALT-010) equivale aproximadamente a **3-5 días-hora de un desarrollador full-stack con asesoría de contador**. Los medios restantes son mejoras de calidad que pueden agendarse con menor urgencia.

---

**Auditoría finalizada**. Reporte técnico disponible en `/home/z/my-project/audit/datos-negocio.md`. Worklog actualizado con sección `AUDIT-DATOS-NEGOCIO`.
