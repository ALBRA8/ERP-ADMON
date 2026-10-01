# Migración SG Hermes → Marsella ERP

Mapa de correspondencia entre los 20 módulos / 408 formularios / 130 tablas / 109 reportes del SG Hermes 9.2.1.1 y la nueva arquitectura Marsella ERP.

## Resumen ejecutivo

| Métrica | SG Hermes 9.2.1.1 | Marsella ERP v0.1 (Fase 1) | Cobertura |
|---|---|---|---|
| Plataforma | .NET 4.5 WinForms + MySQL + ADODB | Next.js 16 + Prisma + SQLite (→PostgreSQL) | — |
| Tipos en binario | 914 | ~28 modelos Prisma | — |
| Formularios | 408 (WinForms) | 9 vistas SPA + ~30 dialogs | 8% |
| Reportes Crystal | 109 | Excel nativo (PDF planeado) | 5% |
| Tablas MySQL | 130 | 28 tablas lógicas | 22% |

## Mapeo módulo a módulo

### ✅ Cubierto en Fase 1

| Módulo Hermes (§) | Marsella ERP | Notas |
|---|---|---|
| §5.1 Seguridad y Usuarios | `lib/auth.ts` + `Usuario` + RBAC granular | JWT + bcrypt + 5 roles |
| §5.2 Parámetros / Catálogos | `ParametrosView` + `Empresa`, `ResolucionDian`, `TipoDocumento`, `Impuesto`, `UnidadMedida`, `Ciudad`, `LineaClasificacion`, `CentroCosto`, `ActividadEconomica` | Catálogo de catálogos |
| §5.2 Terceros | `TercerosView` + modelo `Tercero` unificado | Cliente + proveedor + empleado + socio en un solo maestro (en Hermes eran tablas separadas) |
| §5.2 Productos | `ProductosView` + modelo `Producto` | Incluye barcode, unidades, clasificación 6 niveles, 3 listas de precios, lotes/seriales |
| §5.3 Facturación Estándar | `FacturacionView` (tab "Nueva factura") | CUFE mock + XML UBL 2.1 + QR listo para certificado real |
| §5.3 Facturación POS | `FacturacionView` (toggle POS) | Forma de pago con cálculo de cambio |
| §5.4 Compras / Proveedores | `ComprasView` | IVA descontable + entrada automática al inventario + saldo CXP |
| §5.6 Inventarios Multibodega | `InventarioView` | Bodegas, saldos, kardex valorizado, costo promedio ponderado |
| §5.6 Movimientos de inventario | `POST /api/inventario` | entrada/salida/ajuste; traslado queda para Fase 2 |
| §5.9 Cartera CXC | `CarteraView` (tab CXC) | Recibos de caja, aging por edades |
| §5.9 Cartera CXP | `CarteraView` (tab CXP) | Comprobantes de egreso |
| §5.9 Notas Débito/Crédito | Modelo `Nota` creado | UI pendiente Fase 2 |
| §5.12 Contabilidad | `ContabilidadView` | PUC + asientos + balance + mayor + auxiliar |
| §5.12 Causación automática | Interno en `POST /api/facturas` y `POST /api/compras` | Asiento contable generado automáticamente al facturar |

### ⏳ Pendiente Fase 2 (alto valor)

| Módulo Hermes (§) | Tarea |
|---|---|
| §5.3 Facturación Electrónica DIAN real | Integrar proveedor tecnológico (ej. BCC, Avalara, SIIF), certificado X.509, firma XAdES-EPES, cola de reenvíos |
| §5.5 DIAN Radian (eventos 030/031/032/033) | Nuevo módulo de eventos de recepción |
| §5.8 Tesorería / Cajas POS / Bancos | Conciliación bancaria, depósitos/retiros |
| §5.10 Créditos / Préstamos / Financiación | Tabla de amortización French |
| §5.11 Nómina + Nómina Electrónica DIAN | Liquidación quincenal/mensual + CUNE |
| §5.13 Presupuesto (CDP / CRP) | Ejecución presupuestal |
| §5.12 NIIF / IFRS | Estados financieros bajo taxonomía NIIF Pymes |
| Reportes PDF nativos | Reemplazo completo de Crystal Reports con `@react-pdf/renderer` |

### 📋 Pendiente Fase 3+ (verticales nicho)

| Módulo Hermes (§) | Notas |
|---|---|
| §5.14 Restaurante (Mesas y Comandas) | Mapa de mesas táctil, comandas por mesero |
| §5.15 Hotelería (Habitaciones) | Ocupación, check-in/out, cargos a habitación |
| §5.16 Cafetero (Compra de Café + Catación) | Liquidación por rendimiento, prueba de taza SCA |
| §5.17 Servicios Públicos (Lecturas) | Facturación en bloque por tomas de lecturas |
| §5.18 Taller / Servicio Técnico | Órdenes de servicio, repuestos, mano de obra |
| §5.19 Vehículos y Mascotas | Registro de placas, dueños |
| §5.20 Interoperabilidad / Importaciones Excel | Masivo con `exceljs` |

