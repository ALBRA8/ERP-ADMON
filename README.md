# Marsella ERP — Software Contable Administrativo

Reingeniería moderna de **SG Hermes 9.2.1.1** (ERP de escritorio en VB.NET WinForms + MySQL) construida sobre **Next.js 16 + TypeScript + Prisma + SQLite** (intercambiable a PostgreSQL).

Diseñada como producto **independiente y complementario** al CRM-ALBRA. Cubre los 20 módulos del informe Hermes original con mejoras exponenciales (PWA offline, MCP, multi-tenant SaaS, NIIF, medios magnéticos DIAN).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + Turbopack |
| Lenguaje | TypeScript estricto |
| BD | SQLite + Prisma 6 (cambiable a PostgreSQL en 1 línea) |
| UI | Tailwind 4 + shadcn/ui (New York) — modo claro/oscuro |
| Auth | JWT (jose) + bcryptjs + RBAC granular (5 roles) |
| Seguridad | AES-256-GCM para credenciales, CSRF tokens, rate limiting, headers CSP/HSTS |
| DIAN | Estructura UBL 2.1 + CUFE (SHA-384) + firma XAdES-EPES + Radian (eventos 030-036) |
| Reportes | PDF con `@react-pdf/renderer` + Excel con `exceljs` |
| PWA | Service Worker + IndexedDB para cajas POS offline |
| MCP | Servidor con 10 resources + 9 tools + 3 prompts |

## Módulos (20/20 del SG Hermes implementados)

### Operación
- **Dashboard** — KPIs consolidados (ventas, cartera, stock crítico, movimientos contables)
- **Terceros** — Clientes, proveedores, empleados unificados
- **Productos y Servicios** — Maestro + barcode + unidades + clasificación 6 niveles
- **Inventarios Multibodega** — Kardex valorizado, costo promedio ponderado, lotes
- **Compras** — Factura de compra con IVA descontable + asiento contable automático
- **Facturación** — POS y Estándar con CUFE, XML UBL 2.1, QR DIAN, firma XAdES-EPES
- **DIAN** — Configuración de certificado .p12, envío real a WebService DIAN, cola de reenvíos
- **DIAN Radian** — Eventos 030/031/032/033/034/035/036 de recepción
- **Producción y Costos** — Recetas + órdenes de transformación + asiento contable

### Financiero
- **Cartera** — CXC (recibos de caja) + CXP (comprobantes de egreso) con aging por edades
- **Contabilidad** — Plan Único de Cuentas (PUC) + asientos manuales + balance de prueba + libro mayor
- **Créditos** — Amortización French, Alemana y Americana
- **Presupuesto** — CDP, CRP, modificaciones presupuestales
- **Nómina Electrónica** — CUNE + 18 conceptos + cálculos oficiales 2026 (SMMLV, Aux. Transporte, UVT)
- **Bancos y Conciliación** — Cuentas bancarias + extractos + matching manual
- **Cajas POS** — Apertura/cierre + arqueos
- **Reportes PDF** — Balance, libro diario, mayor, kardex, nómina, ejecutivo
- **Estados NIIF** — ESF, EER, ECP, EFE con mapeo PUC→NIIF
- **Medios Magnéticos DIAN** — Formatos 1007, 2276, 2277, 1647, 2238 con TXT/XLSX

### Verticales Nicho
- **Restaurante** — Mapa de mesas + comandas + facturación directa
- **Hotelería** — Habitaciones por planta + reservas + check-in/check-out
- **Cafetero** — Compra de café con liquidación (peso, tara, humedad, rendimiento) + catación SCA
- **Servicios Públicos** — Usuarios + lecturas masivas + facturación por bloque
- **Taller** — Órdenes de servicio técnico + diagnóstico + repuestos
- **Vehículos y Mascotas** — Registro de placas + fichas mascotas

### Sistema
- **Parámetros** — Empresa, Resoluciones DIAN, Usuarios y roles, Tipos de documento
- **Importaciones Excel** — Universal con mapeo automático para 7 entidades
- **Administración** — Plan de suscripción + límites + auditoría multi-tenant
- **MCP** — Servidor Model Context Protocol + cliente para conexiones externas

## Mejoras exponenciales vs SG Hermes

| Hallazgo Hermes (informe §9) | Solución en Marsella ERP |
|---|---|
| Credenciales en texto plano (`servidor.txt`) | Variables de entorno + AES-256-GCM |
| Inyección SQL masiva (VB.NET) | Prisma ORM + Zod para validación |
| ActiveX Flash obsoletos (RCE) | React 19 + Radix UI |
| Sin TLS en MySQL | HTTPS/WSS con TLS 1.3 obligatorio |
| ADODB COM + ODBC 5.1 32-bit | Prisma Client nativo |
| Sin FK declaradas (MyISAM) | FK formales en todo el esquema |
| Lógica en botones WinForms | API REST separada de UI |
| 109 reportes Crystal Reports pesados | Excel/PDF nativo del navegador |
| Ejecutable 37 MB, recompilar por cambio | Hot reload + standalone build |
| Sin RBAC granular | JWT + 5 roles + permisos por módulo + CSRF |

