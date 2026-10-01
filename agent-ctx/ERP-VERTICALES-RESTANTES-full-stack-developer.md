---
Task ID: ERP-VERTICALES-RESTANTES
Agent: full-stack-developer
Task: Implementar 4 verticales nicho restantes del ERP Marsella — Cafetero, Servicios Públicos, Taller/Servicio Técnico, Vehículos y Mascotas (Hermes §5.16–5.19)

Work Log:
1. Inicialicé el entorno fullstack con `init-fullstack_1775040338514.sh`. Dev server ya arrancado en :3000.
2. Leí `worklog.md` previo y los registros de agentes previos en `/agent-ctx/` (especialmente `ERP-VERTICALES-RESTAURANTE-HOTEL-full-stack-developer.md` para heredar helpers `apiGet`/`apiPost` y patrones de cards/sheet/dialog con acento emerald/teal).
3. Revisé `prisma/schema.prisma` (líneas 1330–1570): confirmé que los modelos `Finca`, `CompraCafe`, `ControlCalidadCafe`, `PruebaTaza`, `UsuarioServicio`, `BloqueFacturacion`, `LecturaMedidor`, `TarifaServicio`, `OrdenServicioTecnico`, `DetalleServicioTecnico`, `Vehiculo`, `Mascota` ya existen con los campos especificados en la tarea. **Inspección crítica de relaciones**:
   - `CompraCafe.finca` → relación formal a `Finca` ✓
   - `CompraCafe.controlCalidad` → relación 1-1 a `ControlCalidadCafe` (onDelete Cascade) ✓
   - `CompraCafe.terceroId` → String plano **sin relation formal** — lookup manual.
   - `Finca.propietarioId` → String plano sin relation — lookup manual.
   - `ControlCalidadCafe.pruebaTaza` → **no existe relación formal**; `PruebaTaza.controlCalidadId` es String sin relación, se busca con `findFirst`.
   - `UsuarioServicio.terceroId` → String plano sin relation — lookup manual.
   - `LecturaMedidor.usuarioServicio` → relación formal a `UsuarioServicio` ✓
   - `OrdenServicioTecnico.detalleServicioTecnicos` → relación formal ✓
   - `OrdenServicioTecnico.terceroId`, `tecnicoAsignadoId` → String plano sin relation — lookup manual.
   - `Vehiculo.terceroId`, `Mascota.terceroId` → String plano sin relation — lookup manual.
4. Revisé `src/lib/api.ts` (`ok`, `badRequest`, `serverError`, `unauthorized`, `getQuery`, `getQueryInt`), `src/lib/auth.ts` (`getSession()` con `cookies() + jwtVerify`), `src/lib/currency.ts` (`round`, `formatCurrency`), `src/lib/currency-fn.ts` (wrapper cliente), `src/lib/db.ts` (patrón `bustPrismaClientCacheAndReload()` que resuelve stale PrismaClient cacheado en Turbopack) y `src/app/api/facturas/route.ts` (lógica completa de creación de factura DIAN con `nombreCliente/nitCliente/items[]/esPOS/formaPago`).
5. **Actualicé `src/lib/db.ts`**: añadí 11 modelos nuevos (`finca`, `compraCafe`, `controlCalidadCafe`, `pruebaTaza`, `usuarioServicio`, `bloqueFacturacion`, `lecturaMedidor`, `tarifaServicio`, `ordenServicioTecnico`, `detalleServicioTecnico`, `vehiculo`, `mascota`) a la lista `required` de `hasAllModels` para que el dev server invalide el cache de PrismaClient tras detectarlos faltantes.
6. **Cafetero — 7 endpoints API**:
   - `GET/POST/PUT /api/cafetero/fincas` (filtros `?q`, paginación, lookup manual de `propietario`, validación de tercero opcional).
   - `GET/PUT/DELETE /api/cafetero/fincas/[id]` (detalle con `_count.compras`; bloquea DELETE si tiene compras asociadas).
   - `GET/POST /api/cafetero/compras` (filtros `?q&fechaInicio&fechaFin&estado`; POST calcula `pesoNeto=pesoBruto-tara`, `valorBruto=pesoNeto*precioBaseKg`, `descuentos=(humedad>12?(humedad-12)*pesoNeto*0.01:0)+(factorRendimiento*valorBruto/100)`, `retenciones=valorBruto*0.005`, `valorPagar=valorBruto-descuentos-retenciones`; genera `CAF-2026-NNNNNN`; estado inicial `vigente`).
   - `GET /api/cafetero/compras/[id]` (detalle completo con finca + controlCalidad + pruebaTaza por lookup + tercero).
   - `POST /api/cafetero/compras/[id]/control-calidad` (upsert 1-1 con `almendraSana/broca/huecos/hongos/defectosTotales` %).
   - `POST /api/cafetero/compras/[id]/prueba-taza` (9 atributos SCA 0-10, crea `ControlCalidadCafe` si no existe, calcula `puntajeTotal=suma`, clasifica `>=80 café_especial`, `>=70 comercial_bueno`, `<70 comercial_estandar`).
   - `POST /api/cafetero/compras/[id]/liquidar` (cambia estado a `liquidado`; si `generarFactura=true` llama internamente a `POST /api/facturas` con `items=[{descripcion, cantidad=pesoNeto, unidadMedida=KG, precioUnitario=precioBaseKg, tarifaIva=0}]`).
   - `GET /api/cafetero/pruebas-taza` (lista con paginación, enriquece con `controlCalidad.compraCafe` via lookup — necesario para el tab "Catación" de la UI; añadido como endpoint auxiliar no listado en el spec original).
