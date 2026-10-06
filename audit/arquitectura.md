# 🏗️ Auditoría de Arquitectura y Código — Marsella ERP v0.5.1

**Fecha**: 2026-10-06
**Auditor**: Agente especialista en arquitectura de software (externo, independiente)
**Scope**: 77.008 LOC en `src/` (263 archivos TS/TSX), 1.784 líneas en `prisma/schema.prisma`, 81 modelos, 150 endpoints API, 84 componentes.

---

## 📊 Resumen ejecutivo

- **Total de hallazgos**: 32 (CRÍTICOS: 9, ALTOS: 11, MEDIOS: 8, BAJOS: 4)
- **Score global de arquitectura**: **38 / 100** 🔴
- **Deuda técnica estimada**: **12–18 semanas-hombre** para alcanzar nivel producción (sin contar migración de datos)
- **Veredicto**: **Producto funcional como demo/POC; NO APTO PARA PRODUCCIÓN** en su estado actual. Existen defectos estructurales que provocan pérdida silenciosa de datos, vulnerabilidades de aislamiento multi-tenant, ausencia de atomicidad transaccional en operaciones contables y ausencia total de tests automatizados. El README y el worklog describen un ERP "production-ready" pero el código no respalda esa afirmación. Recomendado: estabilizar fundamentos (transacciones, tipos, RBAC, esquema Decimal, tests) antes de seguir añadiendo módulos verticales.

---

## 🔴 Hallazgos CRÍTICOS

### A-CRIT-001: Ausencia transaccional en operaciones contables y de facturación
- **Ubicación**: `src/app/api/facturas/route.ts:252-323` (POST factura), `src/app/api/contabilidad/route.ts:187-214` (POST asiento manual), `src/app/api/nomina/route.ts:265-323` (POST nómina), `src/lib/inventario.ts:21-122` (`registrarMovimientoInventario`)
- **Síntoma**: La creación de una factura ejecuta 9 escrituras Prisma separadas (factura, N detalles, N salidas de inventario, tercero.saldoCartera, resolucionDian.consecutivo, comprobante, 5 movimientos contables) **sin `$transaction`**. `generarAsientoVenta` se define como función asíncrona a nivel módulo en `facturas/route.ts:375` y ejecuta 7 escrituras más, también fuera de transacción. La nómina es aún peor: crea cabecera + N detalles + comprobante + N movimientos en 4 grupos de inserts sueltos. `registrarMovimientoInventario` (núcleo del costo promedio) hace create movimiento + read saldo + update saldo + update producto **sin transacción**.
- **Causa raíz**: Sólo **8 de 150 endpoints** (5%) usan `$transaction` (verificado con `grep $transaction src/app/api`). El patrón se estableció desde la Fase 1 y se replicó por copy-paste en 16 tareas sucesivas del worklog.
- **Impacto**: **PÉRDIDA DE DINERO**. Cualquier fallo parcial (timeout de BD, error de red, excepción en `generarAsientoVenta`) deja el sistema en estado inconsistente: factura creada sin asiento contable, consecutivo DIAN consumido sin factura, salida de inventario registrada sin comprobante, etc. El worklog documenta casos reales de "asiento falló gracefulmente" (Task ERP-PRODUCCION-COSTOS líneas 1407, 1433) que en producción significan: dinero que el cliente pagó pero no se contabiliza.
- **Fix recomendado**: Envolver cada operación multi-escritura en `db.$transaction(async (tx) => { ... })`. Mover `generarAsientoVenta`, `generarAsientoNomina`, `generarAsientoProduccion` a `src/lib/asientos.ts` y recibir `tx` como parámetro. Para `registrarMovimientoInventario`, usar `$transaction` con lock pesimista sobre `SaldoInventario` (`SELECT ... FOR UPDATE` no existe en SQLite → usar transacción + `update({where: {id}, data: {cantidad: {increment: x}}})` atómico).

### A-CRIT-002: `Float` en todos los campos monetarios del schema Prisma
- **Ubicación**: `prisma/schema.prisma` (193 campos `Float`, 0 campos `Decimal`)
- **Síntoma**: Subtotal, IVA, total, costoUnitario, saldoActual, saldoCartera, montoPrincipal, valorTotal, debito, credito, etc. — TODOS son `Float`. No existe un solo `Decimal` ni `BigInt` en el schema. El archivo `src/lib/currency.ts:3` comenta falsamente: *"tipo decimal exacto usando cents, evita floats en cálculos críticos"* — pero la implementación usa `number` (Float64) en TODO.
- **Causa raíz**: Decisión inicial de usar `Float` por simplicidad de seeding y tipos TS. Nunca se corrigió. El `round()` de `currency.ts:45` enmascara el problema en lugar de resolverlo.
- **Impacto**: Errores de redondeo acumulativos. Ejemplo: `0.1 + 0.2 = 0.30000000000000004` en Float. En un ERP que cuadra asientos contables, la **diferencia puede ser ≠ 0** y se requieren "fudge factors" como en `nomina/route.ts:418-424` (`if (Math.abs(diff) > 0.01) creditos["250505"] += diff`). Esto es un HACK contable. En balances anuales con miles de movimientos, el descuadre acumulado puede ser de varios pesos colombianos. La DIAN rechaza facturas con CUFE mal calculado por diferencias de centavos.
- **Fix recomendado**: Migrar todos los campos monetarios a `Decimal @db.Decimal(18,2)`. En Prisma, los `Decimal` se exponen como `Decimal.js` (`prisma.Decimal`). En TypeScript usar `decimal.js` para no perder precisión. Alternativa: almacenar centavos como `BigInt`. Migración costosa pero obligatoria.

### A-CRIT-003: Endpoint `/api/auth/demo` crea admin sin autenticación
- **Ubicación**: `src/app/api/auth/demo/route.ts:6-65`
- **Síntoma**: Endpoint POST **público** (sin `getSession`, sin rate limit, sin env guard) que crea empresa "Marsella S.A.S. (Demo)" con NIT `900.123.456-7` y usuario `demo@marsella.com / demo1234` con rol `admin`, y emite cookie JWT de sesión. El endpoint es idempotente (si ya existe, solo loguea). El comentario dice "Helper para desarrollo" pero **no hay guard `if (process.env.NODE_ENV !== 'production')`**.
- **Causa raíz**: Funcionalidad de conveniencia para demos sin pensar en despliegue a producción.
- **Impacto**: **Cualquier persona con acceso a la URL** puede obtener una sesión admin en una empresa real si la DB ya tiene el NIT `900.123.456-7` registrado por la empresa legítima (colisión de NIT demo). Esto es especialmente grave si dos clientes usan el mismo NIT en sus seeds. Además, expone credenciales hardcodeadas en el código.
- **Fix recomendado**: Eliminar el endpoint en build de producción con `export const dynamic = 'force-dynamic'` + guard `if (process.env.NODE_ENV === 'production') return notFound()`. O eliminarlo del código fuente y moverlo a un script `bunx tsx scripts/seed-demo.ts`.

### A-CRIT-004: Secreto JWT con fallback hardcodeado
- **Ubicación**: `src/lib/auth.ts:11-13`
- **Síntoma**: `const APP_SECRET = process.env.APP_SECRET || "marsella-erp-dev-secret-change-me-in-production-min-32-chars"`. Si `APP_SECRET` no está definido en el entorno, se usa un string públicamente conocido (visible en el repo).
- **Causa raíz**: Antipatrón "fail-soft": permitir arranque sin configurar el secreto.
- **Impacto**: Si un operador olvida configurar `APP_SECRET` en producción, **cualquiera puede forjar tokens JWT firmados** con ese secreto conocido y obtener acceso admin a cualquier empresa. El atacante no necesita ni explotar otra vulnerabilidad.
- **Fix recomendado**: `if (!process.env.APP_SECRET) throw new Error("APP_SECRET must be set")` al arranque. No permitir fallback.