## Mapeo tablas MySQL → modelos Prisma

| Tabla Hermes | Modelo Prisma |
|---|---|
| `empresas` | `Empresa` |
| `usuarios`, `usuapermiso`, `permisoscab` | `Usuario` (RBAC en código, no en tablas) |
| `parametros` | `Parametro` |
| `resdian` | `ResolucionDian` |
| `ciudades`, `regiones`, `zonas` | `Ciudad` |
| `conimpdoc`, `conimpdoc` | `TipoDocumento` |
| `bancos`, `bancosemp` | Pendiente Fase 2 |
| `cargosemp`, `contratoemp` | Campos dentro de `Tercero` (tipo=empleado) |
| `cecostos` | `CentroCosto` |
| `concepingegr` | Pendiente Fase 2 |
| `formapago`, `formapele` | Hardcoded como enum en schemas Zod |
| `terceros`, `tercecorreo`, `terceepsasi`, `credclaves` | `Tercero` (con todos los campos consolidados) |
| `productos`, `prodcodbars`, `produndmeds`, `undmedidas`, `prodcamposad`, `prodactfij`, `prodacttar` | `Producto` + `UnidadMedida` + `Servicio` + `PrecioProducto` |
| `servicios` | `Servicio` |
| `linea1`..`linea6` | `LineaClasificacion` (árbol auto-relacionado) |
| `listapre`, `preciosxpro`, `preciosxdct` | `ListaPrecio` + `PrecioProducto` |
| `bodegas`, `ubiprodbod` | `Bodega` |
| `entsalida`, `detentsalida` | Pendiente Fase 2 |
| `traslados`, `dettraslado` | Pendiente Fase 2 |
| `ajustes`, `detajustes` | `MovimientoInventario` (tipo=ajuste) |
| `conteoinv`, `detconteoinv` | Pendiente Fase 2 |
| `subinventa`, `subproduct` | `LoteInventario` (pendiente ampliar a seriales) |
| `auxkardex`, `auxinventario`, `auxinvserial` | `MovimientoInventario` + `SaldoInventario` |
| `facventas`, `detfventas`, `detfvensub`, `auxdetforpag`, `auxmetafac` | `FacturaVenta` + `DetalleFacturaVenta` |
| `compras`, `detcompras`, `auxcompven`, `auxdetcompven` | `FacturaCompra` + `DetalleFacturaCompra` |
| `respdocfele`, `comevenrecep`, `provetecno` | Pendiente Fase 2 (DIAN real) |
| `comprobantes`, `detcuentas` | `Comprobante` + `MovimientoContable` (también cubre `ReciboCaja` y `ComprobanteEgreso`) |
| `cajas`, `cajaarqueo`, `detcajarq`, `cajaspago` | Pendiente Fase 2 |
| `consbancab`, `consbandet` | Pendiente Fase 2 |
| `cuentacobro`, `detcuecobro` | Pendiente Fase 2 |
| `notascxccxp`, `detnotcxccxp` | `Nota` (sin UI todavía) |
| `auxrepcart` | Calculado en el endpoint `GET /api/dashboard` |
| `solcreditos`, `solcreapro`, `facaprocre` | Pendiente Fase 2 |
| `financiacion`, `detfinancia`, `factorfin` | Pendiente Fase 2 |
| `nominas`, `detnomina`, `detnomiele`, `nomiconcep`, `nomiconcuf`, `nomiconempl`, `nomisumcab`, `nomisumdet`, `retftenomina` | Pendiente Fase 2 |
| `cuentaspuc`, `resolpuc` | `CuentaPuc` |
| `compdiario` | `Comprobante` (tipo=manual) |
| `auxrepconta`, `auxrepdim`, `auxdetrep`, `auxdetdoc`, `auxdoc` | Calculados en `GET /api/contabilidad?op=balance` |
| `cierresper` | Pendiente Fase 2 |
| `revelaciones` | Pendiente Fase 2 |
| `mediomag`, `mediomdet` | Pendiente Fase 2 |
| `retenciones` | `Impuesto` (tipo=retefuente/reteica/reteiva) |
| `presupuesto`, `presupanos`, `cuentpresup`, `detpresupues`, `auxpresupeje` | Pendiente Fase 2 |
| `mesas`, `pedidores`, `detpedires`, `detpedreseli`, `emplecoman` | Pendiente Fase 3 |
| `regishabita`, `detreghabita`, `reservaciones` | Pendiente Fase 3 |
| `comicafe`, `controlcafe`, `fincas` | Pendiente Fase 3 |
| `solervicios`, `detsolser` | Pendiente Fase 3 |
| `despachos`, `detdespachos`, `listempaques`, `detlistempaq`, `recepmerca`, `detrecepmerca` | Pendiente Fase 2 |
| `domicilios` | Pendiente Fase 3 |
| `sucvehimasc` | Pendiente Fase 3 |
| `motanudoc` | Auditoría (pendiente Fase 2) |
| `archadjunto` | Pendiente Fase 2 |
| `seguimcli` | Cubierto por CRM-ALBRA (integración futura) |