7. **Servicios Públicos — 6 endpoints API**:
   - `GET/POST/PUT /api/servicios-publicos/usuarios` (filtros `?q&estrato&uso`; POST valida `numeroContrato` único por empresa).
   - `GET/PUT/DELETE /api/servicios-publicos/usuarios/[id]` (DELETE con soft-delete → `estado=inactivo` si tiene lecturas).
   - `GET/POST/PUT /api/servicios-publicos/bloques` (CRUD con `codigo` único, `ciclo 1-12`, `diaCorte/diaPago 1-28`).
   - `GET/POST/PUT /api/servicios-publicos/tarifas` (filtros `?tipoServicio&estrato&uso`; valida `rangoHasta > rangoDesde`).
   - `GET/POST /api/servicios-publicos/lecturas` (filtros `?usuarioServicioId&bloqueFacturacionId&fechaInicio&fechaFin&facturada`; POST resuelve `lecturaAnterior` automáticamente de la última lectura si no se pasa; valida `consumo >= 0` — error 400 si `lecturaActual < lecturaAnterior`).
   - `POST /api/servicios-publicos/lecturas/bulk` (acepta `{lecturas:[{usuarioServicioId, lecturaActual, bloqueFacturacionId?}]}`, para cada usuario busca la última lectura anterior automáticamente, devuelve `{creadas, errores, total}`).
   - `POST /api/servicios-publicos/facturar-bloque` (Body `{bloqueFacturacionId}`; para cada lectura no facturada del bloque genera `FacturaVenta` via `POST /api/facturas` con tercero del usuario, `valor=(tarifaFija)+(consumo*tarifaVariable)`, marca lectura como `facturada`, devuelve `{facturas, totalFacturado, totalLecturas, errores}`).