### A-CRIT-005: RBAC declarado pero no aplicado en 146/150 endpoints
- **Ubicación**: `src/lib/auth.ts:19-73` (definición de `ROLES` con 5 roles y 24 permisos), `src/lib/auth.ts:141-153` (`hasPermission`), endpoints: sólo `src/app/api/{empresas,resolucion-dian,medios-magneticos/generar}/route.ts` invocan `hasPermission`
- **Síntoma**: El README (`README.md:18`) declara "5 roles: admin, contador, cajero, vendedor, bodeguero" con RBAC granular. El schema Prisma define `Usuario.rol String @default("vendedor")`. Pero **de los 143 archivos que llaman `getSession()`**, sólo **3** (2%) validan permisos con `hasPermission`. Es decir: cualquier usuario autenticado con rol "vendedor" puede **anular facturas, pagar nóminas, crear comprobantes contables manuales, eliminar terceros, anular créditos** — todas operaciones que el README sugiere estarían restringidas a `contador` o `admin`.
- **Causa raíz**: El helper se diseñó pero no se integró en el patrón de los `route.ts`. Como no hay un wrapper `withAuth` (ver A-CRIT-006), cada endpoint debe acordar manualmente de llamar `hasPermission`, y nadie lo hace.
- **Impacto:**
  - Un cajero POS puede modificar el plan de cuentas o causar nóminas.
  - Un vendedor puede anular facturas que él mismo emitió (fraude).
  - El RBAC documentado es una **mentira funcional** — auditoría de seguridad fallaría.
- **Fix recomendado**: Implementar middleware real. Opción A: middleware.ts con matcher `'/api/:path*'` que decodifique el JWT y verifique el permiso requerido por path. Opción B: wrapper `withAuth(handler, requiredPermission)` obligatorio en cada endpoint, fallando el build si no se usa (lint rule custom).

### A-CRIT-006: Wrappers `withAuth` y `parseBody` en `lib/api.ts` son **código muerto**
- **Ubicación**: `src/lib/api.ts:34-63` (definición), `src/app/api/**` (0 usos)
- **Síntoma**: Se exportan `withAuth(handler)` y `parseBody(req, schema)` como helpers pretendidamente estándar. `grep -rn "withAuth\|parseBody" src/app/api` → **0 resultados**. Los 143 endpoints actuales reimplementan manualmente `await getSession(); if (!session) return unauthorized();` + `await req.json(); parsed = schema.safeParse(body); if (!parsed.success) return badRequest(...)`. Esta tríada se repite en cada endpoint ~150 veces.
- **Causa raíz**: Los wrappers se agregaron tarde, después de que el patrón manual ya estaba consolidado. Los agentes siguientes no los adoptaron.
- **Impacto**:
  - Duplicación masiva (~10 líneas por endpoint × 150 = ~1500 LOC de boilerplate).
  - Inconsistencia: algunos endpoints usan `try/catch` en `req.json()`, otros no (ver `facturas/[id]/route.ts:57` con `.catch(() => ({}))`).
  - Imposible introducir mejora transversal (logging, métricas, RBAC) sin tocar 150 archivos.
- **Fix recomendado**: Refactor obligatorio: `export async function POST = withAuth(["facturas:write"], async (session, req) => { const data = await parseBody(req, schema); ... })`. Lint rule que prohiba `getSession` directo fuera de `withAuth`.

### A-CRIT-007: `terceros/route.ts` PUT/DELETE sin validación de tenant ni Zod
- **Ubicación**: `src/app/api/terceros/route.ts:104-136`
- **Síntoma**:
  ```ts
  export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const { id, ...data } = body;          // ← sin Zod, spread directo
    if (!id) return badRequest("id requerido");
    const tercero = await db.tercero.update({
      where: { id },                       // ← sin verificar empresaId
      data: { ...data, updatedAt: new Date() },
    });
  }
  ```
  - **No hay Zod** en PUT — el body se pasa crudo a `db.tercero.update`. El usuario puede sobreescribir cualquier campo incluyendo `empresaId` (transferir un tercero a otra empresa), `createdAt`, `passwordHash` (no existe aquí pero sí en `Usuario`).
  - **No se filtra por `empresaId`** en el `where` — un usuario de la empresa A puede actualizar un tercero de la empresa B si conoce el `id`.
  - Lo mismo aplica a `DELETE`: `db.tercero.update({where: {id}, data: {activo: false}})` sin verificar ownership.
