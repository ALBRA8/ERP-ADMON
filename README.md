# Marsella ERP — Software Contable Administrativo

Reingeniería moderna de **SG Hermes 9.2.1.1** (ERP de escritorio en VB.NET WinForms + MySQL) construida desde cero sobre **Next.js 16 + TypeScript + Prisma + SQLite** (intercambiable a PostgreSQL). Diseñada como producto **independiente y complementario** al CRM-ALBRA.

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 | Turbopack |
| Lenguaje | TypeScript estricto | Zod para validación |
| BD | SQLite + Prisma 6 | Cambiar a PostgreSQL: solo `provider = "postgresql"` |
| UI | Tailwind 4 + shadcn/ui (New York) | Modo claro/oscuro |
| Auth | JWT (jose) + bcryptjs + RBAC | 5 roles: admin, contador, cajero, vendedor, bodeguero |
| DIAN | Estructura UBL 2.1 + CUFE (SHA-384) + QR | Mock inicial, lista para integrar proveedor tecnológico real |
| Reportes | Excel con `exceljs`, PDF planeado con `@react-pdf/renderer` | Reemplaza Crystal Reports |

## Módulos implementados (Fase 1)

| Módulo | Funcionalidad |
|---|---|
| **Dashboard** | KPIs: ventas/compras del mes, cartera por edades (0-30/31-60/61-90/+90), stock crítico, movimientos contables del mes |
| **Terceros** | CRUD unificado de clientes, proveedores, empleados y socios. Búsqueda, filtro por tipo, ciudades DANE, cupo de crédito y días de plazo |
| **Productos y Servicios** | Maestro con código, barcode, unidad de medida, clasificación en 6 niveles (árbol), 3 listas de precios, IVA, manejo de lotes y seriales |
| **Inventarios Multibodega** | Bodegas, saldos por bodega, kardex valorizado con costo promedio ponderado (PEPS), ajustes manuales (entrada/salida/ajuste) |
| **Compras** | Factura de compra con IVA descontable, entrada automática al inventario, saldo CXP, fecha de vencimiento |
| **Facturación** | POS y Estándar con CUFE (mock), QR de representación DIAN, XML UBL 2.1 completo, salida de inventario, asiento contable automático (Cliente / IVA / Ingreso / Costo / Inventario), forma de pago con cálculo de cambio |
| **Cartera** | CXC (recibos de caja) y CXP (comprobantes de egreso), aging por edades, decremento automático del saldo del tercero |
| **Contabilidad** | Plan Único de Cuentas (PUC) colombiano precargado (48 cuentas, clases 1-7), asientos manuales con validación de cuadre, balance de prueba, libro mayor por cuenta, auxiliar por tercero |
| **Parámetros** | Empresa (NIT, régimen, moneda, decimales), Resolución DIAN (CRUD), Usuarios con roles, Tipos de documento, Info del sistema |

## Mejoras exponenciales vs Hermes

| Hallazgo Hermes (informe §9) | Solución en Marsella ERP |
|---|---|
| Credenciales en texto plano (`servidor.txt`) | Variables de entorno + AES-256-GCM para credenciales por empresa |
| Inyección SQL masiva (concatenación de strings en VB.NET) | Prisma ORM con prepared statements + Zod para validación de entrada |
| ActiveX Flash obsoletos (RCE) | Sin componentes ActiveX; React 19 + Radix UI |
| Sin TLS en conexión MySQL | HTTPS/WSS con TLS 1.3 obligatorio en producción |
| ADODB COM Interop + ODBC 5.1 | Prisma Client nativo |
| Sin FK declaradas (MyISAM) | Todas las tablas con FK formales + onDelete Cascade/SetNull |
| Sin separación de capas (lógica en botones WinForms) | API REST en `src/app/api/` separada de UI |
| 109 reportes Crystal Reports pesados | Reportes ligeros con Excel/PDF nativo del navegador |
| Ejecutable 37 MB, recompilar por cada cambio | Hot reload en desarrollo, standalone build en producción |
| Sin RBAC granular | JWT + RBAC con 5 roles y permisos por módulo |
| Sin catálogo de-versionado de schema | `prisma db push` idempotente; swap a PostgreSQL en una línea |

## Puesta en marcha

```bash
# 1. Instalar dependencias
bun install

# 2. Aplicar schema a la BD
bun run db:push

# 3. Poblar datos demo (Marsella S.A.S. + PUC + 10 productos + 5 clientes)
bunx tsx scripts/seed-marsella.ts

# 4. Levantar
bun run dev          # http://localhost:3000
```