8. **Taller — 8 endpoints API**:
   - `GET/POST /api/taller/ordenes` (filtros `?q&estado&fechaInicio&fechaFin&tecnicoId`; POST genera `OST-2026-NNNNNN`, estado inicial `ingresado`).
   - `GET /api/taller/ordenes/[id]` (detalle completo con `detalleServicioTecnicos` + lookup tercero y técnico).
   - `POST /api/taller/ordenes/[id]/diagnostico` (Body `{diagnostico, tecnicoAsignadoId?, observaciones?}`; cambia estado a `diagnostico`).
   - `POST /api/taller/ordenes/[id]/agregar-detalle` (Body `{tipo, descripcion, cantidad, precioUnitario}`; tipos `repuesto|mano_obra|insumo`; calcula `subtotal`, recalcula `valorRepuestos/valorManoObra/valorTotal` sumando todos los detalles existentes + el nuevo).
   - `POST /api/taller/ordenes/[id]/iniciar-reparacion` (valida estado actual = `diagnostico`, cambia a `en_reparacion`).
   - `POST /api/taller/ordenes/[id]/finalizar` (valida `en_reparacion`, cambia a `listo`, set `fechaEntrega=now()`).
   - `POST /api/taller/ordenes/[id]/entregar` (valida `listo`, cambia a `entregado`; si `generarFactura=true` y hay detalles llama a `POST /api/facturas` mapeando `detalles → items` con `tarifaIva=0` y `formaPago` configurable, vincula `facturaId` a la orden).
   - `POST /api/taller/ordenes/[id]/anular` (valida no esté `entregado`, cambia a `anulado`).
9. **Vehículos y Mascotas — 4 endpoints API**:
   - `GET/POST/PUT /api/vehiculos` (filtros `?q&tipo&terceroId`; POST valida `placa` única por empresa, normaliza a uppercase; PUT valida unicidad de placa si cambia).
   - `GET/PUT/DELETE /api/vehiculos/[id]` (DELETE físico).
   - `GET/POST/PUT /api/mascotas` (filtros `?q&especie&terceroId`; parsea `fechaNacimiento` ISO).
   - `GET/PUT/DELETE /api/mascotas/[id]`.