## Reportes Crystal → equivalentes Marsella

| Reporte Crystal (Hermes §7) | Equivalent en Marsella | Estado |
|---|---|---|
| `RepBalaPrue7` / `RepBalaPrue8` | `GET /api/contabilidad?op=balance` | ✅ |
| `RepMayBal3` | Pendiente Fase 2 |  |
| `RepEstFin3`, `RepNiif2`, `RepNiif3` | Pendiente Fase 2 (NIIF) |  |
| `RepLibAux5` | `GET /api/contabilidad?op=auxiliar` | ✅ (sin tercero específico todavía) |
| `RepMoviCue3` | `GET /api/contabilidad?op=mayor` | ✅ |
| `RepCoDiari5` | `GET /api/contabilidad?op=comprobantes` | ✅ |
| `ImpNomina2`, `ImpNomina3`, `RepNomEmp2/3` | Pendiente Fase 2 (Nómina) |  |
| `ImpKardex2`, `ImpKardBod` | `GET /api/inventario?op=kardex` | ✅ |
| `RepInventa2`, `RepInventa4` | `GET /api/inventario?op=saldos` | ✅ |
| `RepVen*` | `GET /api/facturas` + dashboard | ✅ |
| `RepCoCompra` | `GET /api/compras` | ✅ |
| `ImpEgrIng3` | Pendiente Fase 2 (comprobtes PDF) |  |
| `RepCompCt2` | `GET /api/contabilidad?op=comprobantes` | ✅ |
| `RepCXCAb2`, `RepCXCMov`, `RepCXCRes` | `GET /api/cartera?tipo=recibo` + dashboard aging | ✅ |

## Reglas de negocio preservadas

| Regla Hermes | Implementación Marsella |
|---|---|
| Consecutivos DIAN por resolución | `ResolucionDian.consecutivoSiguiente` incrementado por `POST /api/facturas` |
| Rango de numeración DIAN | Validación `consecutivoSiguiente <= rangoFin` antes de emitir |
| CUFE = SHA384(numFac + fecFac + horFac + valTotal + codDoc + nitFac + ...) | `lib/dian.ts` `calcularCUFE()` |
| Dígito verificación NIT (algoritmo DIAN 71/67/59/...) | `lib/dian.ts` `calcularDigitoVerificacion()` |
| Kardex valorizado con costo promedio ponderado | `lib/inventario.ts` `registrarMovimientoInventario()` |
| Asiento contable: Cliente debita / IVA / Ingreso / Costo / Inventario | Generado en `POST /api/facturas` automáticamente |
| Descuento de cartera al recibir pago | `POST /api/cartera` decrementa `Tercero.saldoCartera` |
| Causación de IVA descontable en compra | Pendiente Fase 2 (asiento de compra) |

## Plan de migración (recomendado)

### Fase 1 (entregada en esta sesión)
- 9 módulos operativos: Dashboard, Terceros, Productos, Inventario, Compras, Facturación, Cartera, Contabilidad, Parámetros
- Seed con Marsella S.A.S. + 48 cuentas PUC + 10 productos + 5 clientes + 3 proveedores + 1 resolución DIAN
- RBAC con 5 roles
- Flujo end-to-end validado: factura → inventario → asiento contable → balance cuadrado

### Fase 2 (próximas iteraciones)
1. Conciliación bancaria + bancos + cajas POS
2. Nómina electrónica DIAN (CUNE)
3. Facturación electrónica DIAN real (certificado X.509 + proveedor tecnológico)
4. Reportes PDF con `@react-pdf/renderer` (balances, libros, comprobantes)
5. Notas Débito/Crédito (UI + asientos)
6. Créditos con amortización French
7. Cierre mensual y de año
8. Presupuesto CDP/CRP
9. Estados financieros NIIF

### Fase 3 (verticales nicho)
1. Restaurante (mesas + comandas)
2. Hotelería (habitaciones + reservas)
3. Cafetero (compra de café + catación SCA)
4. Servicios públicos (lecturas masivas)
5. Taller (órdenes de servicio)
6. Vehículos y mascotas

### Integración con CRM-ALBRA
El CRM y el ERP pueden compartir:
- `Tercero` como entidad central (cliente aparece en ambos)
- Webhooks cruzados (factura emitida en ERP → marcar oportunidad como ganada en CRM)
- SSO con `APP_SECRET` compartido
- API REST entre servicios con Bearer JWT