**Demo login**: `demo@marsella.com` / `demo1234` (o usa el botón "Entrar en modo demo").

## Estructura del proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── auth/{login,register,me,logout,demo}/
│   │   ├── dashboard/        # KPIs consolidados
│   │   ├── terceros/          # CRUD unificado de terceros
│   │   ├── productos/         # CRUD de productos
│   │   ├── inventario/        # Bodegas, saldos, kardex, movimientos
│   │   ├── bodegas/           # CRUD de bodegas
│   │   ├── facturas/          # Facturación electrónica DIAN (mock CUFE)
│   │   ├── compras/           # Facturas de compra
│   │   ├── cartera/           # Recibos de caja + comprobantes de egreso
│   │   ├── contabilidad/      # PUC, asientos, balance, mayor, auxiliar
│   │   ├── empresas/          # PUT empresa
│   │   ├── usuarios/          # CRUD usuarios
│   │   ├── resolucion-dian/   # CRUD resoluciones DIAN
│   │   ├── ciudades/          # Ciudades DANE
│   │   ├── unidades/          # Unidades de medida
│   │   ├── lineas/            # Líneas de clasificación
│   │   └── impuestos/         # IVA, ReteFuente, ReteICA
│   ├── layout.tsx
│   └── page.tsx               # SPA principal con 9 vistas
├── components/
│   ├── auth/login-view.tsx
│   ├── layout/{sidebar,topbar}.tsx
│   ├── dashboard/dashboard.tsx
│   ├── terceros/terceros-view.tsx
│   ├── productos/productos-view.tsx
│   ├── inventario/inventario-view.tsx
│   ├── facturacion/facturacion-view.tsx
│   ├── compras/compras-view.tsx
│   ├── cartera/cartera-view.tsx
│   ├── contabilidad/contabilidad-view.tsx
│   ├── parametros/parametros-view.tsx
│   └── ui/                    # shadcn/ui completo
├── lib/
│   ├── db.ts                  # Prisma client singleton
│   ├── auth.ts                # JWT + RBAC + registerUser + loginUser
│   ├── crypto.ts              # bcrypt + AES-256-GCM + SHA-384 (CUFE)
│   ├── dian.ts                # CUFE + QR + XML UBL 2.1 + dígito verif NIT
│   ├── currency.ts            # COP format + round + aging
│   ├── inventario.ts          # Kardex + costo promedio ponderado
│   └── api.ts                 # Helpers ok/badRequest/serverError/withAuth
└── prisma/
    └── schema.prisma          # 19 modelos, ~28 tablas lógicas
scripts/
└── seed-marsella.ts           # Seed: empresa + admin + DIAN + PUC + 10 productos + clientes
docs/
└── MIGRATION_FROM_HERMES.md   # Mapeo Hermes → Marsella, módulo por módulo
```

## Variables de entorno

```bash
# .env
DATABASE_URL=file:/home/z/my-project/db/custom.db
APP_SECRET=<32+ chars aleatorios>          # JWT signing
APP_ENCRYPTION_KEY=<64 hex chars / 32 bytes> # AES-256-GCM para credenciales
```

## Integración con CRM-ALBRA (futuro)

Los dos productos comparten el mismo stack (Next.js 16 + TS + Prisma) y pueden integrarse vía:

1. **API REST entre servicios** (CRM consume `/api/terceros` y `/api/facturas` del ERP con Bearer JWT).
2. **Webhook compartido** (cuando se factura en el ERP, notifica al CRM para marcar oportunidad como "ganada").
3. **SSO** (compartir clave `APP_SECRET` para validar tokens cruzados).
4. **Base de datos compartida** (ambos usan `Tercero` como entidad central).

## Limitaciones actuales (Fase 1)

- **DIAN real**: CUFE está mockeado. Para facturación electrónica real se requiere certificado digital X.509 + proveedor tecnológico autorizado. La estructura UBL 2.1 ya está lista.
- **Nómina electrónica DIAN**: no incluida (Fase 2).
- **Verticales nicho** (restaurante/hotel/café/servicios públicos/taller): no incluidos (Fase 3+).
- **Conciliación bancaria**: no incluida (Fase 2).
- **Presupuesto CDP/CRP**: no incluido (Fase 2).
- **Créditos con amortización**: no incluido (Fase 2).

## Licencia

Propietaria — Marsella S.A.S. / Johan Marsella. Construido sobre el informe técnico "INFORME HERMES MARSELLA" (30 de Septiembre 2026).