10. **Componente UI Cafetero** (`src/components/cafetero/cafetero-view.tsx`, ~1800 líneas): 3 tabs (Compras de café / Fincas / Catación). Búsqueda + filtro por estado + paginación. Tabla con número (monoespaciada emerald), fecha, tercero, finca, peso neto, precio/kg, valor pagar (COP), badge de estado (4 variantes colorizadas). Click en fila abre Sheet lateral derecho (max-w-2xl) con:
    - Resumen de badges (estado + puntaje cata si existe)
    - Card "Proveedor y finca" con lookup de tercero
    - Card "Pesaje físico" (peso bruto/tara/neto/humedad/factor rendimiento)
    - Card "Liquidación" destacada emerald: precio/kg, valor bruto, descuentos (humedad + rendimiento), retenciones 0.5%, valor a pagar (font-bold emerald)
    - Card "Control de calidad" con botón "Registrar"/"Editar" → Dialog con 5 campos (almendraSana, broca, huecos, hongos, defectosTotales)
    - Card "Prueba de taza SCA" con botón → Dialog con 9 atributos (fragranciaAroma, sabor, saborResidual, acidez, cuerpo, balance, uniformidad, tazaLimpia, dulzor) cada uno con input number 0-10 step 0.1, **puntaje total en vivo** (suma), badge clasificación SCA (verde "Especial" >=80, amber "Bueno" >=70, gray "Estándar" <70)
    - Acciones: "Liquidar compra" (sin factura) y "Liquidar y facturar" (genera FacturaVenta via /api/facturas) — solo visibles si estado=`vigente`
    - Dialog Nueva Compra con cálculo de liquidación en vivo (carga tarifa Bruto/Descuentos/Retenciones/Pagar)
    - Dialog Nueva Finca (nombre, ubicación, municipio, propietario select, hectareas, altura, sombra checkbox, observaciones)
    - Tab "Fincas" con grid de cards (3 cols en lg) con icono Leaf, badges de ubicación, propietario, hectáreas, altura, badge "Cultivo bajo sombra"
    - Tab "Catación" con tabla de PruebaTaza (fecha, catador, # compra, puntaje total, badge clasificación) — click en fila abre Sheet con todos los atributos + barras de progreso emerald-teal por cada atributo (0-10).
11. **Componente UI Servicios Públicos** (`src/components/servicios-publicos/servicios-view.tsx`, ~1400 líneas): 4 tabs (Usuarios / Bloques / Tarifas / Lecturas). Tab Usuarios: tabla con contrato, dirección, estrato (badge colorizado por estrato 1-6 emerald→teal→cyan→amber→orange→rose), uso, consumo promedio, medidor, titular. Búsqueda + filtros estrato/uso. Botones "Importar lecturas (CSV)" (Dialog con textarea `contrato;lectura` o `contrato,lectura` con preview en vivo de líneas válidas) y "Nuevo usuario". Tab Bloques: CRUD inline editable (fila se vuelve editable con inputs, botones guardar/cancelar) + toggle activo/inactivo. Tab Tarifas: tabla con tipo servicio (agua/energia/gas/aseo), estrato (badge), uso, rango, tarifa, cargo fijo, badge activa. Tab Lecturas: tabla con usuario, fecha, anterior, actual, consumo (badge colorizado: rojo si >130% promedio, verde si <50% promedio, amber si en medio), facturada (badge). Botones "Nueva lectura" (Dialog con usuario select, lectura actual, bloque opcional), "Importación masiva" (Dialog con tabla editable checkbox + lectura actual por usuario), "Facturar bloque" (selector de bloque + AlertDialog de confirmación + resultado con facturas generadas/total facturado/errores).
12. **Componente UI Taller** (`src/components/taller/taller-view.tsx`, ~1300 líneas): 3 tabs (Órdenes / Mis órdenes / Histórico). Tab Órdenes: tabla con número (OST-2026-NNNNNN), ingreso, tercero, equipo, marca/modelo, estado (badge con icono y color por estado: ingresado neutral, diagnostico amber, en_reparacion teal, listo emerald, entregado emerald fuerte, anulado rose), valor total COP. Búsqueda + filtro estado. Click fila abre Sheet lateral con:
    - Estado + badge "Facturada" si tiene facturaId
    - Card "Cliente y equipo" (cliente, documento, teléfono, equipo, marca, modelo, serial, técnico)
    - Card "Problema y diagnóstico" con botón "Diagnosticar" → Dialog con textarea diagnostico + select técnico + observaciones
    - Card "Detalles" con tabla de repuestos/mano_obra/insumos (badge colorizado por tipo) + botón "Agregar" → Dialog con select tipo + descripción + cantidad + precio + subtotal en vivo; KPIs al pie (Repuestos / Mano de obra / Total)
    - Botones de estado condicionales según estado actual: Diagnosticar (si `ingresado`), Iniciar reparación (si `diagnostico`), Finalizar (si `en_reparacion`), Entregar (si `listo`), Anular (siempre que no entregado/anulado). El botón "Entregar" abre Dialog con checkbox "Generar factura" + nota informativa.
    - Tab "Mis órdenes": select de técnico (terceros tipo empleado) que filtra las órdenes mostradas.
    - Tab "Histórico": combina órdenes `entregado` + `anulado` con KPIs "Total facturado" (COP) y "Entregadas / Anuladas" (count).
13. **Componente UI Vehículos y Mascotas** (`src/components/vehiculos/vehiculos-view.tsx`, ~600 líneas): 2 tabs (Vehículos / Mascotas). Tab Vehículos: tabla con placa (monoespaciada emerald uppercase), marca, modelo, año, color, tipo (badge con icon Car/Bus/Truck/Bike según tipo), propietario. Búsqueda + filtro tipo. Botón "Nuevo" → Dialog con propietario select, placa (auto-uppercase), tipo select, marca, modelo, año, color, kilometraje, observaciones. Tab Mascotas: tabla con nombre (icon PawPrint emerald), especie, raza, sexo (badge M teal / H rose), fecha nacimiento, color, microchip (font-mono), dueño. Búsqueda + filtro especie (perro/gato/ave/conejo/reptil/otro). Botón "Nueva" → Dialog con dueño select, nombre, especie, raza, sexo (M/H), fecha nacimiento (date picker), color, microchip, observaciones.
14. **Actualicé `src/components/layout/sidebar.tsx`**: añadí imports `Coffee`, `Zap`, `Wrench`, `Car` a `lucide-react`. Extendí `NavKey` con `"cafetero"`, `"servicios"`, `"taller"`, `"vehiculos"`. Añadí 4 items en grupo `"Verticales"`: Cafetero (Coffee), Servicios Públicos (Zap), Taller (Wrench), Vehículos y Mascotas (Car), posicionados después de Hotelería.
15. **Actualicé `src/app/page.tsx`**: importé `CafeteroView`, `ServiciosView`, `TallerView`, `VehiculosView`. Agregué `"cafetero" | "servicios" | "taller" | "vehiculos"` al tipo `View`. Añadí 4 casos de render `view === "cafetero" && <CafeteroView />` (etc.) entre `view === "hotel"` y `</main>`.
16. **Lint**:
    - Primera pasada: 19 errores en `cafetero-view.tsx` — `react-hooks/static-components` quejándose de `const Row = (...) => (...)` definido dentro del componente `SheetCompra` (anti-patrón: componente creado durante render resetea estado).
    - Fix: extraje `Row` a función top-level `FilaDetalle`, y reemplacé los 9 usos con `sed -i 's|<Row|<FilaDetalle|g'`.
    - Segunda pasada: `bun run lint` EXIT 0 — 0 errores, 0 warnings en toda la base.
17. **Verificación funcional con curl autenticado (cookie `demo@marsella.com / demo1234`)**:
    - `GET /api/cafetero/fincas?pageSize=5` → 200 `{"items":[],"total":0}`
    - `POST /api/cafetero/fincas` (Finca La Esperanza, Manizales, 12.5 ha, 1450 msnm, sombra) → 200
    - `POST /api/cafetero/compras` (fincaId, pesoBruto=250, tara=5, factorRend=3, humedad=14, precioBaseKg=8500) → 200 con `numero=CAF-2026-000001`, `pesoNeto=245`, `valorBruto=2082500`, `descuentos=62479.9` (= (14-12)*245*0.01 + 3*2082500/100 = 4.9 + 62475), `retenciones=10412.5` (= 2082500*0.005), `valorPagar=2009607.6` (✓ todos los cálculos correctos)
    - `POST /api/cafetero/compras/[id]/control-calidad` (almendraSana=85, broca=2, huecos=1, hongos=0.5, defectosTotales=15) → 200, `controlCalidad.id` set, vinculado 1-1 a la compra
    - `POST /api/cafetero/compras/[id]/prueba-taza` (9 atributos SCA: 8,7.5,7,8,7.5,8,9,8,8) → 200 con `puntajeTotal=71` (✓ suma correcta), `clasificacion=comercial_bueno` (✓ >=70)
    - `GET /api/cafetero/pruebas-taza` → 200 con la catación enriquecida con `controlCalidad.compraCafe`
    - `GET /api/cafetero/compras/[id]` → 200 con `controlCalidad.pruebaTaza` enrichido por lookup manual
    - `POST /api/cafetero/compras/[id]/liquidar` (`{generarFactura:false}`) → 200 `estado=liquidado`, `valorPagar=2009607.6`
    - `POST /api/taller/ordenes` (Lavadora LG, modelo WD14, problema reportado) → 200 `numero=OST-2026-000001`, `estado=ingresado`
    - `POST /api/taller/ordenes/[id]/diagnostico` → 200 `estado=diagnostico`
    - `POST /api/taller/ordenes/[id]/agregar-detalle` (repuesto: Banda de transmisión 1x45000) → 200 con `valorRepuestos=45000`, `valorTotal=45000`
    - `POST /api/taller/ordenes/[id]/agregar-detalle` (mano_obra: 1x35000) → 200 con `valorManoObra=35000`, `valorTotal=80000` (45000+35000)
    - `POST /api/taller/ordenes/[id]/iniciar-reparacion` → 200 `estado=en_reparacion`
    - `POST /api/taller/ordenes/[id]/finalizar` → 200 `estado=listo`, `fechaEntrega` set
    - `POST /api/taller/ordenes/[id]/entregar` (`{generarFactura:false}`) → 200 `estado=entregado`, `fechaEntrega` set
    - `POST /api/vehiculos` (placa ABC123, Mazda 3, 2020) → 200, `placa=ABC123` (uppercase preservado)
    - `POST /api/vehiculos` (placa ABC123 duplicada) → **400** "Ya existe un vehículo con placa ABC123" (✓ validación única por empresa)
    - `POST /api/mascotas` (Max, perro, Labrador, M, 2022-04-15) → 200
    - `POST /api/servicios-publicos/bloques` (B01, Bloque Centro, ciclo 1, corte 15, pago 25) → 200
    - `POST /api/servicios-publicos/usuarios` (USU-001, dirección, estrato 3, residencial, tarifaFija 4500, tarifaVariable 250) → 200
    - `POST /api/servicios-publicos/lecturas` (usuarioId, lecturaActual=250) → 200 con `lecturaAnterior=0` (auto-resuelto), `consumo=250`
    - `POST /api/servicios-publicos/lecturas` (lecturaActual=200, menor que anterior 250) → **400** "La lectura actual (200) no puede ser menor que la anterior (250)" (✓ validación consumo negativo)
    - `POST /api/servicios-publicos/lecturas/bulk` (1 lectura: usuarioId, lecturaActual=300) → 200 `{"creadas":1,"errores":[],"total":1}`
    - `POST /api/servicios-publicos/lecturas` (con bloqueId, lecturaActual=350) → 200 con `consumo=50` (= 350-300 anterior)
    - `POST /api/servicios-publicos/facturar-bloque` (bloque B01) → 200 `{"facturas":1,"totalFacturado":17000,"totalLecturas":1,"errores":[]}` (✓ valor = 4500 cargo fijo + 50 consumo × 250 tarifaVariable = 17000; factura generada via POST /api/facturas con `formaPago=credito`)
18. `dev.log` final: `✓ Compiled` exitoso en cada prueba. Sin errores de runtime en archivos nuevos. Compilación inicial de los nuevos componentes CafeteroView/ServiciosView/TallerView/VehiculosView tardó ~700ms cada uno (Turbopack), requests subsiguientes <50ms.

Stage Summary:
- **25 endpoints API nuevos** distribuidos en:
  - **Cafetero** (8): `/api/cafetero/fincas` (GET/POST/PUT), `/api/cafetero/fincas/[id]` (GET/PUT/DELETE), `/api/cafetero/compras` (GET/POST), `/api/cafetero/compras/[id]` (GET), `/api/cafetero/compras/[id]/control-calidad` (POST), `/api/cafetero/compras/[id]/prueba-taza` (POST), `/api/cafetero/compras/[id]/liquidar` (POST con flag `generarFactura`), `/api/cafetero/pruebas-taza` (GET auxiliar para tab de catación).
  - **Servicios Públicos** (7): `/api/servicios-publicos/usuarios` (GET/POST/PUT), `/api/servicios-publicos/usuarios/[id]` (GET/PUT/DELETE con soft-delete), `/api/servicios-publicos/bloques` (GET/POST/PUT), `/api/servicios-publicos/tarifas` (GET/POST/PUT), `/api/servicios-publicos/lecturas` (GET/POST con auto-resolución de `lecturaAnterior` y validación de consumo no negativo), `/api/servicios-publicos/lecturas/bulk` (POST masivo), `/api/servicios-publicos/facturar-bloque` (POST que genera FacturaVenta por cada lectura no facturada del bloque con cálculo `cargoFijo + consumo*tarifaVariable`).
  - **Taller** (8): `/api/taller/ordenes` (GET/POST con `OST-2026-NNNNNN`), `/api/taller/ordenes/[id]` (GET), `/api/taller/ordenes/[id]/diagnostico`, `/api/taller/ordenes/[id]/agregar-detalle` (recalcula totales por tipo), `/api/taller/ordenes/[id]/iniciar-reparacion`, `/api/taller/ordenes/[id]/finalizar` (set `fechaEntrega`), `/api/taller/ordenes/[id]/entregar` (con `generarFactura` flag → POST /api/facturas con detalles como items), `/api/taller/ordenes/[id]/anular`.
  - **Vehículos** (2): `/api/vehiculos` (GET/POST/PUT con validación de placa única por empresa), `/api/vehiculos/[id]` (GET/PUT/DELETE).
  - **Mascotas** (2): `/api/mascotas` (GET/POST/PUT), `/api/mascotas/[id]` (GET/PUT/DELETE).
- **4 componentes UI client** con acento emerald/teal, dark mode, responsive mobile-first, sonner toasts:
  - `cafetero-view.tsx` (~1800 líneas, 3 tabs: Compras/Fincas/Catación) con Sheet detalle + Dialogs de Nueva compra (con liquidación en vivo), Nueva finca, Control de calidad, Prueba de taza (con puntaje SCA en vivo y badges clasificación verde/amber/gray).
  - `servicios-view.tsx` (~1400 líneas, 4 tabs: Usuarios/Bloques/Tarifas/Lecturas) con CRUD inline de bloques, badges colorizados por estrato, importación CSV de lecturas, importación masiva con tabla editable, facturación de bloque con AlertDialog de confirmación.
  - `taller-view.tsx` (~1300 líneas, 3 tabs: Órdenes/Mis órdenes/Histórico) con Sheet detalle + Diálogos de Diagnóstico/Agregar Detalle/Entregar; botones de estado condicionales; badges por estado con iconos lucide.
  - `vehiculos-view.tsx` (~600 líneas, 2 tabs: Vehículos/Mascotas) con tablas, badges por tipo/sexo, validación de placa unique, date picker para mascotas.
- **Sidebar**: 4 items nuevos en grupo `"Verticales"` (Cafetero=Coffee, Servicios Públicos=Zap, Taller=Wrench, Vehículos y Mascotas=Car) después de Hotelería. `NavKey` extendido con las 4 nuevas claves.
- **`page.tsx`**: 4 casos nuevos de render para `view === "cafetero|servicios|taller|vehiculos"`. Tipo `View` extendido.
- **`src/lib/db.ts`**: 11 modelos nuevos añadidos a la lista `required` de `hasAllModels` para auto-invalidar el cache de PrismaClient tras `prisma db push` (mismo patrón documentado por agente de Bancos/Hotel).
- **Limitaciones**:
  - `POST /api/cafetero/compras/[id]/liquidar` con `generarFactura=true` propaga error si la empresa no tiene resolución DIAN activa (mismo patrón que `/api/comandas/[id]/facturar`). La creación de la FacturaVenta se hace con `tarifaIva=0` (café es exento según régimen) y `formaPago=transferencia` por defecto; el valor del item es `pesoNeto * precioBaseKg` (= valor bruto, NO valorPagar, ya que los descuentos y retenciones son conceptos contables que se manejarían en el comprobante de pago al proveedor, no en la factura comercial).
  - El endpoint `/api/cafetero/pruebas-taza` (GET) no estaba en la lista explícita del spec original, pero se añadió como auxiliar necesario para el tab "Catación" de la UI (no se puede reutilizar la lista de compras para listar todas las PruebaTaza de la empresa eficientemente).
  - Los modelos `Finca.propietarioId`, `CompraCafe.terceroId`, `UsuarioServicio.terceroId`, `OrdenServicioTecnico.terceroId`/`tecnicoAsignadoId`, `Vehiculo.terceroId`, `Mascota.terceroId` son String planos **sin relación formal** a `Tercero` (no se añadió al schema para no violar "No tocar Prisma"). El enriquecimiento se hace vía lookup manual `db.tercero.findMany({where:{id:{in:tids}}})` + `Map` en todos los GET — consistente con el patrón documentado por el agente de Hotelería.
  - El lookup del técnico en `OrdenServicioTecnico.tecnicoAsignadoId` busca en `Tercero` filtrando por `tipo='empleado' OR tipo='todos'` para poblar el select de técnicos en el Diálogo de Diagnóstico y en el tab "Mis órdenes".
- `bun run lint` **EXIT 0** (0 errores, 0 warnings en toda la base). Sin test code. `dev.log` final limpio sin errores de compilación ni runtime en archivos nuevos.