## Puesta en marcha

```bash
# 1. Instalar dependencias
bun install

# 2. Configurar variables de entorno
cp .env.example .env
#    Genera los 5 secretos obligatorios:
#    openssl rand -base64 32   # APP_SECRET
#    openssl rand -hex 32      # APP_ENCRYPTION_KEY
#    openssl rand -hex 32      # MCP_API_TOKEN
#    openssl rand -hex 32      # CRON_SECRET
#    openssl rand -hex 32      # SUPER_ADMIN_SECRET

# 3. Aplicar schema a la BD
bun run db:push

# 4. Poblar datos demo (Marsella S.A.S. + PUC + 10 productos + 5 clientes)
bunx tsx scripts/seed-marsella.ts

# 5. Levantar
bun run dev          # http://localhost:3000
```

**Demo login**: `demo@marsella.com` / `demo1234` (solo disponible en desarrollo; en producción requiere `ENABLE_DEMO_ENDPOINT=true`).

## Estructura del proyecto

```
src/
├── app/
│   ├── api/                  # 150+ endpoints REST
│   │   ├── auth/             # login, register, logout, demo, csrf
│   │   ├── dashboard/        # KPIs consolidados
│   │   ├── terceros/         # CRUD unificado de terceros
│   │   ├── productos/        # CRUD de productos
│   │   ├── inventario/       # Bodegas, saldos, kardex, movimientos
│   │   ├── facturas/         # Facturación electrónica DIAN
│   │   ├── compras/          # Facturas de compra + asiento
│   │   ├── cartera/          # Recibos de caja + comprobantes de egreso
│   │   ├── contabilidad/     # PUC, asientos, balance, mayor, cierre
│   │   ├── nomina/           # Nómina electrónica con CUNE
│   │   ├── dian/             # Configuración DIAN + envíos + cola
│   │   ├── radian/           # Eventos Radian 030-036
│   │   ├── niif/             # Estados financieros NIIF
│   │   ├── medios-magneticos/ # Formatos DIAN 1007/2276/2277
│   │   ├── bancos/           # Cuentas bancarias + conciliación
│   │   ├── cajas/            # Cajas POS + arqueos
│   │   ├── creditos/         # Créditos con amortización
│   │   ├── presupuesto/      # CDP/CRP/modificaciones
│   │   ├── produccion/       # Órdenes de producción + recetas
│   │   ├── mesas/            # Restaurante
│   │   ├── comandas/         # Restaurante
│   │   ├── habitaciones/     # Hotelería
│   │   ├── reservas-hotel/   # Hotelería
│   │   ├── cafetero/         # Compra de café + catación
│   │   ├── servicios-publicos/ # Lecturas masivas
│   │   ├── taller/           # Órdenes de servicio técnico
│   │   ├── vehiculos/        # Vehículos
│   │   ├── mascotas/         # Mascotas
│   │   ├── mcp/              # Servidor + cliente MCP
│   │   ├── reportes/         # PDFs de balance, diario, mayor, kardex, nómina
│   │   ├── import/           # Importador Excel universal
│   │   ├── empresa/          # Plan + auditoría multi-tenant
│   │   └── ...               # Más catálogos
│   ├── layout.tsx
│   └── page.tsx              # SPA principal con 29 vistas
├── components/
│   ├── auth/                 # Login + registro
│   ├── layout/               # Sidebar + topbar
│   ├── dashboard/            # Dashboard con KPIs
│   ├── terceros/             # Vista de terceros
│   ├── productos/            # Vista de productos
│   ├── inventario/           # Vista de inventarios
│   ├── facturacion/          # POS + factura estándar
│   ├── compras/              # Vista de compras
│   ├── cartera/              # Vista de cartera
│   ├── contabilidad/         # PUC + asientos + balance
│   ├── nomina/               # Vista de nómina
│   ├── dian/                 # Configuración DIAN + envíos
│   ├── radian/               # Eventos Radian
│   ├── niif/                 # Estados financieros NIIF
│   ├── medios-magneticos/    # Medios magnéticos
│   ├── bancos/               # Bancos + conciliación
│   ├── cajas/                # Cajas POS
│   ├── creditos/             # Créditos + simulador
│   ├── presupuesto/          # Presupuesto
│   ├── produccion/           # Producción + recetas
│   ├── restaurante/          # Restaurante
│   ├── hotel/                # Hotelería
│   ├── cafetero/             # Cafetero
│   ├── servicios-publicos/   # Servicios públicos
│   ├── taller/               # Taller
│   ├── vehiculos/            # Vehículos + mascotas
│   ├── parametros/           # Configuración del sistema
│   ├── importaciones/        # Importador Excel
│   ├── admin/                # Administración
│   ├── mcp/                  # MCP
│   ├── pwa/                  # PWA (SW registro, install, sync)
│   ├── reportes/             # Reportes PDF
│   └── ui/                   # shadcn/ui completo
├── lib/
│   ├── db.ts                 # Prisma client singleton
│   ├── auth.ts               # JWT + RBAC + 5 roles
│   ├── crypto.ts             # bcrypt + AES-256-GCM + SHA-384 (CUFE)
│   ├── csrf.ts               # CSRF tokens double-submit
│   ├── rate-limit.ts         # Rate limiting en memoria
│   ├── token-revocation.ts   # Logout con invalidación de JWT
│   ├── logger.ts             # Logging sanitizado
│   ├── url-safety.ts         # SSRF protection
│   ├── dian.ts               # CUFE + QR + XML UBL 2.1 + DV NIT
│   ├── dian-real.ts          # Firma XAdES-EPES + envío SOAP DIAN
│   ├── radian.ts             # Eventos Radian (ApplicationResponse UBL)
│   ├── nomina.ts             # Cálculos nómina 2026 + CUNE
│   ├── niif.ts               # ESF, EER, ECP, EFE
│   ├── niif-mapping.ts       # Mapeo PUC → NIIF
│   ├── medios-magneticos.ts  # Formatos 1007/2276/2277/1647/2238
│   ├── inventario.ts         # Kardex + costo promedio ponderado
│   ├── credito.ts            # Amortización French/Alemana/Americana
│   ├── contabilidad.ts       # Asientos automáticos (compra, recibo, egreso, nómina, cierre)
│   ├── produccion.ts         # Órdenes de producción + recetas
│   ├── import-excel.ts       # Importador Excel universal
│   ├── mcp-server.ts         # Servidor MCP
│   ├── mcp-client.ts         # Cliente MCP
│   ├── tenant.ts             # Multi-tenant + auditoría
│   ├── currency.ts           # COP format + round + aging
│   ├── pdf.tsx               # 14 generadores PDF con @react-pdf/renderer
│   └── api.ts                # Helpers ok/badRequest/serverError/withAuth
└── prisma/
    └── schema.prisma         # 82 modelos
scripts/
└── seed-marsella.ts          # Seed: empresa + admin + DIAN + PUC + productos + clientes
public/
├── manifest.json             # PWA manifest
├── sw.js                     # Service Worker
└── icon-192.svg, icon-512.svg # Iconos PWA
docs/
└── MIGRATION_FROM_HERMES.md  # Mapeo Hermes → Marsella módulo por módulo
```