- **Causa raíz**: Falta de disciplina de "validar antes de mutar". El helper `requireTenantAccess` existe en `src/lib/tenant.ts:168-260` pero **no se usa en ningún endpoint excepto medios-magneticos/** (4 archivos). El cuerpo del proyecto no lo adoptó.
- **Impacto**: **Vulnerabilidad de multi-tenant cross-company**. En un SaaS con varias empresas, un usuario malicioso puede mutar registros de otra empresa. Esto viola el contrato multi-tenant del producto y es **motivo de demanda** si se usa en producción con datos sensibles.
- **Fix recomendado**: `db.tercero.update({ where: { id, empresaId: session.empresaId }, data: parsedData })`. Wrap con `withAuth` + `parseBody`. Aplicar `requireTenantAccess(session, "tercero", id)` en PUT/DELETE.

### A-CRIT-008: `next.config.ts` ignora errores de TypeScript en el build
- **Ubicación**: `next.config.ts:6-7` (`typescript.ignoreBuildErrors: true`), `tsconfig.json:9` (`noImplicitAny: false`)
- **Síntoma**:
  ```ts
  const nextConfig: NextConfig = {
    output: "standalone",
    typescript: { ignoreBuildErrors: true },
    reactStrictMode: false,
  };
  ```
  El build de producción se completa aunque haya **cientos** de errores de tipo. Combinado con `tsconfig.json` que desactiva `noImplicitAny`, y `eslint.config.mjs` que pone a `"off"` TODAS las reglas significativas (ver A-ALT-001), el proyecto compila sin red de seguridad.
- **Causa raíz**: Se desactivaron para "avanzar rápido" durante el desarrollo, pero nunca se reactivaron.
- **Impacto**: Errores tipográficos como `empresaIdd`, llamadas a funciones inexistentes, o acceso a propiedades `undefined` pasan al build de producción. Esto es **incompatible con un ERP contable** donde un typo en `totalDebito` vs `totalCredito` es dinero.
- **Fix recomendado**: `typescript: { ignoreBuildErrors: false }`, `tsconfig.json: strict: true, noImplicitAny: true, noUncheckedIndexedAccess: true`. Resolver los errores resultantes (probablemente cientos, todos detectables en un día de trabajo).

### A-CRIT-009: Sin strategy de migraciones Prisma — `db:push --accept-data-loss`
- **Ubicación**: `package.json:9` (`"db:push": "prisma db push --accept-data-loss"`), ausencia de `prisma/migrations/` directory
- **Síntoma**: No existe `prisma/migrations/`. El comando de "aplicar schema" es `prisma db push --accept-data-loss`, que es **destructivo**: si renombras una columna o cambias un tipo (Float → Decimal), Prisma **dropea la columna y todos sus datos** sin advertir.
- **Causa raíz**: El README declara `bun run db:push` como flujo estándar de "aplicar schema a la BD" (README:62).
- **Impacto**: En producción con datos reales, **cualquier cambio de schema provoca pérdida de datos**. No hay rollback posible. El README además afirma "swap a PostgreSQL: solo `provider = \"postgresql\"`" pero **no hay migraciones** que portar a Postgres — habría que recrear el schema desde cero perdiendo todos los datos.
- **Fix recomendado**: Inicializar `prisma migrate dev` (aunque sea con `--create-only`) para empezar a generar migraciones. Migrar a `prisma migrate deploy` en CI/CD. Documentar el proceso de rollback. Para el swap a Postgres, escribir migración específica con `prisma migrate diff`.

---

## 🟠 Hallazgos ALTOS

### A-ALT-001: ESLint configurado con TODAS las reglas significativas en `"off"`
- **Ubicación**: `eslint.config.mjs:11-44`
- **Síntoma**: Reglas desactivadas: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-non-null-assertion`, `@typescript-eslint/ban-ts-comment`, `react-hooks/exhaustive-deps`, `react-hooks/purity`, `react/display-name`, `@next/next/no-img-element`, `prefer-const`, `no-console`, `no-debugger`, `no-empty`, `no-fallthrough`, `no-unreachable`, `no-undef`, `no-redeclare`, etc. (20+ reglas). El único control real es `nextCoreWebVitals` + `nextTypescript` activados, pero las overrides los desactivan.
- **Causa raíz**: Configuración "permissive" para no pelear con el código. Nunca se endureció.
- **Impacto**: `bun run lint` siempre pasa (verificado en worklog ERP-PRODUCCION-COSTOS línea 1396). Esto da **falsa sensación de calidad**. Los 463 `any` explícitos, los `console.log` en producción, los hooks con dependencias faltantes — todo pasa el lint.
- **Fix recomendado**: Reactivar las reglas una por una con `--max-warnings=0`. Empezar por `no-explicit-any: warn`, `no-unused-vars: warn`, `react-hooks/exhaustive-deps: warn`. Corregir gradualmente. Llegar a `error` en CI.

### A-ALT-002: SPA monolítico en `src/app/page.tsx` derrocha Next.js App Router
- **Ubicación**: `src/app/page.tsx:1-199`
- **Síntoma**: Aplicación completa en una sola ruta `/` con `useState<View>("dashboard")` y cascade `{view === "terceros" && <TercerosView />}` para 30+ vistas. **Eager imports** de 30 componentes en la parte superior — el bundle inicial incluye TODOS los views (~50k LOC). No hay `app/[view]/page.tsx` con routing, no hay `loading.tsx`, no hay `error.tsx`, no hay `not-found.tsx`, no hay `Suspense`, no hay `next/dynamic`. El PWA manifest dice `start_url: "/?view=facturas&mode=pos"` pero `page.tsx` nunca lee `window.location.search` — el deep link **no funciona**.
- **Causa raíz**: Probablemente arrancó como SPA rápido y nunca se migró al patrón App Router.
- **Impacto**:
  - First Load JS pesado (los 30 components + lib + UI).
  - No SSR de ninguna vista (todo client).
  - No code-splitting → no lazy loading de módulos verticales (restaurante, hotel, cafetero, servicios públicos se cargan aunque el usuario sea contador y nunca los use).
  - Deep linking imposible (URL no cambia al navegar).
  - No `404` ni `error.tsx` → si `ProduccionView` tira, toda la app muere.
- **Fix recomendado**: Migrar a `app/(authed)/[view]/page.tsx` con `dynamic(() => import(...))` por vista. Mover auth a `middleware.ts`. Implementar `error.tsx` y `loading.tsx` por segmento. Para PWA, leer query params en el Home.

### A-ALT-003: 0 usos de TanStack Query / SWR; 150 `await fetch()` directos en componentes
- **Ubicación**: `package.json` declara `@tanstack/react-query: ^5.82.0` pero `grep -rl "useQuery\|useMutation" src/` → 0 resultados. `grep -rh "await fetch(" src/components` → 150 ocurrencias en 28 archivos.
- **Síntoma**: Cada vista reimplementa su propio fetch: `useEffect(() => { fetch("/api/x").then(r => r.json()).then(setData) }, [])`. Patrón repetido en 84 componentes. Hay un `useEffect` con `[]` y otro con dependencias en cascada (ver `facturacion-view.tsx:532-544` — dos efectos que ambos llaman a `cargar`, generando doble fetch en mount inicial).
- **Causa raíz**: React Query instalado pero nunca integrado (no hay `QueryClientProvider` en `layout.tsx`). El patrón useEffect+fetch se volvió el "estándar" del proyecto.
- **Impacto**:
  - No hay cache cross-view: abrir facturas dos veces hace dos requests.
  - Race conditions: si el usuario navega rápido, responses de requests anteriores sobrescriben state nuevo (no `AbortController`).
  - No hay invalidation automática tras mutación — el usuario debe refrescar manualmente.
  - No hay retry/backoff automático.
- **Fix recomendado**: Instalar `<QueryClientProvider>` en `layout.tsx`. Migrar fetches a hooks `useQuery` / `useMutation`. Centralizar tipos de respuesta en `src/lib/api-contracts.ts`.

### A-ALT-004: Componentes monolíticos — 15 archivos `.tsx` superan 1.500 líneas
- **Ubicación**: `produccion-view.tsx` (2.711), `restaurante-view.tsx` (2.153), `servicios-view.tsx` (2.010), `facturacion-view.tsx` (1.971), `radian-view.tsx` (1.925), `bancos-view.tsx` (1.861), `cafetero-view.tsx` (1.822), `mcp-view.tsx` (1.820), `hotel-view.tsx` (1.788), `niif-view.tsx` (1.606), `parametros-view.tsx` (1.599), `compras-view.tsx` (1.558), `contabilidad-view.tsx` (1.550), `nomina-view.tsx` (1.544), `taller-view.tsx` (1.445). Total: 26 archivos >1.000 líneas, 30 archivos >500 líneas.
- **Síntoma**: Cada `*-view.tsx` define el componente principal + 5-10 subcomponentes + helpers + tipos + badges en un solo archivo. Mezcla estado de servidor (fetch + setData), estado de UI (tabs, modales, formularios), helpers de formato y presentación.
- **Causa raíz**: Cada agente del worklog añadió un módulo nuevo "para tener todo junto". El modelo mental es "un archivo por vista" en lugar de "una feature por carpeta".
- **Impacto**:
  - Dificultad de mantenimiento: un cambio menor en un badge obliga a scrollear 2k líneas.
  - Dificultad de revisión: un PR que toca `produccion-view.tsx` es ilegible.
  - Duplicación: helpers `formatCurrency`, `formatDate`, `round2` se redefinen en cada archivo.
  - Ineficiencia de build: turbopack no puede tree-shake subcomponentes no usados dentro del mismo archivo.
- **Fix recomendado**: Estructura por feature: `src/features/produccion/{OrdenesList.tsx, NuevaOrdenForm.tsx, RecetasTab.tsx, HistoricoTab.tsx, components/SeccionDetalles.tsx, hooks/useOrdenes.ts, api.ts, types.ts}`. Mover helpers a `src/lib/format.ts` (ya existe `currency-fn.ts` que no se usa en todas las vistas).

### A-ALT-005: Race conditions en generación de consecutivos (DIAN, comprobantes, números)
- **Ubicación**: `src/app/api/facturas/route.ts:170-171, 319-322`, `src/app/api/nomina/route.ts:137-144`, `src/app/api/nomina/route.ts:427-430`, `src/app/api/contabilidad/route.ts:183-184`, `src/app/api/creditos/[id]/pagar-cuota/route.ts:58-61`, etc.
- **Síntoma**: Patrón universal:
  ```ts
  const consecutivo = resolucion.consecutivoSiguiente;   // read
  // ... crear factura con numero = prefijo-consecutivo
  await db.resolucionDian.update({ data: { consecutivoSiguiente: { increment: 1 } } });  // write
  ```
  Y para comprobantes contables:
  ```ts
  const cnt = await db.comprobante.count({ where: { empresaId } });
  const numero = `CG-${year}-${String(cnt + 1).padStart(6, "0")}`;
  ```
  **TOCTOU** clásico: dos requests simultáneos leen el mismo `count`, ambos crean comprobante con el mismo número, el segundo falla por `@@unique([empresaId, numero])` o peor, no falla si el unique index no existe.
- **Causa raíz**: Prisma no soporta `RETURNING` directo en SQLite para insert-or-get-next. El patrón `count + 1` parece simple pero es incorrecto bajo concurrencia.
- **Impacto**: Bajo carga real (cajero POS facturando mientras contador causa asiento manual), dos comprobantes pueden colisionar. En el mejor caso el segundo insert lanza `P2002` y el usuario ve error 500. En el peor caso (sin unique constraint) se generan duplicados.
- **Fix recomendado**: Para `consecutivoSiguiente`: `update({where: {id}, data: {consecutivoSiguiente: {increment: 1}}})` que retorna el nuevo valor atómicamente, y usarlo como `consecutivo`. Para comprobantes: crear tabla `ContadorSecuencia(empresaId, tipo, año, siguiente)` con update atómico, o usar `RETURNING` en SQL nativo. Alternativamente, bloquear con `SELECT FOR UPDATE` (Postgres) o transacciones serializables.

### A-ALT-006: `serverError(message, e)` filtra stack traces y errores Prisma al cliente
- **Ubicación**: `src/lib/api.ts:28-31`
- **Síntoma**:
  ```ts
  export function serverError(message: string, error?: unknown) {
    console.error("[serverError]", message, error);
    return NextResponse.json({ error: message, details: error }, { status: 500 });
  }
  ```
  El `error` (que típicamente es un `PrismaClientKnownRequestError` con `meta`, `code`, `stack`) se serializa como JSON y se envía al navegador del cliente. Verificado en TODOS los endpoints: `facturas/route.ts:370`, `nomina/route.ts:332`, `contabilidad/route.ts:218`, etc.
- **Causa raíz**: Helper diseñado para "debug fácil" sin pensar en fuga de información.
- **Impacto**: Filtración de información sensible: nombres de columnas, nombres de tablas, IDs internos, sentencias SQL parciales. Ayuda a atacantes a entender el schema para futuros vectores.
- **Fix recomendado**: Nunca devolver el error crudo al cliente. Logging estructurado con correlation ID. Respuesta al cliente: `{ error: "internal_error", requestId: "uuid" }`. El servidor loguea `{ requestId, message, stack, prismaError }` a un sink (pino → stdout → Datadog/Sentry).

### A-ALT-007: 463 ocurrencias de `any`/`as any`/`as unknown as` en 131 archivos
- **Ubicación**: distribución: `src/lib/mcp-server.ts` (26), `src/lib/pdf.tsx` (13), `src/lib/import-excel.ts` (12), `src/lib/dian-real.ts` (11), `src/lib/mcp-client.ts` (8), `src/lib/indexeddb.ts` (6), `src/components/produccion/produccion-view.tsx` (22), `src/components/mcp/mcp-view.tsx` (17), `src/components/radian/radian-view.tsx` (16), `src/components/servicios-publicos/servicios-view.tsx` (17), `src/components/restaurante/restaurante-view.tsx` (15), `src/components/niif/niif-view.tsx` (16), `src/components/facturacion/facturacion-view.tsx` (15), `src/app/api/nomina/route.ts` (9), etc. — 131 archivos.
- **Síntoma**: `const where: any = {...}`, `const detallesData: any[] = []`, `r.devengos as any[]`, `(n as any)._count?.detalles`, `usuario.rol as any`, `catch (e: any)`. Combinado con `noImplicitAny: false` en tsconfig.
- **Causa raíz**: Prisma genera tipos pero los desarrolladores los bypasean para "avanzar más rápido". El `as any` se vuelve vicioso.
- **Impacto**: TS pierde toda utilidad. Cambios en schema Prisma no se propagan a los endpoints. Refactors imposibles sin romper silenciosamente.
- **Fix recomendado**: Para `where`: usar `Prisma.FacturaVentaWhereInput`. Para `detallesData`: definir tipo explícito. Para `catch`: cambiar a `catch (e: unknown)` + `if (e instanceof Prisma.PrismaClientKnownRequestError)`.

### A-ALT-008: Sin logging estructurado ni tracking de errores
- **Ubicación**: 0 dependencias en `package.json` de `pino`, `winston`, `bunyan`, `sentry`, `bugsnag`, `datadog`. Sólo `console.error`/`console.log` dispersos.
- **Síntoma**: `serverError` hace `console.error("[serverError]", message, error)`. `auditAction` en `lib/tenant.ts:290` hace `console.error("[auditAction] error registrando auditoría:", e)`. No hay correlation IDs. No hay niveles (info/warn/error/fatal). No hay sink estructurado (JSON lines a stdout).
- **Causa raíz**: No se priorizó observabilidad.
- **Impacto:**
  - En producción no se puede correlacionar un 500 de cliente con un log de servidor.
  - `console.log` en un serverless/edge runtime puede no aparecer en el log aggregator.
  - No hay alertas automáticas en errores 500.
  - Imposible debugar un bug reportado por un usuario sin timestamp ni request ID.
- **Fix recomendado**: Instalar `pino` con `pino-http` middleware. Generar `req.id` (UUID) en middleware.ts y propagarlo en `serverError`. Configurar Sentry para errores no manejados. Para alertas, métricas de-count de 500s a Datadog.

### A-ALT-009: `useEffect` mal usado — doble fetch, module-level mutable state, debounce manual
- **Ubicación**: `src/components/facturacion/facturacion-view.tsx:221-225` (module-level `_keyCounter`), `:411-419, :422-434` (dos `useEffect` con `useRef` para tracking de estado previo, generan re-renders), `:532-534` y `:542-544` (doble fetch en mount), `:537-540` (debounce manual con `setTimeout`), 137 `useEffect` totales en componentes
- **Síntoma**:
  ```ts
  let _keyCounter = 0;  // module-level mutable, compartido entre instancias y HMR
  function nextKey() { _keyCounter += 1; return `it-${Date.now()}-${_keyCounter}`; }
  ```
  Y en `ListaFacturas`:
  ```ts
  const cargar = useCallback(async (q?: string) => { fetch(...) }, []);
  useEffect(() => { cargar(); }, [cargar]);  // mount: fetch 1
  useEffect(() => { cargar(debouncedSearch); }, [debouncedSearch, cargar]);  // mount: fetch 2 (debounced vacío)
  ```
  Dos effects se disparan en mount, ambos llaman `cargar` → dos requests al servidor.
- **Causa raíz**: Ausencia de abstracción de data fetching (ver A-ALT-003). Cada desarrollador reinventa el debounce y los effects.
- **Impacto**: Requests duplicados al servidor, race conditions, bugs difíciles de reproducir. `_keyCounter` es especialmente insidioso: en HMR, el contador no se reinicia, lo que produce keys de React cada vez más grandes sin razón.
- **Fix recomendado**: Migrar a TanStack Query (`useQuery` con `enabled: !!debouncedSearch`). Eliminar `_keyCounter` y usar `crypto.randomUUID()` o `useId` de React.

### A-ALT-010: Sin tests automatizados
- **Ubicación**: `tests/` contiene sólo scripts shell (`database-runtime-build.sh`, `python-runtime-build.sh`, `python-runtime-container.sh`) para setup de runtime, **no tests**. `package.json` no tiene script `"test"`. 0 dependencias de `vitest`, `jest`, `playwright`, `cypress` (las únicas coincidencias están en `repo-crm-albra/`, un repo vendored distinto).
- **Síntoma**: 0% de cobertura de tests. El worklog documenta verificación manual con `curl` autenticado en cada task (ej: ERP-PRODUCCION-COSTOS líneas 1397-1420), pero nada automatizado.
- **Causa raíz**: Prioridad de velocidad de entrega sobre calidad sostenible.
- **Impacto**: **Un ERP contable sin tests es inaceptable.** Cualquier refactor puede romper silenciosamente la liquidación de nómina, el cálculo de CUFE, el costo promedio PEPS, el cuadre de asientos. No hay red de seguridad antes de deployar. El "testing" actual es manual con curl, lo que es insostenible: 150 endpoints × N combinaciones = cientos de flujos no probados.
- **Fix recomendado**: Instalar `vitest` + `@testing-library/react` + `playwright` para e2e. Cobertura mínima para: (1) `lib/nomina.ts` (cálculo de devengos/deducciones), (2) `lib/inventario.ts` (costo promedio), (3) `lib/currency.ts` (round), (4) `lib/auth.ts` (sign/verify JWT), (5) endpoints críticos: `facturas POST`, `contabilidad POST`, `nomina POST`. Meta inicial: 40% de cobertura en `lib/`.

### A-ALT-011: `registrarMovimientoInventario` tiene race condition TOCTOU sobre `SaldoInventario`
- **Ubicación**: `src/lib/inventario.ts:21-122`
- **Síntoma**:
  ```ts
  const movimiento = await db.movimientoInventario.create({...}); // 1
  const saldo = await db.saldoInventario.findUnique({...});     // 2 read
  // cálculos...
  await db.saldoInventario.update({...});                        // 3 write
  await db.producto.update({...});                               // 4
  ```
  Cuatro operaciones separadas sin transacción. Si dos ventas simultáneas del mismo producto+bodega ocurren: ambas leen saldo=10, ambas restan 2, ambas escriben 8. Resultado: se restaron 4 unidades pero el saldo solo bajó 2. **Dinero perdido en inventario**.
- **Causa raíz**: Patrón "read-modify-write" manual en lugar de operaciones atómicas de Prisma.
- **Impacto**: Bajo concurrencia real (POS, varios cajeros), el saldo de inventario se desincroniza del kardex. Eventualmente alguien nota "me desaparecieron 50 camisas del inventario" sin causa aparente.
- **Fix recomendado**: Tres opciones:
  - **(A) Atómico puro**: `db.saldoInventario.update({ where: { productoId_bodegaId }, data: { cantidad: { decrement: x }, costoTotal: { decrement: y } } })` — pero esto no recalcula costo promedio.
  - **(B) Transacción interactiva con lock**: `db.$transaction(async (tx) => { const saldo = await tx.$queryRaw\`SELECT * FROM SaldoInventario WHERE ... FOR UPDATE\`; ... })` — SQLite no soporta `FOR UPDATE` pero sí `BEGIN IMMEDIATE`.
  - **(C) Postgres `SELECT FOR UPDATE`**: tras migrar a Postgres.

---

## 🟡 Hallazgos MEDIOS

### A-MED-001: Validación Zod insuficiente (longitudes máximas, rangos, sanitización)
- **Ubicación**: distribución en 150 endpoints. Ejemplos representativos:
  - `facturas/route.ts:60-68` (`itemSchema`): `descripcion: z.string()` sin `max(500)`, `cantidad: z.number().positive()` sin `max(1e9)`, `precioUnitario: z.number().nonnegative()` sin `max`.
  - `creditos/route.ts:52-62`: `montoPrincipal: z.number().positive()` (acepta 1e308), `tasaInteres: z.number().min(0)` (acepta 1e6% interés), `plazoMeses: z.number().int().positive()` sin `max`.
  - `terceros/route.ts:43-61`: `numeroDocumento: z.string().min(3)` sin `max(20)`, `email: z.string().email().optional()` sin normalizar a lowercase o trim.
  - `contabilidad/route.ts:146-156`: `debito: z.number().default(0)` — acepta negativos, no usa `nonnegative`.
  - `inventario/route.ts:85-92`: `cantidad: z.number()` — acepta negativos para `tipo: "entrada"`, lo cual es incoherente.
- **Causa raíz**: Zod se usa para "validar que el campo existe y tiene tipo correcto", no para validar límites de negocio.
- **Impacto**: Un usuario (o atacante) puede enviar strings de 1MB, montos de 1 trillón, fechas del año 1000. Estos datos se persisten en SQLite, bloat la BD y potencia DoS.
- **Fix recomendado**: Establecer convención: todo string lleva `.max(N).trim()`. Todo monto lleva `.min(0).max(1e12)`. Tasa de interés `.min(0).max(100)`. Fechas con `z.coerce.date().refine(d => d > new Date(2000) && d < new Date(2100))`. Aplicar `.transform(s => s.trim())`.

### A-MED-002: N+1 queries en loops de `findMany` + `findUnique` interno
- **Ubicación**: `src/app/api/facturas/route.ts:128-144` (loop `for (const item of data.items) { await db.producto.findUnique(...) }`), `src/app/api/produccion/ordenes/[id]/route.ts` (loop para lookup de productos), `src/app/api/compras/route.ts` (mismo patrón), `src/app/api/contabilidad/route.ts:54-58` (loop manual en JS sobre movimientos en lugar de SQL `groupBy`).
- **Síntoma**: En lugar de `findMany({ where: { id: { in: ids } } })` una vez, se hace `findUnique` por cada item dentro de un loop. Y en contabilidad, el balance de prueba carga TODOS los movimientos a memoria y los suma en JS en lugar de un `db.movimientoContable.groupBy({ by: ['cuentaId'], _sum: { debito: true, credito: true } })`.
- **Causa raíz**: Patrón copy-paste sin revisión de queries.
- **Impacto**: En factura con 50 ítems, se hacen 50 queries a la BD. En una liquidación de nómina con 200 empleados, `liquidarEmpleado` por empleado + lookup de cuentas PUC por empleado = potencialmente miles de queries. Lentitud visible al usuario.
- **Fix recomendado**: Batch loading con `findMany({ where: { id: { in: [...] } }})` + map. Para agregaciones, usar `groupBy` o `$queryRaw`. Para contabilidad, `groupBy` reduce tiempo de O(n) JS a O(1) SQL.

### A-MED-003: Paginación ausente en endpoints de listado "operación" (no listados principales)
- **Ubicación**: `src/app/api/contabilidad/route.ts:42-52` (op=balance: `findMany` sin skip/take de todos los movimientos), `:97-105` (op=mayor: `findMany` sin paginación de todos los movimientos de una cuenta), `:122-130` (op=auxiliar), `src/app/api/inventario/route.ts:33-40` (op=saldos: `findMany` sin paginación), `src/app/api/dashboard/route.ts` (potencialmente), `src/app/api/medios-magneticos/[id]/route.ts`.
- **Síntoma**: Los GET de listados principales (`/api/facturas`, `/api/terceros`) sí paginan, pero los "sub-endpoints" vía `op=` no. `contabilidad?op=balance` carga TODOS los movimientos contables de la empresa para sumarlos en JS.
- **Causa raíz**: Las queries de "operación" se diseñaron pensando en devolver "todo" para cálculos en JS.
- **Impacto**: Para una empresa con 100k movimientos contables anuales, `balance` carga 100k filas en memoria cada vez. SQLite lo aguanta pero Postgres o un container con 256MB RAM no. Y el response JSON es de varios MB.
- **Fix recomendado**: Mover aggregaciones a SQL (`groupBy`, `_sum`). Para listados de movimientos, paginar con `skip/take` + cursor. Endpoint de balance separado que devuelva sólo agregados por cuenta, no detalle.

### A-MED-004: Anti-patrón REST: `?op=` para múltiples recursos en un mismo endpoint
- **Ubicación**: `src/app/api/inventario/route.ts:15-83` (op=bodegas|saldos|kardex|movimientos), `src/app/api/contabilidad/route.ts:15-143` (op=cuentas|comprobantes|balance|mayor|auxiliar), `src/app/api/empresa/route.ts`, `src/app/api/mcp/route.ts`, `src/app/api/medios-magneticos/route.ts`.
- **Síntoma**: En lugar de `GET /api/inventario/bodegas`, `GET /api/inventario/saldos`, `GET /api/kardex?productoId=...`, se usa `GET /api/inventario?op=bodegas`. El `op` es un dispatch dentro del handler. Cada `op` devuelve shape distinto.
- **Causa raíz**: Simplificación inicial para no crear muchos archivos.
- **Impacto**: Contradicción con REST. No cacheable por URL predecible. Documentación difícil. Type safety imposible (el response depende del query param). En TypeScript, el cliente no puede saber qué tipo devuelve sin leer el código del handler.
- **Fix recomendado**: Refactor a `/api/inventario/bodegas/route.ts`, `/api/inventario/saldos/route.ts`, `/api/kardex/route.ts`, etc. Cada endpoint con su tipo de response claro.

### A-MED-005: Soft delete inconsistente entre tablas
- **Ubicación**: `prisma/schema.prisma` mezcla 4 estrategias:
  - **Tabla con `activo: Boolean`**: `Usuario`, `Tercero`, `Producto`, `Banco`, `CuentaBancaria`, `CajaPOS`, `ListaPrecio`, `CentroCosto`, `Impuesto`, `UnidadMedida`, `ResolucionDian`, `MCPConexion`, `NominaConcepto`, `ActividadEconomica` (14 modelos).
  - **Tabla con `estado: "vigente" | "anulada"`**: `FacturaVenta`, `FacturaCompra`, `ReciboCaja`, `ComprobanteEgreso`, `Nota`, `CDP`, `CRP`, `ModificacionPresupuestal`, `CompraCafe`, `MedioMagnetico` (10 modelos).
  - **Tabla con `estado` multi-valor (no anulable)**: `Comprobante` (`borrador|contabilizado|anulado`), `Credito` (`vigente|pagado|en_mora|anulado`), `Nomina` (`borrador|causada|pagada|anulada`), `Comanda`, `Mesa`, `Habitacion`, `ReservaHotel`, `OrdenServicioTecnico`, `OrdenProduccion`, `EventoRadian`, `DIANEnvio` (10+ modelos).
  - **Tabla SIN soft delete**: `Empresa` (no se puede desactivar, solo borrar en cascade), `Parametro`, `MovimientoContable`, `MovimientoInventario`, `DetalleFacturaVenta`, `DetalleNomina`, `CuotaCredito`, `PruebaTaza`, `LecturaMedidor` (40+ modelos de detalle o audit).
- **Causa raíz**: Cada agente eligió su propia convención.
- **Impacto**: GET endpoints deben acordar cuál estrategia aplica a cada tabla. En `terceros/route.ts:127-131` DELETE hace `activo: false`, pero GET no filtra por activo → terceros "eliminados" siguen apareciendo en listados. Confusión para el usuario que cree que borró pero ve el registro.
- **Fix recomendado**: Adoptar UNA convención. Recomendada: `estado: String @default("activo")` con enum `activo|inactivo|anulado` en TODAS las tablas de maestros y documentos. Para tablas de movimiento, no permitir soft delete (son inmutables, con "anulación" con contramovimiento). Filtrar `estado: "activo"` por defecto en GETs.

### A-MED-006: `onDelete` ausente en 19 relaciones (default=Restrict en SQLite)
- **Ubicación**: `prisma/schema.prisma` — 50 relaciones con `onDelete: Cascade`, 8 con `onDelete: SetNull`, **19 relaciones SIN `onDelete`** explícito (default en SQLite es `Restrict`, en Postgres también). Ejemplos problemáticos:
  - `Producto.unidadMedidaId` (línea 315) sin onDelete — si se borra UnidadMedida, falla el delete de UnidadMedida.
  - `Tercero.ciudadId` (línea 264) sin onDelete — ciudad bloqueada por terceros.
  - `CuentaPuc.cuentaPadreId` (línea 668) sin onDelete — no se puede borrar cuenta padre con subcuentas (correcto, pero implícito).
  - `Comprobante.centroCostoId` (línea 692) sin onDelete.
  - `MovimientoInventario.bodegaId` (línea 436) sin onDelete.
  - `DetalleNomina.terceroId` (línea 840) — `// raw FK sin relation para no tocar schema Tercero` — **comentario en el schema que admite tech debt**.
  - `ReservaHotel.habitacionId` (línea 1311) sin onDelete.
- **Causa raíz**: Prisma permite omitir `onDelete`, pero el comportamiento implícito no es obvio.
- **Impacto**: Borrados accidentalmente bloqueados por FKs que el desarrollador no sabe que existen. O peor, en migración a Postgres el default cambia y empiezan a fallar queries.
- **Fix recomendado**: Auditar cada relación y declarar `onDelete` explícito. Para FKs "raw" sin relation (como `DetalleNomina.terceroId`), añadir `relation` formal con onDelete.

### A-MED-007: Naming inconsistente en schema Prisma (español vs inglés, camelCase mezclado)
- **Ubicación**: `prisma/schema.prisma`
  - **Campos en español**: `numero`, `nombre`, `codigo`, `fecha`, `descripcion`, `observaciones`, `tipo`, `estado`, `activo`, `empresaId`, `razonSocial`, `numeroDocumento`, `digitoVerif`, `apellido1`, `nombreComercial`, `direccion`, `telefono`, `ciudad`, `departamento`, `pais`, `responsabilidad`, `representanteLegal`, `regimenTributario`, `diasPlazo`, `cupoCredito`, `saldoCartera`, `costoPromedio`, `ultimoCosto`, `precio1`, `precio2`, `precio3`, `tarifaIva`, `stockMinimo`, `stockMaximo`, `manejaLotes`, `manejaSeriales`, `cajeroId`, `formaPago`, `efectivoRecibido`, `cambio`, `saldoPendiente`, `estadoCartera`, `estadoDIAN`, `cufe`, `qrCode`, `xmlUBL`, `numeroResolucion`, `fechaResolucion`, etc.
  - **Campos en inglés**: `email`, `website`, `logo`, `moneda`, `decimales`, `redondeo`, `zonaHoraria`, `planCuentas`, `passwordHash`, `resetToken`, `ultimoLogin` (mixed), `factor`, `parentId`, `children`, `nivel`, `unitPrice` no existe pero `precioUnitario` sí, `createdAt`, `updatedAt`.
  - **Inconsistencias dentro del mismo modelo**: `ResolucionDian` tiene `rangoinicio` (línea 161, lowercase), `rangoinicioActual` (línea 163, lowercase), `rangoFin` (línea 162, camelCase), `rangoFinActual` (línea 164, camelCase) — typo visible.
  - **Snake_case en `ReporteNIIF.json_data`** (línea 1622) — único campo snake_case.
  - **`MCPLog.direccion`** (línea 764) — ¿es dirección o dirección de red? Ambiguo.
- **Causa raíz**: Cada modelo se escribió en el idioma del dominio (español colombiano) pero sin norma de cuándo usar inglés.
- **Impacto**: Onboarding difícil para devs internacionales. Búsqueda por nombre de campo confusa. Esquema imposible de estandarizar post-facto sin migración dolorosa.
- **Fix recomendado**: Decidir y documentar: o TODO español (aceptar y seguir), o TODO inglés con `@map` para preservar columnas en BD. Lo importante es la consistencia.

### A-MED-008: Datos en JSON strings (`devengos`, `deducciones`, `aplicacionFacturas`, `resources`, `tools`, `modulos`)
- **Ubicación**: `DetalleNomina.devengos/deduccion/aportesPatronales/provisiones` (líneas 846-849), `ReciboCaja.aplicacionFacturas` (línea 601), `ComprobanteEgreso.aplicacionCompras` (línea 624), `MCPConexion.resources/tools/prompts` (líneas 743-745), `PlanSuscripcion.modulos` (línea 1651), `Nota.referencias` (línea 1103), `ReporteNIIF.json_data` (línea 1622), `AuditoriaMultiTenant.detalles` (línea 1672).
- **Síntoma**: Campos `String?` que contienen `JSON.stringify([{...}])`. En código: `devengos: JSON.stringify(d.resultado.devengos)` (nomina/route.ts:295), `modulos: JSON.parse(plan.modulos) as string[]` (tenant.ts:138). No hay validación de schema, no hay type safety, no hay índices para buscar dentro del JSON.
- **Causa raíz**: SQLite no tiene tipo JSON nativo (sí lo tiene Postgres con `Json`).
- **Impacto**:
  - Imposible hacer queries como "dame todas las nóminas donde el empleado X tiene devengo de auxilio de transporte > 100k". Hay que cargar todos los registros y parsear en JS.
  - JSON puede estar malformado silenciosamente (`JSON.parse` con try/catch en `tenant.ts:140`).
  - Sin índice en campos internos del JSON.
- **Fix recomendado**: Para SQLite: tablas hijas con FK (`NominaDevengo`, `NominaDeduccion`). Para Postgres: tipo `Json` con GIN index. Para `MCPConexion.resources`, normalizar a tabla `MCPResource` con FK.

---

## 🟢 Hallazgos BAJOS

### A-BAJ-001: `db.ts` hack con `require.cache` + `bustPrismaClientCacheAndReload`
- **Ubicación**: `src/lib/db.ts:90-117`
- **Síntoma**: Para "auto-recargar" el PrismaClient tras `prisma db push`, se hace `delete require.cache[resolved]` + `require("@prisma/client")` fresco. Esto viola ESM (Next.js 16 usa ESM). `require` en código ESM requiere workaround. El hack se activa si `schemaHash()` cambió o si `hasAllModels()` dice false (lista de 47 modelos hardcoded).
- **Causa raíz**: Necesidad de desarrollo: tras `prisma db push`, Turbopack cachea el PrismaClient viejo y los modelos nuevos no aparecen. La solución es matar el dev server y reiniciar, pero se optó por automatizar.
- **Impacto**: Bajo en producción (no se corre en runtime), pero es frágil: si el orden de los `require` cambia o si Next cambia el sistema de módulos, se rompe. El `as any` en `hasAllModels` (línea 78) y `bustPrismaClientCacheAndReload` (línea 113) degrada tipos.
- **Fix recomendado**: Documentar que tras `prisma db push` el operador debe reiniciar el dev server. Eliminar el hack. Si se necesita hot-reload de schema, usar `prisma generate` y `nodemon` watch del schema.

### A-BAJ-002: `start_url` del manifest PWA no funciona (SPA sin routing)
- **Ubicación**: `public/manifest.json:7` (`"start_url": "/?view=facturas&mode=pos"`) + `src/app/page.tsx` (no lee query params)
- **Síntoma**: El manifest apunta a `/?view=facturas&mode=pos` pero `page.tsx` no hace `const params = new URLSearchParams(window.location.search); const initialView = params.get("view") as View ?? "dashboard"`. El usuario que abre la PWA desde el icono del home screen siempre cae en "dashboard".
- **Causa raíz**: PWA se añadió tarde, sin integración con el routing del SPA.
- **Impacto**: UX pobre: el cajero POS debe navegar manualmente a facturas cada vez que abre la PWA.
- **Fix recomendado**: Si se migra a App Router con `/[view]` (ver A-ALT-002), `start_url` funcionaría solo. Mientras tanto, leer `window.location.search` en `page.tsx`.

### A-BAJ-003: Comentarios `// xxxxx =====` ruido en código
- **Ubicación**: Casi todos los archivos. Ej: `src/lib/api.ts:1-3`, `src/lib/auth.ts:1-5`, `src/lib/inventario.ts:1-2`, `src/app/api/contabilidad/route.ts:8`, etc.
- **Síntoma**: Comentarios tipo banner decorativo con `// ================` seguido de título del archivo o sección. Decorativos, no informativos.
- **Causa raíz**: Estilo personal de los agentes que escribieron el código.
- **Impacto**: Bajo pero real: ruido visual, desincronización con el código (ej: `lib/api.ts:1` dice "Helpers comunes de API" pero también define wrappers que no se usan).
- **Fix recomendado**: Eliminar. Reemplazar con JSDoc en funciones exportadas, que TypeScript entiende y sirve para tooltips.

### A-BAJ-004: `import.meta.url` + `__dirname` en `eslint.config.mjs` innecesario
- **Ubicación**: `eslint.config.mjs:3-6`
- **Síntoma**: Calcula `__dirname` manualmente con `fileURLToPath(import.meta.url)` y `dirname()` — pero el archivo no usa `__dirname` en ninguna parte (sólo `ignores` con paths relativos).
- **Causa raíz**: Copy-paste de un template.
- **Impacto**: Código muerto.
- **Fix recomendado**: Eliminar las líneas 3-6.

---

## 📊 Métricas objetivas

| Métrica | Valor | Comentario |
|---|---|---|
| Líneas de código (src/) | 77.008 | distribuidas en 263 archivos TS/TSX |
| Modelos Prisma | 81 | cobertura amplia de dominio ERP |
| Endpoints API (route.ts) | 150 | bien delimitados por dominio |
| Componentes TSX | 84 | alta granularidad de features |
| Endpoints con `$transaction` | 8 / 150 (5%) | insuficiente para un ERP contable |
| Endpoints que validan RBAC | 3 / 150 (2%) | RBAC declarado pero no aplicado |
| Endpoints con `requireTenantAccess` | 5 / 150 (3%) | aislamiento tenant no garantizado |
| Archivos con `any`/`as any` | 131 | 50% del código afectado |
| Ocurrencias de `any` | 463 | problema sistémico |
| `console.log`/`warn`/`error` | 25 en 21 archivos | sin logger estructurado |
| Cobertura de tests | 0% | cero tests automatizados |
| Componentes >1000 líneas | 26 / 84 (31%) | alta monoliticidad |
| Componentes >1500 líneas | 15 / 84 (18%) | derivados de features verticales |
| Wrappers `withAuth`/`parseBody` | definidos, 0 usos | código muerto |
| Hooks `useEffect` en components | 137 | sin abstracción de data fetching |
| Llamadas directas `fetch()` en components | 150 | sin TanStack Query |
| `Float` en schema Prisma | 193 | tipo equivocado para dinero |
| `Decimal` en schema Prisma | 0 | ausencia total |
| Migraciones Prisma | 0 | sólo `db:push --accept-data-loss` |
| Reglas ESLint desactivadas | 20+ | sin red de calidad |
| `ignoreBuildErrors` TS | true | sin type safety en build |
| Logger estructurado | no | sólo `console.error` |
| OpenAPI/Swagger | no | API sin documentar |
| Error tracking (Sentry) | no | sin observabilidad |
| Reglas de `noImplicitAny` | false | TS permisivo |
| `reactStrictMode` | false | React sin safety mode |

---

## ✅ Puntos fuertes (justo es justo)

A pesar de la severidad de los hallazgos, el proyecto tiene aciertos:

1. **Cobertura funcional impresionante**: 81 modelos Prisma, 150 endpoints, 30+ módulos verticales (facturación DIAN, nómina electrónica, NIIF, medios magnéticos, Radian, restaurante, hotel, cafetero, servicios públicos, taller, producción/costos, presupuestal público). El alcance de negocio es real y profundo.

2. **Multi-tenancy con `empresaId` en TODOS los modelos relevantes** + índices compuestos `@@index([empresaId, ...])` en 88 lugares. La columna está en todas partes donde debería estar.

3. **Índices Prisma bien distribuidos**: 88 `@@index` y 41 `@@unique` cubren los campos de filtro frecuente (empresaId+fecha, empresaId+estado, empresaId+numero, etc.).

4. **Uso de `Promise.all` para queries paralelas** en listados (`findMany` + `count` en paralelo, ver `facturas/route.ts:42-51`, `terceros/route.ts:26-35`) — patrón correcto para evitar waterfall de queries.

5. **Auth basada en JWT (jose) con cookies httpOnly + secure + sameSite=lax** — mejor que sesiones en memoria. RBAC declarado con 5 roles y wildcard (`contabilidad:*`).

6. **Cifrado AES-256-GCM para credenciales DIAN** (`ConfiguracionDIAN.certificadoP12Enc`, `authTokenEnc`) — estándar criptográfico correcto.

7. **PWA con Service Worker + IndexedDB para POS offline-first** (`public/sw.js` 494 líneas, `src/lib/indexeddb.ts`, `src/hooks/use-offline-pos.ts`) — implementación completa con background sync y encolamiento de facturas pendientes.

8. **Zod para validación de input** en endpoints POST (aunque insuficiente en límites, ver A-MED-001, está presente en la mayoría).

9. **Estructura de archivos consistente** — `src/app/api/<recurso>/route.ts` + `src/lib/<modulo>.ts` + `src/components/<modulo>/<modulo>-view.tsx`. Predecible para navegar.

10. **Worklog extremadamente detallado** (1.440 líneas, 17 secciones por tarea) — documentación rica del proceso de desarrollo, incluyendo verificación funcional con curls. Como historia de decisiones, es valiosísima para un nuevo dev.

11. **Schema Prisma bien comentado** con referencias al origen Hermes (`§5.1`, `§5.2`, etc.) — trazaabilidad del mapeo desde el ERP original VB.NET.

12. **`CuentaPuc` con self-relation `cuentaPadre/subcuentas`** para árbol jerárquico del PUC colombiano — modelo de datos correcto para catálogo contable de 6 niveles.

13. **`Comprobante + MovimientoContable`** separa correctamente cabecera de asiento y líneas — patrón contable estándar.

14. **Tipos `cuid()` para IDs** — mejor que UUIDv4 para SQLite (más cortos, orden de creación aproximado).

15. **Endpoints state-machine correctos** (borrador→en_proceso→finalizada con anulación) en `taller/ordenes`, `produccion/ordenes`, `radian/eventos` — patrón consistente para workflows.

---

## 🎯 Conclusiones del auditor

**El ERP Marsella es un producto funcional muy bien ejecutado como DEMO y como victoria de alcance, pero no está listo para producción.** Lo que más impresiona es la amplitud del dominio cubierto en 17 tareas de worklog: 30+ módulos verticales, facturación DIAN real (no mock), nómina electrónica CUNE, NIIF ESF/EER/ECP/EFE, medios magnéticos, Radian, MCP — todo implementado con detalle. Como muestra de capacidad técnica, el worklog es excelente.

**Pero como sistema contable de producción, tiene defectos estructurales que no son cosméticos:**

1. **`Float` en dinero** (A-CRIT-002) es una violación fundamental del contrato contable. Los contadores y la DIAN exigen exactitud centavo a centavo. Los "fudge factors" de `nomina/route.ts:418-424` son una admisión tácita del problema.

2. **Ausencia transaccional** (A-CRIT-001) en facturación, contabilidad y nómina significa que el sistema puede dejar dinero en limbo. El worklog documenta casos reales de "asiento falló gracefulmente" que en producción son silenciosos y silenciosamente costosos.

3. **Aislamiento multi-tenant no garantizado** (A-CRIT-007) y **RBAC no aplicado** (A-CRIT-005): el README declara 5 roles con permisos granulares, pero en código sólo 3 endpoints validan permisos. Esto es **fraude documental**. Una auditoría de seguridad real fallaría el sistema.

4. **Sin tests** (A-ALT-010): un ERP contable sin tests automatizados es un accidente esperando para pasar. Cada cambio puede romper silenciosamente el cálculo de CUFE, el costo promedio, el cuadre de asientos. La verificación manual con curl en cada task del worklog es insostenible y no escala.

5. **Calidad de tipo y lint degradada** (A-CRIT-008, A-ALT-001, A-ALT-007): `ignoreBuildErrors: true` + `noImplicitAny: false` + 20 reglas ESLint `off` + 463 `any` = sin red de seguridad estática. Es como construir un puente sin escalera de seguridad.

6. **SPA monolítico** (A-ALT-002) con 30 vistas eagerly imported derrocha el potencial de Next.js 16 App Router. No hay SSR, no hay code-splitting, no hay deep linking, no hay error boundaries. El performance del first-load debe ser pésimo.

7. **Migración a Postgres inviable sin deuda** (A-CRIT-009): el README miente al decir "swap a PostgreSQL: solo `provider = \"postgresql\"`". Sin migraciones, sin `Decimal`, sin chequeos de FK, la migración es un proyecto de semanas.

**Recomendación al usuario/decisor:**

NO despliegue este sistema a producción con datos reales hasta que se aborden los 9 hallazgos CRÍTICOS. Específicamente:

- **Sprint 1 (semana 1-2)**: A-CRIT-003 (eliminar endpoint demo), A-CRIT-004 (secreto JWT), A-CRIT-005 (RBAC en endpoints críticos), A-CRIT-007 (tenant validation en PUT/DELETE), A-CRIT-008 (reactivar strict + ignoreBuildErrors=false).
- **Sprint 2 (semana 3-5)**: A-CRIT-001 (transacciones), A-CRIT-002 (migración a Decimal — el más costoso), A-ALT-010 (tests para lib/ contable).
- **Sprint 3 (semana 6-8)**: A-CRIT-009 (inicializar migraciones Prisma), A-ALT-001 (reactivar ESLint), A-ALT-002 (migrar a App Router con routing).
- **Sprint 4 (semana 9-12)**: Refactor de componentes monolíticos, TanStack Query, eliminación de `any`, A-MED-001 (Zod más estricto).

**Deuda técnica estimada**: 12–18 semanas-hombre. Asumiendo un equipo de 2 devs senior. Si se incluye la migración Float→Decimal con backfill de datos, sumar 4-6 semanas más.

**Lo que NO recomiendo**: añadir más módulos verticales (restaurante, hotel, cafetero, servicios públicos ya están) sin antes abordar los CRÍTICOS. Cada módulo nuevo sin transacciones ni tests añade más superficie a problemas silenciosos. **La velocidad de entrega actual es activa pero insostenible.**

**Lo que SÍ recomiendo**: usar este codebase como referencia funcional excelente para reimplementar con fundamentos sólidos. El 80% del valor está en el diseño de los 81 modelos Prisma y los flujos de negocio; reimplementar con transacciones + Decimal + tests desde el día 1, copiando la lógica de negocio verificada aquí, es perfectamente viable.

**Veredicto final**: 38/100. **No apto para producción**. Demasiados defectos estructurales. Pero con potencial real de ser 85/100 tras 3 meses de refactor dirigido. El alcance del trabajo previo es lo que justifica la inversión en corregirlo, no en descartarlo.