## Variables de entorno

Ver `.env.example` para referencia. Los 5 secretos obligatorios en producción:

| Variable | Uso | Generación |
|---|---|---|
| `APP_SECRET` | Firma JWT (mín 32 chars) | `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | Cifrado AES-256-GCM de credenciales (64 hex) | `openssl rand -hex 32` |
| `MCP_API_TOKEN` | Token del servidor MCP (64 hex) | `openssl rand -hex 32` |
| `CRON_SECRET` | Header X-Cron-Secret para jobs programados | `openssl rand -hex 32` |
| `SUPER_ADMIN_SECRET` | Upgrades de plan a enterprise | `openssl rand -hex 32` |

## Seguridad

- ✅ JWT con `jti` + revocación en logout
- ✅ bcryptjs 12 rounds para passwords
- ✅ AES-256-GCM para credenciales por organización
- ✅ CSRF tokens (double-submit cookie) en endpoints sensibles
- ✅ Rate limiting en login (10 intentos/min/IP)
- ✅ Headers: CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy
- ✅ RBAC con 5 roles (admin, contador, cajero, vendedor, bodeguero)
- ✅ Multi-tenant con `empresaId` en todas las tablas operativas
- ✅ Validación Zod en 95% de POST/PUT
- ✅ Transacciones Prisma `$transaction` en operaciones contables

## Despliegue con Docker

```bash
docker compose up -d --build
```

## Licencia

Propietaria — Marsella S.A.S. / Johan Marsella.

Construido sobre el informe técnico "INFORME HERMES MARSELLA" (30 de Septiembre 2026) que documenta la ingeniería inversa del SG Hermes 9.2.1.1.
