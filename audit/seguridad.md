# 🔒 Auditoría de Seguridad — Marsella ERP v0.5.1

**Fecha**: 2026-10-01
**Auditor**: Agente especialista en seguridad (auditor externo e independiente)
**Scope**: Next.js 16 + TypeScript + Prisma + SQLite en `/home/z/my-project`
**Stack**: Next.js 16.1.1, Prisma 6.11.1, jose 6.2.12, bcryptjs 3.0.3, xml-crypto 6.3.2, node-forge 1.4.0, zod 4.0.2, @modelcontextprotocol/sdk 1.31.0
**Tamaño**: 150 archivos `route.ts` en `/src/app/api/`, ~60 archivos en `/src/lib/`

---

## 📊 Resumen ejecutivo

- **Total de hallazgos**: 26 (CRÍTICOS: 6, ALTOS: 8, MEDIOS: 7, BAJOS: 5)
- **Score global de seguridad**: **38/100** (Deficiente — no apto para producción ni para datos financieros reales)
- **Veredicto**: El ERP Marsella **NO debe exponerse a Internet en su estado actual**. Múltiples vulnerabilidades críticas permiten acceso no autenticado, bypass de autenticación, escalada de privilegios en multi-tenant SaaS, exfiltración de certificados DIAN y abuso de la API MCP externa. La base del código muestra patrón "feature-first, security-as-afterthought": existen helpers de RBAC (`hasPermission`, `requireTenantAccess`, `auditAction`) pero solo se invocan en 3-4 endpoints de los 150 disponibles. Las dependencias están desactualizadas con **3 CVEs CRÍTICOS y 55 HIGH** confirmados por `bun audit` (incluyendo 2 RCE no autenticadas en Next.js 16.1.1 y 1 bypass de homoglifos en next-auth).
- **Recomendación inmediata**: **No desplegar a producción**. Ejecutar plan de remediación CRÍTICA (~5-10 días de ingeniería) ANTES de cualquier lanzamiento. Si ya está expuesto, rotar `APP_SECRET`, `APP_ENCRYPTION_KEY`, `MCP_API_TOKEN` y `CRON_SECRET`, regenerar certificados DIAN de todos los clientes, forzar reset de passwords, y revisar logs de auditoría multi-tenant en busca de abuso.

---

## 🔴 Hallazgos CRÍTICOS (explotables hoy)

### H-CRIT-001: Endpoint `/api/auth/demo` expuesto en producción sin validación de entorno
- **Ubicación**: `src/app/api/auth/demo/route.ts:1-65`
- **Descripción**: El endpoint `POST /api/auth/demo` crea (si no existe) la empresa `900.123.456-7` "Marsella S.A.S. (Demo)" y el usuario `demo@marsella.com` con password `demo1234` y rol **`admin`**. A continuación, emite un JWT de sesión válido por 12 horas y lo setea como cookie `httpOnly`. **No existe ningún guard que verifique `NODE_ENV !== "production"`** ni `process.env.ENABLE_DEMO === "true"`.
- **Impacto**: Cualquier persona en Internet puede invocar `curl -X POST https://<dominio>/api/auth/demo` y obtener una sesión admin plena en la empresa demo del sistema. Como la empresa demo comparte instancia de base de datos con todas las demás empresas del SaaS, y dado que el aislamiento entre empresas se basa únicamente en filtrar por `empresaId` (ver H-CRIT-004), un atacante con sesión admin de la empresa demo puede:
  1. Llamar a endpoints `/api/mcp/conexiones` con URLs externas arbitrarias → exfiltración de tokens MCP y SSRF (H-ALT-005).
  2. Generar tráfico hacia el servidor MCP interno del propio ERP usando el token de la empresa demo.
  3. Si la empresa demo se configura con certificado DIAN real (por error de un operador), el atacante podría emitir facturas falsas.
- **PoC**:
  ```bash
  curl -X POST https://erp.marsella.com/api/auth/demo -c cookies.txt
  # → 200 OK, cookie marsella_session seteada
  curl -b cookies.txt https://erp.marsella.com/api/dashboard
  # → 200 OK con datos completos de la empresa demo
  ```
- **Fix recomendado**: Eliminar la ruta `src/app/api/auth/demo/route.ts` de la rama `main` o envolverla con `if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO === "true")`. Mover la creación de seed a `scripts/seed-marsella.ts` (fuera del deploy de runtime).
- **Severidad CVSS estimada**: 9.8 (Crítica) — AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H

### H-CRIT-002: Defaults inseguros de `APP_SECRET`, `APP_ENCRYPTION_KEY`, `MCP_API_TOKEN` y `CRON_SECRET` activos en producción
- **Ubicación**: `src/lib/auth.ts:11-13`, `src/lib/crypto.ts:11-13`, `src/app/api/mcp/route.ts:15-16`, `src/app/api/dian/cron/route.ts:14-15`
- **Descripción**:
  - `APP_SECRET` default = `"marsella-erp-dev-secret-change-me-in-production-min-32-chars"` (literal en el código). Se usa para firmar y verificar TODOS los JWT (HS256).
  - `APP_ENCRYPTION_KEY` default = `"0000...0000"` (64 ceros hex = clave AES-256 toda ceros). Se usa para cifrar P12 DIAN, passwords de certificado, tokens PAC y tokens de conexiones MCP externas.
  - `MCP_API_TOKEN` default = `""` (string vacío). En `src/app/api/mcp/route.ts:51`, el chequeo `if (MCP_API_TOKEN && token === MCP_API_TOKEN)` se evalúa **falsy** cuando `MCP_API_TOKEN === ""`, por lo que el código **cae al siguiente branch que valida JWT**. Esto es seguro por accidente, pero la otra rama (líneas 53-58) hace `findFirst` de la primera empresa y autoriza al atacante. **Si el atacante envía cualquier Bearer no-JWT cuando `MCP_API_TOKEN === ""`, el flujo es: token no coincide → verifyToken falla → 401**. NO es explotable como bypass, PERO si el operador deja `MCP_API_TOKEN=""` y un atacante captura un JWT de sesión demo (H-CRIT-001), puede acceder al servidor MCP de la empresa demo sin limitación.
  - `CRON_SECRET` default = `undefined`. En `src/app/api/dian/cron/route.ts:15`, el chequeo `if (!expected || secret !== expected)` evalúa `!undefined === true` y retorna 401 siempre — el cron queda deshabilitado (no es explotable pero tampoco funciona).
- **El único `.env` presente en el repo** (`/home/z/my-project/.env`) contiene únicamente `DATABASE_URL=file:/home/z/my-project/db/custom.db`. No existe `.env.example`, no existen `APP_SECRET`, `APP_ENCRYPTION_KEY`, `MCP_API_TOKEN`, `MCP_EMPRESA_ID`, `CRON_SECRET` configurados. Esto significa que **la app está corriendo con todos los defaults inseguros**.
- **Impacto**:
  1. **Forging de JWT**: Cualquiera con acceso al código fuente (repo público, build artifact, sourcemap) conoce el `APP_SECRET` default y puede firmar JWTs para cualquier `userId`, `empresaId`, `rol: "admin"` arbitrario. Cookie válida por 12h. **Bypass total de autenticación**.
  2. **Descifrado de credenciales en reposo**: Con `APP_ENCRYPTION_KEY = "0x00...00"`, el cifrado AES-256-GCM sigue siendo sintácticamente correcto (IV aleatorio, AuthTag validado en `crypto.ts:40-50`), pero **la clave es la identidad criptográfica**. Cualquiera con acceso de lectura a la BD SQLite puede `decrypt(certificadoP12Enc)` y obtener el P12 + password en claro de TODOS los clientes. Lo mismo aplica a `proveedorTecnologicoTokenEnc` (tokens PAC) y `mCPConexion.authTokenEnc`.
- **PoC**:
  ```bash
  # Forjar JWT admin para cualquier empresaId
  APP_SECRET='marsella-erp-dev-secret-change-me-in-production-min-32-chars'
  node -e 'const jose=require("jose");(async()=>{const t=await new jose.SignJWT({userId:"x",empresaId:"<TARGET>",email:"a@b.c",nombre:"x",rol:"admin"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(new TextEncoder().encode(process.env.APP_SECRET));console.log(t)})()'
  # Setear cookie y acceder a cualquier endpoint
  curl -H "Cookie: marsella_session=$JWT" https://erp.marsella.com/api/dashboard
  ```
  ```bash
  # Descifrar P12 con clave default
  node -e 'const c=require("crypto");const k=Buffer.from("0".repeat(64),"hex");const b=Buffer.from(process.argv[2],"base64");const iv=b.subarray(0,12);const t=b.subarray(12,28);const e=b.subarray(28);const d=c.createDecipheriv("aes-256-gcm",k,iv);d.setAuthTag(t);console.log(Buffer.concat([d.update(e),d.final()]).toString())' "<valor certificadoP12Enc>"
  ```
- **Fix recomendado**:
  1. **Hacer el fallo explícito**: en `auth.ts` y `crypto.ts`, lanzar `throw new Error("APP_SECRET no configurado")` si no viene de `process.env` y `NODE_ENV === "production"`. Igual para `APP_ENCRYPTION_KEY`.
  2. Generar los secrets aleatorios al deployar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  3. Rotar TODOS los P12 y tokens PAC de TODOS los clientes asumiendo compromiso.
  4. Crear `.env.example` con placeholders (sin valores reales).
  5. Documentar el rotado periódico (cada 90 días) en ops runbook.
- **Severidad CVSS estimada**: 10.0 (Crítica) — AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H

### H-CRIT-003: RBAC granular declarado en `ROLES` pero **NO aplicado** en 145 de 150 endpoints
- **Ubicación**: `src/lib/auth.ts:19-153` (declaración de `ROLES` y `hasPermission`), vs. los 150 archivos `route.ts` en `/src/app/api/`
- **Descripción**: El helper `hasPermission(rol, permission)` se invoca en **apenas 3 endpoints**:
  - `src/app/api/resolucion-dian/route.ts:77` (`parametros:read`)
  - `src/app/api/empresas/route.ts:85` (`parametros:read` — equivocado, debería ser `:write`)
  - `src/app/api/medios-magneticos/generar/route.ts:36` (`reportes:read`)
  
  Y `session.rol !== "admin"` directo en 3 más:
  - `src/app/api/usuarios/route.ts:64`
  - `src/app/api/empresa/plan/route.ts:57`
  - `src/app/api/mcp/server-info/route.ts:26`
  
  **Los 144 endpoints restantes** (facturas, contabilidad, compras, cartera, bancos, cajas, conciliación, nómina, inventario, producción, taller, hotel, restaurante, cafetero, mascotas, vehículos, Radian, DIAN config, MCP conexiones, NIIF, presupuesto, medios magnéticos detalle, etc.) solo validan `getSession()` (autenticación) y filtran por `empresaId` (tenant). Cualquier usuario autenticado con rol `cajero`, `vendedor` o `bodeguero` puede:
  - `POST /api/contabilidad` → crear asientos contables manuales (`src/app/api/contabilidad/route.ts:158-220`)
  - `POST /api/usuarios` → crear usuarios admin (limitado a admin, OK)
  - `PUT /api/dian/config` → subir P12 y reconfigurar DIAN de la empresa (`src/app/api/dian/config/route.ts:54-111`)
  - `POST /api/mcp/conexiones` → registrar conexión MCP a URL externa arbitraria (H-ALT-005)
  - `POST /api/dian/procesar-cola` → forzar reenvío masivo a DIAN (`src/app/api/dian/procesar-cola/route.ts:11-23`)
  - `DELETE /api/facturas/[id]` → no existe DELETE, pero `PUT accion=anular` permite anular cualquier factura (`src/app/api/facturas/[id]/route.ts:47-106`)
  - `POST /api/medios-magneticos/generar` → restringido a `reportes:read` o admin, OK
  - `PUT /api/empresa/plan` → bloqueado a admin (H-CRIT-004)
  - Acceder a TODOS los reportes PDF: factura, recibo, egreso, balance, kardex, libro-diario, mayor, ejecutivo, nómina (`src/app/api/reportes/**`)
- **Impacto**: **Separación de duties rota por completo**. Un cajero de punto de venta puede manipular la contabilidad, firmar y enviar facturas a DIAN, o crear conexiones MCP externas que exfiltren datos. En un contexto de auditoría financiera colombiana (DIAN, revisoría fiscal), esto es **inaceptable** y sería observación crítica en cualquier auditoría SOX / ISO 27001.
- **PoC**:
  ```bash
  # Login como cajero (demo)
  curl -X POST https://erp.marsella.com/api/auth/demo -c c.txt
  # Crear asiento contable manual (normalmente requiere contador/admin)
  curl -b c.txt -X POST https://erp.marsella.com/api/contabilidad \
    -H "Content-Type: application/json" \
    -d '{"movimientos":[{"cuentaCodigo":"110105","debito":1000000,"credito":0},{"cuentaCodigo":"240805","debito":0,"credito":1000000}],"descripcion":"prueba"}'
  # → 200 OK (no requiere rol específico)
  ```
- **Fix recomendado**:
  1. Definir matriz `endpoint → permiso requerido` y aplicar `hasPermission(session.rol, "<module>:<action>")` al inicio de cada handler (POST/PUT/DELETE).
  2. Crear wrapper `withPermission(handler, perm)` que valide automáticamente.
  3. Bloquear por default: cualquier endpoint sensible sin `hasPermission` explícito debe fallar cerrado.
  4. Auditoría de cobertura RBAC: 150 endpoints × 4 verbos = 600 handlers a revisar.
- **Severidad CVSS estimada**: 9.1 (Crítica) — AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:L

### H-CRIT-004: Escalada de plan en SaaS multi-tenant — cualquier admin de empresa puede auto-upgradear a Enterprise
- **Ubicación**: `src/app/api/empresa/plan/route.ts:52-133` y `src/lib/auth.ts:182-212` (registerUser asigna `rol: "admin"` automáticamente)
- **Descripción**: El endpoint `PUT /api/empresa/plan` valida `session.rol !== "admin"` (línea 57) pero NO valida si el usuario es **superadmin del sistema** (no existe tal rol). El registro de empresa nueva en `registerUser` asigna `rol: "admin"` automáticamente a quien crea la empresa. Combinado, esto significa:
  1. Cualquiera puede registrar una empresa nueva (con NIT ficticio) → obtiene `rol: "admin"`.
  2. Como admin, puede `PUT /api/empresa/plan` con body `{ plan: "enterprise", modulos: [...todos...], limiteUsuarios: 100, limiteFacturasMes: 50000, vigenteHasta: "2099-12-31", estado: "activo" }`.
  3. **El comentario en el código** (línea 68-70) admite: *"Si la empresa objetivo no es la del usuario, validar que sea admin del sistema (en SaaS real se validaría rol de superadmin). Aquí permitimos solo modificar la propia empresa por ahora."* — es decir, los desarrolladores son conscientes de que el modelo de plan es **honor-system**: cada empresa se autolimita.
  4. `checkPlanLimits` (`src/lib/tenant.ts:299-373`) confía en `PlanSuscripcion` persistido, que la propia empresa puede modificar.
- **Impacto**: El modelo de negocio SaaS está completamente roto. Cualquier usuario puede auto-asignarse plan Enterprise con módulos DIAN, MCP, hotel, restaurante, etc. Esto invalida el modelo de facturación por uso y permite a competidores o curiosos explotar el ERP gratis sin tope. Adicionalmente, un atacante puede deshabilitar sus propios límites para spammear la DIAN o el servidor MCP externo, generando costos operacionales a la compañía.
- **PoC**:
  ```bash
  curl -X POST https://erp.marsella.com/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"empresa":{"nit":"900.999.999-9","razonSocial":"Free Tier Bypass SA"},"usuario":{"nombre":"Hacker","email":"h@x.com","password":"12345678"}}' -c c.txt
  curl -b c.txt -X PUT https://erp.marsella.com/api/empresa/plan \
    -H "Content-Type: application/json" \
    -d '{"plan":"enterprise","limiteUsuarios":100,"limiteFacturasMes":50000,"vigenteHasta":"2099-12-31","estado":"activo","modulos":["facturacion","terceros","compras","cartera","contabilidad","nomina","bancos","inventario","medios_magneticos","presupuesto","mcp","dian","restaurante","hotel"]}'
  # → 200 OK
  ```
- **Fix recomendado**:
  1. Introducir rol `superadmin` separado del tenant, con `Usuario.rol = "superadmin"` solo para cuentas operadas por el SaaS provider.
  2. En `PUT /api/empresa/plan`, validar `session.rol === "superadmin"` y opcionalmente `session.empresaId` es el operador (no el tenant).
  3. **No permitir que el tenant escriba su propio `PlanSuscripcion`**. Los cambios de plan deben ir por flujo de billing externo (Stripe, facturación interna).
  4. Forzar validación server-side de límites: aunque el tenant diga "Enterprise", los counts reales en `checkPlanLimits` deben usar límites del plan FREE cuando el campo `plan` no esté confirmado por el billing system.
- **Severidad CVSS estimada**: 9.0 (Crítica) — AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N (impacto financiero y de modelo de negocio)

### H-CRIT-005: 2 RCEs no autenticadas en Next.js 16.1.1 + 1 bypass de homoglifos en next-auth 4.24.11
- **Ubicación**: `package.json:66` (`"next": "^16.1.1"`), `package.json:66` (`"next-auth": "^4.24.11"`), `bun.lock`
- **Descripción**: `bun audit` reporta **99 vulnerabilidades** (3 críticas, 55 altas, 36 moderadas, 5 bajas). Las críticas son:
  - **GHSA-p293-qw3h-jr36**: Next.js: Unauthenticated Remote Code Execution on windows-hosted servers (`next <16.2.5`)
  - **GHSA-2xp9-vwfh-vxw4**: Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used (`next <16.2.5`)
  - **GHSA-7rqj-j65f-68wh**: next-auth/Auth.js: Email normalizer validates the address before Unicode normalization, allowing a homoglyph @ bypass (`next-auth >=4.10.3 <4.24.15`)
  
  Adicionalmente relevantes para el stack del proyecto:
  - **GHSA-c4j6-fc7j-m34r**: Next.js: Server-Side Request Forgery in applications using WebSocket upgrades (high)
  - **GHSA-26hh-7cqf-hhc6 / GHSA-492v-c6pp-mqqv**: Next.js: Middleware/Proxy bypass in App Router via segment-prefetch routes and dynamic route parameter injection (high) — relevante porque el ERP **no tiene middleware**, pero esto afecta a nivel de framework.
  - **GHSA-86w9-cpqp-85rv**: node-forge <=1.4.0: RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements (high) — directamente usado por `src/lib/dian-real.ts` para parsear P12 de clientes.
  - **GHSA-rgj7-g3m4-5g8c**: sharp: Vulnerabilities in libheif (high) — `next` lo usa para optimización de imágenes.
  - **GHSA-r5fr-rjxr-66jc**: lodash: Code Injection via `_.template` imports key names (high) — vía `recharts`.
- **Impacto**:
  - RCE no autenticada en Windows hosts → compromiso completo del servidor. Aunque se despliegue en Linux, los CVEs relacionados con Image Optimization API (AVIF) y SSF también afectan Linux.
  - Bypass de homoglifos en next-auth email → permite crear dos cuentas con correos visualmente idénticos (uno con Cyrillic "а" y otro con Latin "a") para impersonificación o bypass de `findUnique({ where: { email } })` en `registerUser`.
  - node-forge vulnerable al parsear P12 malicioso → si un usuario sube un P12 manipulado (en `PUT /api/dian/config`), podría explotar la firma RSA del P12 y causar comportamiento inesperado en `loadCertificate` (`src/lib/dian-real.ts`).
- **Fix recomendado**:
  1. `bun update next@latest` (≥16.2.5) y `bun update next-auth@latest` (≥4.24.15). Verificar breaking changes en release notes.
  2. `bun update node-forge@latest` (≥1.4.1).
  3. `bun update sharp@latest` (≥0.35.0).
  4. Setear `imminentSecurity: "fail"` en Next config para fallar rápido ante malformaciones.
  5. Configurar `bun audit --severity=high` en CI/CD para bloquear PRs que introduzcan vulnerabilidades nuevas.
- **Severidad CVSS estimada**: 9.8 (Crítica) — RCE no autenticada

### H-CRIT-006: Cookies de sesión con `sameSite: "lax"` + sin CSRF token + sin middleware → CSRF bypass en endpoints state-changing
- **Ubicación**: `src/lib/auth.ts:117-126` (`setSessionCookie`), ausencia total de `src/middleware.ts`, ausencia total de headers CSP/CSRF
- **Descripción**: La cookie `marsella_session` se setea con `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"`, `path: "/"`. **`sameSite: "lax"` permite que la cookie se envíe en navegaciones top-level GET cross-site**. Si un atacante hostea una página con `<form action="https://erp.marsella.com/api/contabilidad" method="POST">`, la cookie **no se envía** en cross-site POST (Lax bloquea POST cross-site). PERO:
  - Cualquier GET top-level cross-site SÍ envía la cookie (incluyendo `GET /api/empresas?op=resoluciones` o `GET /api/dian/envios?q=...` que exponen datos).
  - Si el usuario hizo login y la cookie se setó con `sameSite: "lax"`, un atacante puede embedir un `<img src="https://erp.marsella.com/api/...">` que dispara GETs autenticados.
  - No existe `middleware.ts` que valide origin/referer en POST/PUT/DELETE.
  - No existe token CSRF ni doble submit cookie.
  - Next.js 16 trae protección CSRF en Server Actions vía header `Origin`, pero esto **NO aplica a Route Handlers** (todos los endpoints bajo `/api/`).
- **Impacto**: Un atacante que logre colocar un sitio malicioso visitado por un usuario admin autenticado del ERP puede:
  - Exfiltrar datos vía GET cross-site (con `window.open` + leer respuesta si CORS lo permite, o con timing attacks).
  - En navegadores antiguos (o con `sameSite` deshabilitado por el usuario), ejecutar POST cross-site que cree asientos contables o anule facturas.
- **PoC conceptual**: Sitio atacante con `<img src="https://erp.marsella.com/api/dian/envios">` no exfiltra datos por sí mismo (CORS bloquea lectura cross-origin), pero **timing/size-based leak es posible**. Para POST, la protección es solo por `sameSite: "lax"` — si el navegador del usuario no soporta `sameSite` (viejo) o si el atacante usa `target="_blank"` con `opener`, hay bypass.
- **Fix recomendado**:
  1. Migrar a `sameSite: "strict"` para cookies de sesión en rutas `/api/`.
  2. Implementar **double-submit Cookie CSRF**: generar `csrf_token` aleatorio en login, setear como cookie no-httpOnly + incluir en header `X-CSRF-Token` en cada mutación. Comparar en middleware.
  3. Crear `src/middleware.ts` que valide `Origin` o `Referer` en todos los POST/PUT/DELETE a `/api/*`.
  4. Añadir header `Content-Security-Policy: default-src 'self'; ...` en `next.config.ts`.
- **Severidad CVSS estimada**: 8.1 (Alto-Crítica) — AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N

---

## 🟠 Hallazgos ALTOS (riesgo significativo)

### H-ALT-001: Sesión JWT sin revocación server-side — logout solo borra cookie, el JWT sigue válido 12h
- **Ubicación**: `src/lib/auth.ts:128-131` (`clearSessionCookie`), `src/app/api/auth/logout/route.ts:1-7`
- **Descripción**: La autenticación es 100% stateless (JWT HS256). No existe tabla `SesionRevocada` ni `TokenBlacklist`. El logout solo ejecuta `cookies().delete(SESSION_COOKIE)`. Si un atacante captura el JWT (por XSS, por logging, por cache del SW H-MED-001, por access log de proxy), puede seguir usándolo hasta 12h después del logout del usuario legítimo.
- **Impacto**: Imposibilidad de revocar sesión ante compromiso (ej. dispositivo robado, keys过滤 rotadas). Si un operador detecta actividad maliciosa, no puede matar la sesión afectada sin rotar `APP_SECRET` (lo cual rompe TODAS las sesiones).
- **Fix recomendado**:
  1. Reducir TTL a 1h-2h y usar refresh tokens rotativos.
  2. Añadir tabla `SesionRevocada(jti, expiraAt)` y chequear en `verifyToken`.
  3. Reducir TTL del refresh a 30 días con rotación.
  4. Logout server-side: insertar `jti` del token en `SesionRevocada`.
- **Severidad CVSS estimada**: 7.5 (Alto) — AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N

### H-ALT-002: Rate limiting **inexistente** en `/api/auth/login` y `/api/auth/register` — brute force factible
- **Ubicación**: `src/app/api/auth/login/route.ts:11-39`, `src/app/api/auth/register/route.ts:24-52`
- **Descripción**: No se encuentra en `src/` ni en `node_modules` referenciado en código del proyecto: ninguna librería de rate limiting (`rate-limiter-flexible`, `express-rate-limit`, `next-rate-limiter`, `upstash/ratelimit`). No existe middleware que limite intentos de login. La verificación de password usa `bcryptjs` con 12 rounds (OK, ~250ms por verify), pero sin limitación de intentos, un atacante con GPU puede probar ~4 passwords/segundo por IP y miles por segundo distribuyendo entre IPs.
- **Impacto**: Cualquier cuenta con password débil (`demo1234`, `12345678`, `password`, etc.) es comprometida en minutos. Combinado con H-CRIT-002 (APP_SECRET default conocido), el atacante puede incluso precomputar JWTs sin necesidad de login.
- **PoC**:
  ```bash
  for p in 12345678 password admin123 marsella demo1234; do
    curl -X POST https://erp.marsella.com/api/auth/login \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"demo@marsella.com\",\"password\":\"$p\"}"
  done
  # → Sin 429, sin delay incremental, sin CAPTCHA
  ```
- **Fix recomendado**:
  1. Instalar `upstash/ratelimit` + `@upstash/redis` (o similar con SQLite local para evitar dependencia cloud).
  2. Limitar `/api/auth/login` a 5 intentos / 10 min / IP.
  3. Limitar `/api/auth/register` a 3 registros / hora / IP.
  4. Bloqueo temporal de cuenta tras 10 intentos fallidos (con unlock por email).
  5. Añadir `delay response` uniforme de 200ms en login + 1s exponencial tras fallo (mitiga timing attacks pero no sustituye rate limit).
- **Severidad CVSS estimada**: 7.5 (Alto) — AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N

### H-ALT-003: Política de password débil e inconsistente
- **Ubicación**: `src/app/api/auth/register/route.ts:20` (`z.string().min(8)`), `src/app/api/usuarios/route.ts:55` (`z.string().min(6)`), `src/lib/auth.ts:182` (`hashPassword` bcrypt 12 rounds)
- **Descripción**: Inconsistencia en longitud mínima: registro público exige 8 caracteres, creación de usuario por admin exige solo 6. **Ningún requisito de complejidad** (mayús, símbolos, números). No hay blacklist de passwords comunes. No hay verificación contra HIBP. bcrypt 12 rounds (~250ms en CPU moderno) es razonable pero **no protege contra passwords obvios** como `password`, `marsella`, `12345678`. No existe implementación de recuperación de password pese a existir columnas `resetToken`/`resetTokenExp` en `prisma/schema.prisma`.
- **Impacto**: Ataques de diccionario exitosos en cuentas con passwords comunes. Bloqueo de usuarios sin mecanismo de self-service recovery → soporte técnico saturado o inseguridad (operadores reusing passwords).
- **Fix recomendado**:
  1. Unificar `min(12)` con regex de complejidad.
  2. Añadir `z.string().refine(p => !COMMON_PASSWORDS.has(p.toLowerCase()))`.
  3. Implementar flujo `POST /api/auth/forgot-password` → genera token con `generateToken(32)`, persiste `resetToken` + `resetTokenExp` (1h), envía email.
  4. Implementar `POST /api/auth/reset-password` → valida token, hashea nuevo password, invalida token.
- **Severidad CVSS estimada**: 6.5 (Medio-Alto) — AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N

### H-ALT-004: Ausencia total de headers de seguridad HTTP (CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy)
- **Ubicación**: `next.config.ts:1-12` (vacío de headers), ausencia de `src/middleware.ts`
- **Descripción**: `next.config.ts` solo define `output: "standalone"`, `typescript: { ignoreBuildErrors: true }`, `reactStrictMode: false`. No hay bloque `headers()`. No hay `src/middleware.ts`. Resultado: las respuestas HTTP del ERP no incluyen:
  - `Content-Security-Policy` → habilita XSS (no hay defensa en profundidad).
  - `X-Frame-Options: DENY` → habilita clickjacking via `<iframe src="erp.marsella.com/api/...">`.
  - `Strict-Transport-Security` → en conexiones HTTPS sin HSTS, el primer request puede ser MITM a HTTP.
  - `X-Content-Type-Options: nosniff` → navegadores pueden MIME-sniff PDFs y servirlos como HTML.
  - `Referrer-Policy: no-referrer` para rutas `/api/` → filtración de URL con `?token=` en Referer a terceros.
  - `Permissions-Policy: geolocation=(), camera=(), microphone=()`.
- **Impacto**: Defensa en profundidad inexistente. Cualquier XSS reflejado o stored (no encontrado explícitamente en esta auditoría, pero factible vía `dangerouslySetInnerHTML` en `src/components/ui/chart.tsx:83` si se alimenta con datos de usuario) tiene impacto amplificado por ausencia de CSP.
- **Fix recomendado**:
  ```typescript
  // next.config.ts
  const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none';";
  const nextConfig: NextConfig = {
    // ...
    async headers() {
      return [{
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      }];
    },
  };
  ```
- **Severidad CVSS estimada**: 6.5 (Medio-Alto) —-defense in depth

### H-ALT-005: SSRF + exfiltración de tokens vía `/api/mcp/conexiones` y `call-tool`
- **Ubicación**: `src/app/api/mcp/conexiones/route.ts:70-98` (POST crea conexión a URL externa), `src/app/api/mcp/conexiones/[id]/call-tool/route.ts:10-35` (invoca tool en servidor externo)
- **Descripción**: Cualquier usuario autenticado (sin check de rol, ver H-CRIT-003) puede:
  1. `POST /api/mcp/conexiones` con `{ endpoint: "http://internal-aws-metadata/..." o "http://169.254.169.254/latest/meta-data/", authToken: "x", tipoTransporte: "sse" }` → crea registro.
  2. `POST /api/mcp/conexiones/[id]/call-tool` con `{ tool: "anything", args: {} }` → el servidor ERP abre conexión HTTP/SSE/WebSocket hacia la URL indicada.
  3. El token MCP externo se persiste **cifrado** con AES-256-GCM pero, como vimos en H-CRIT-002, con `APP_ENCRYPTION_KEY=0...0` es trivialmente descifrable.
  4. No hay allowlist de dominios. No hay bloqueo de rutas privadas (`127.0.0.1`, `10.x`, `172.16/12`, `169.254.x`, `::1`).
- **Impacto**: **SSRF clásico**. El atacante puede:
  - Sondear la red interna del servidor ERP desde dentro (sí, el SW del atacante corre en el browser pero el POST al backend ERP es server-side).
  - Acceder a `http://localhost:3000/admin` o servicios internos en `localhost` del servidor.
  - En cloud (AWS/GCP/Azure), acceder al IMDS (`169.254.169.254`) para robar credenciales de IAM.
  - Exfiltrar datos del backend MCP propio del ERP (`/api/mcp`) usando el token MCP.
- **PoC**:
  ```bash
  curl -b c.txt -X POST https://erp.marsella.com/api/mcp/conexiones \
    -H "Content-Type: application/json" \
    -d '{"nombre":"ssrf","tipoTransporte":"sse","endpoint":"http://169.254.169.254/latest/meta-data/iam/security-credentials/","authToken":"x"}'
  curl -b c.txt -X POST https://erp.marsella.com/api/mcp/conexiones/<id>/call-tool \
    -H "Content-Type: application/json" \
    -d '{"tool":"list_resources","args":{}}'
  ```
- **Fix recomendado**:
  1. Restringir `tipoTransporte: "sse"` y validar `endpoint` con `new URL()` → rechazar si hostname resuelve a IP privada (`dns.lookup` + verificación de rango).
  2. Mantener allowlist explícita de dominios permitidos (configurada por admin del SaaS).
  3. Aplicar RBAC: solo `admin` + módulo `mcp` activo puede crear conexiones externas.
  4. Loguear toda invocación en `AuditoriaMultiTenant` con `accion: "mcp_call_tool_external"`.
  5. Considerar proxy saliente con filtrado egress.
- **Severidad CVSS estimada**: 8.6 (Alto) — AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:L

### H-ALT-006: `X-Cron-Secret` comparison con `!==` es vulnerable a timing attack
- **Ubicación**: `src/app/api/dian/cron/route.ts:13-17`
- **Descripción**: El código `if (!expected || secret !== expected) return unauthorized()` usa `!==` que no es constante-tiempo. Un atacante que pueda invocar muchas veces el endpoint puede medir el tiempo de comparación byte-a-byte y reconstruir `CRON_SECRET` (que por defecto es `undefined` — pero si se configura, queda expuesto). Combinado con H-ALT-002 (sin rate limit), el atacante puede automatizar timing attacks.
- **Impacto**: Si `CRON_SECRET` se configura, puede ser extraído tras ~10⁵ requests con precisión de medición de tiempo adecuada.
- **Fix recomendado**: Usar `crypto.timingSafeEqual(Buffer.from(secret ?? ""), Buffer.from(expected ?? ""))` previo chequeo de igual longitud. Idealmente, comparar hashes: `const hash = sha256(secret); if (hash !== expectedHash) return unauthorized()`.
- **Severidad CVSS estimada**: 5.9 (Medio-Alto)

### H-ALT-007: Endpoint `/api/mcp/server-info` expone `MCP_API_TOKEN` a cualquier admin (incluido admin de empresa demo)
- **Ubicación**: `src/app/api/mcp/server-info/route.ts:74`
- **Descripción**: El endpoint devuelve `auth.token: process.env.MCP_API_TOKEN` a cualquier usuario con `rol === "admin"`. Combinado con H-CRIT-001 (demo login → admin) y H-CRIT-003 (RBAC ausente en todos lados pero aquí sí checkea rol admin), esto significa que **cualquiera en Internet** puede:
  1. `curl -X POST https://erp.marsella.com/api/auth/demo` → cookie admin.
  2. `curl -b c.txt https://erp.marsella.com/api/mcp/server-info` → obtiene el `MCP_API_TOKEN` del servidor en claro.
  3. Con el token, puede llamar al servidor MCP del ERP `/api/mcp` con cualquier método (initialize, tools/list, tools/call) — incluyendo tools que retornan balances, facturas, terceros de la empresa demo, pero también de **cualquier empresa** si `MCP_EMPRESA_ID` no está seteado (el código usa `db.empresa.findFirst()` → primera empresa en la BD).
- **Impacto**: Exfiltración del token MCP global. Si el operador usa el mismo `MCP_API_TOKEN` para integraciones cross-tenant (ej. un CRM externo que consume el ERP), el atacante obtiene acceso a esa integración. Adicionalmente, el token es estático (no rota por sesión).
- **Fix recomendado**:
  1. No exponer el token MCP en ningún endpoint. Mostrar solo "Token configurado: Sí/No" y un botón "Regenerar token".
  2. Generar tokens MCP **por empresa** (uno por `empresaId`), con hash bcrypt guardado en BD, nunca en claro.
  3. Rotar el token MCP con cada deploy o cada 30 días.
- **Severidad CVSS estimada**: 7.7 (Alto) — AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N

### H-ALT-008: Service Worker cachea respuestas GET `/api/*` en Cache API del browser — datos sensibles persisten tras logout
- **Ubicación**: `public/sw.js:286-332` (`networkFirstApi`), `public/sw.js:279-293` (fetch handler)
- **Descripción**: El SW intercepta todos los GET a `/api/*` y guarda respuestas exitosas (`r.ok`) en `caches.open("marsella-api-v1")`. Esto incluye:
  - `GET /api/dashboard` (KPIs financieros, facturación del mes, cuentas por cobrar).
  - `GET /api/terceros` (NITs, nombres, saldos de clientes).
  - `GET /api/facturas` (CUFEs, totales, estados DIAN).
  - `GET /api/dian/envios` (trackIds, CUFEs, mensajes de error).
  - `GET /api/contabilidad?op=comprobantes` (asientos contables con descripciones).
  - `GET /api/empresa` (NIT, representante legal, dirección).
  - **NO filtra rutas sensibles**: la lógica `if (url.pathname.startsWith("/api/"))` captura TODO, sin exclusión para `/api/auth/me`, `/api/auth/demo`, `/api/usuarios`, `/api/mcp/conexiones`, `/api/empresa/auditoria`.
  - Tras logout, **la cache persiste** hasta que el usuario hace "Clear Cache" manual o el SW es actualizado (cambio de `SW_VERSION`).
  - En dispositivo compartido (POS, kiosco), el siguiente usuario puede inspeccionar `caches.match("/api/terceros")` desde DevTools o desde una extensión malicioma y leer los datos del usuario anterior.
- **Impacto**: Fuga de datos financieros y de identificación tras logout. En un POS de tienda (el caso de uso declarado en el worklog), un cajero malicioso puede ver datos del cajero anterior.
- **Fix recomendado**:
  1. Excluir rutas sensibles en `sw.js`:
     ```javascript
     if (url.pathname.startsWith("/api/auth/") || 
         url.pathname.startsWith("/api/usuarios") ||
         url.pathname.startsWith("/api/mcp/") ||
         url.pathname.startsWith("/api/empresa/auditoria")) {
       event.respondWith(fetch(req)); // No cache
       return;
     }
     ```
  2. En `clearSessionCookie()` (logout), enviar `postMessage({type:'CLEAR_CACHES'})` al SW y que este borre `marsella-api-v1` y `marsella-html-v1`.
  3. Añadir `Cache-Control: no-store` desde el backend en respuestas sensibles (ya hecho en `reportes/factura/[id]` pero no en endpoints de lista).
- **Severidad CVSS estimada**: 6.5 (Medio-Alto) — AV:L/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N

---

## 🟡 Hallazgos MEDIOS (defensas débiles)

### H-MED-001: Upload de P12 sin validación de MIME type ni tamaño máximo
- **Ubicación**: `src/app/api/dian/config/route.ts:54-111`
- **Descripción**: El endpoint `PUT /api/dian/config` acepta `certificadoP12` (file) sin:
  - Validar MIME type (`application/x-pkcs12`).
  - Validar extensión real del archivo.
  - Validar tamaño máximo (un atacante puede subir un P12 de 1GB → DoS por memoria, ya que `Buffer.from(await file.arrayBuffer())` carga todo en RAM).
  - Validar nombre de archivo (path traversal no aplica porque se guarda como base64 en BD, pero sí riesgo de nombres raros).
  El archivo sí es validado por `loadCertificate` (lanza si password no coincide), pero solo después de cargarlo en memoria.
- **Fix recomendado**: Añadir `if (file.size > 50*1024) return badRequest("P12 debe ser < 50KB")`, validar `file.type === "application/x-pkcs12"` (aunque MIME es fácilmente falseable, añade una capa), validar `file.name.endsWith(".p12") || file.name.endsWith(".pfx")`.
- **Severidad CVSS estimada**: 5.3 (Medio) — DoS por memoria

### H-MED-002: Upload de Excel sin validación de tamaño máximo
- **Ubicación**: `src/app/api/import/parse/route.ts:20-32`
- **Descripción**: Similar a H-MED-001 pero para `.xlsx`. Sin límite de tamaño, un atacante puede subir un Excel de 500MB → el backend lo carga con `Buffer.from(await file.arrayBuffer())` y `parseExcelFile(buffer)` con `exceljs` (que es vulnerable a ReDoS en `minimatch` transitivamente, ver H-BAJ-001). Combinado: DoS garantizado.
- **Fix recomendado**: Limitar a 10MB máximo. Validar magic bytes (`PK\x03\x04` para xlsx ZIP).
- **Severidad CVSS estimada**: 5.3 (Medio) — DoS

### H-MED-003: Schemas Zod permisivos (`z.record(z.string(), z.any())`) sin límite de tamaño en NIIF
- **Ubicación**: `src/app/api/niif/reportes/route.ts:92`, `src/app/api/niif/guardar/route.ts:15`
- **Descripción**: El campo `json_data` acepta cualquier objeto JSON sin límite de profundidad ni tamaño. Se persiste en `ReporteNIIF.json_data` (TEXT en SQLite) con `JSON.stringify(json_data)`. Un atacante puede enviar un JSON de 100MB → SQLite lo guarda (file growth ilimitado) y DoS por disco.
- **Fix recomendado**: Cambiar a schema estricto por `tipo` (usar `z.discriminatedUnion` con schemas específicos para ESF/EER/ECP/EFE). Limitar `body` a < 1MB en middleware global.
- **Severidad CVSS estimada**: 5.3 (Medio) — DoS / disk fill

### H-MED-004: IndexedDB sin cifrar almacena facturas offline con CUFE mock, NITs y totales
- **Ubicación**: `src/lib/indexeddb.ts` (store `pending-invoices` con `payload` completo), `public/sw.js:393-413`
- **Descripción**: Cuando el POS está offline, el SW encola facturas en IndexedDB `marsella-pos-offline.pending-invoices`. El `payload` incluye `items[]` con `productoId`, `cantidad`, `precioUnitario`, `descuentoPorcentaje`, `tarifaIva` + `terceroId` (NIT del cliente) + `total`. IndexedDB **no está cifrado** en el browser. Cualquiera con acceso físico al dispositivo (kiosco POS) puede leer estas facturas desde DevTools → Application → IndexedDB.
- **Impacto**: En un POS compartido en tienda, exfiltración de datos de ventas del día, NITs de clientes (PII financiero).
- **Fix recomendado**: Implementar cifrado con WebCrypto API + clave derivada de PIN del cajero (PBKDF2). O usar `SubtleCrypto` con clave efímera en sessionStorage. Documentar que el POS es single-tenant por dispositivo.
- **Severidad CVSS estimada**: 4.7 (Medio) — AV:P/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N

### H-MED-005: `next.config.ts` tiene `ignoreBuildErrors: true` — type-safety bypass en CI
- **Ubicación**: `next.config.ts:6-8`
- **Descripción**: La opción `typescript.ignoreBuildErrors: true` significa que el build de producción NO falla ante errores de tipos TypeScript. Esto permite que bugs de tipos (incluyendo assignments inseguros como `rol: usuario.rol as RoleKey` en `auth.ts:236` sin validar contra enum) lleguen a producción. Combinado con `reactStrictMode: false`, el código pierde doble red de seguridad.
- **Fix recomendado**: Remover `typescript.ignoreBuildErrors` o setear `false`. Arreglar errores de tipo pendientes (worklog menciona 2 errores preexistentes en `src/lib/niif.ts`).
- **Severidad CVSS estimada**: 4.3 (Medio)

### H-MED-006: `hasPermission` con wildcard `*` no respeta módulos del plan
- **Ubicación**: `src/lib/auth.ts:141-153` (`hasPermission`), `src/lib/tenant.ts:380-400` (`requireModule`)
- **Descripción**: El RBAC `hasPermission(rol, "contabilidad:*")` valida contra los `permissions` del rol, pero **no contra `PlanSuscripcion.modulos`**. Esto significa que un `contador` en plan FREE (que solo permite `facturacion, terceros`) sigue pudiendo acceder a `/api/contabilidad` si el endpoint solo validara `hasPermission`. Afortunadamente, casi ningún endpoint usa `hasPermission` (H-CRIT-003), pero si se aplicara correctamente, `requireModule` debería combinarse con `hasPermission` en cada handler. Hoy, `requireModule` se invoca en **0 endpoints** — los módulos pagos no se validan en runtime.
- **Fix recomendado**: Combinar `hasPermission` + `requireModule` en wrapper `requireAccess(session, module, action)`. Aplicar en todos los endpoints de módulos pagos.
- **Severidad CVSS estimada**: 4.3 (Medio) — bypass de límites de plan

### H-MED-007: Auditoría (`AuditoriaMultiTenant`) solo registra 3 acciones — login, cambios contables y operaciones críticas no se loguean
- **Ubicación**: `src/lib/tenant.ts:266-292` (`auditAction`), invocada en `src/app/api/empresa/plan/route.ts:110`, `src/app/api/medios-magneticos/generar/route.ts`, `src/app/api/medios-magneticos/[id]/route.ts`
- **Descripción**: De 150 endpoints, solo 3 llaman `auditAction`. Las siguientes acciones **no se auditan**:
  - Login (`POST /api/auth/login`) y logout.
  - Register de empresa nueva.
  - Login demo (H-CRIT-001).
  - Subida de P12 DIAN (`PUT /api/dian/config`).
  - Creación/anulación de facturas (`POST /api/facturas`, `PUT /api/facturas/[id]` accion=anular).
  - Creación de asientos contables manuales (`POST /api/contabilidad`).
  - Creación/eliminación de conexiones MCP externas.
  - Exportación de PDFs (reportes).
  - Cualquier invocación a MCP externo.
- **Impacto**: Imposibilidad de hacer forensic analysis tras incidente. En un contexto colombiano donde la DIAN y la revisoría fiscal exigen trazabilidad, esto es observación crítica.
- **Fix recomendado**: Mapear todas las acciones sensibles a `auditAction` con `accion` normalizada (lista cerrada: `login_ok, login_fail, logout, factura_create, factura_anular, asiento_create, dian_config_update, mcp_external_call, reporte_export, plan_change, empresa_update, usuario_create, usuario_disable`).
- **Severidad CVSS estimada**: 4.0 (Medio) — observabilidad forense

---

## 🟢 Hallazgos BAJOS (mejoras de hardening)

### H-BAJ-001: Dependencias transitivas con ReDoS (minimatch, brace-expansion, postcss, nanoid, picomatch, js-yaml)
- **Ubicación**: `bun.lock`
- **Descripción**: Múltiples ReDoS en dev-time deps (`eslint`, `eslint-config-next`, `exceljs` → `archiver` → `minimatch`). Estas no afectan runtime de producción si el build las tree-shakes correctamente, PERO `exceljs` se usa en runtime (`src/lib/import-excel.ts`, `src/lib/medios-magneticos.ts`) y trae `archiver` + `minimatch`. Si un atacante envía un nombre de sheet malicioso que feed a `minimatch`, podría causar ReDoS.
- **Fix recomendado**: `bun update --latest` para minimatch ≥3.1.3, brace-expansion ≥1.1.17, nanoid ≥3.3.16, picomatch ≥2.3.2, js-yaml ≥4.1.2. Re-auditar tras update.
- **Severidad CVSS estimada**: 3.1 (Bajo)

### H-BAJ-002: `console.log` en `src/app/api/mcp/server-info/route.ts` (líneas 57, 60) — en snippets de ejemplo
- **Ubicación**: `src/app/api/mcp/server-info/route.ts:57, 60`
- **Descripción**: Los snippets de código Python/JS que se sirven al cliente en `examples.python` y `examples.javascript` contienen `console.log("Tools:", ...)` — son strings dentro del response JSON, no logs del servidor. No es vulnerable pero es ruido en logs si un cliente los copia literalmente.
- **Fix recomendado**: Reemplazar `console.log` por `print` (Python) y `console.log` puede mantenerse en JS pero documentar que es ejemplo.
- **Severidad CVSS estimada**: 0.0 (Informational)

### H-BAJ-003: `ignoreBuildErrors: true` + `reactStrictMode: false` en `next.config.ts`
- **Ubicación**: `next.config.ts:6-9`
- **Descripción**: Desactiva verificación de tipos en build (omite TS errors) y React StrictMode (que detecta side-effects en useEffect). Ya mencionado en H-MED-005 pero se cuenta como bajo por separado.
- **Fix recomendado**: Setear ambos a `false` (StrictMode) y remover `ignoreBuildErrors`.
- **Severidad CVSS estimada**: 2.0 (Bajo)

### H-BAJ-004: `node-forge 1.4.0` con CVE en verificación RSA PKCS#1 v1.5
- **Ubicación**: `package.json:69` (`"node-forge": "^1.4.0"`), `src/lib/dian-real.ts` (uso intensivo para parsear P12)
- **Descripción**: GHSA-86w9-cpqp-85rv afecta `node-forge <=1.4.0`. El ERP usa `forge.pkcs12.pkcs12FromAsn1` para parsear P12 de clientes. Si el operador sube un P12 manipulado con RSA PKCS#1 v1.5 + nested DigestAlgorithm, `loadCertificate` podría aceptar firmas inválidas. En la práctica, el P12 es auto-producido por el cliente, así que el vector requiere que el propio cliente se ataque a sí mismo (no es escalable).
- **Fix recomendado**: `bun update node-forge@latest` (≥1.4.1 cuando se publique el fix).
- **Severidad CVSS estimada**: 2.7 (Bajo)

### H-BAJ-005: `bcryptjs` (puro JS) en lugar de `bcrypt` (nativo) — 3-5× más lento por hash
- **Ubicación**: `package.json:54` (`"bcryptjs": "^3.0.3"`), `src/lib/crypto.ts:24-37`
- **Descripción**: `bcryptjs` es una implementación JS pura. Para 12 rounds, toma ~250ms por hash en Node moderno. Esto es OK para login normal, pero en registro masivo o en ataques de fuerza bruta del propio servidor (legítimo), consume más CPU que `bcrypt` nativo. No es una vulnerabilidad, es un cuello de botella de performance que limita cuántos logins por segundo puede procesar el servidor (legítimo o atacante).
- **Fix recomendado**: Migrar a `bcrypt` (nativo) o a `argon2id` (recomendado por OWASP 2024).
- **Severidad CVSS estimada**: 1.0 (Informational)

---

## ✅ Hallazgos POSITIVOS (lo que está bien hecho)

A pesar de los hallazgos graves anteriores, el ERP tiene **aciertos técnicos importantes** que merecen reconocimiento:

1. **Uso correcto de Prisma con parameter binding**: Ningún uso de `$queryRaw` o `$executeRawUnsafe` en `src/` (verificado con `grep`). Todos los `contains` para búsquedas `q` usan el API seguro de Prisma. **No se encontró SQL injection**.
2. **Cifrado AES-256-GCM bien implementado estructuralmente**: `src/lib/crypto.ts:40-50` usa IV aleatorio de 12 bytes, auth tag validada en `decrypt`, formato `iv(12)+tag(16)+ciphertext` correcto. Si la clave fuera segura (H-CRIT-002), sería criptográficamente sólido.
3. **Filtrado por `empresaId` en 100% de los endpoints con `getSession()`**: Todos los `findFirst({ where: { id, empresaId: session.empresaId } })` están bien aplicados en endpoints por-ID (facturas/[id], dian/envios/[id], conciliacion/[id], mcp/conexiones/[id]/...). **No se encontró IDOR cross-tenant explotable por ID adivinable**.
4. **No se exponen secretos en responses JSON**: `/api/dian/config` GET devuelve `tieneCertificado: Boolean(r.certificadoP12Enc)` en lugar del P12. `/api/mcp/conexiones` GET hace `const { authTokenEnc, ...safe } = c` para no devolver el token. `/api/dian/envios` lista `light` sin `xmlFirmado` para reducir leak.
5. **Zod schemas en la mayoría de POST/PUT**: ~95% de los POST/PUT endpoints usan `schema.safeParse(body)` con mensajes de error estructurados. Solo algunos POST usan `const body = await req.json()` sin schema (Radian eventos POST en `src/app/api/radian/eventos/route.ts:96-98`) pero validan campos manualmente.
6. **Cookies httpOnly + secure en producción**: `src/lib/auth.ts:117-126` setea `httpOnly: true, secure: process.env.NODE_ENV === "production"` correctamente. El flag `secure` solo en prod eviona breakage en dev HTTP.
7. **No se encontraron `eval()`, `new Function()`, ni `dangerouslySetInnerHTML` con datos de usuario**: Solo `src/components/ui/chart.tsx:83` usa `dangerouslySetInnerHTML` pero con `THEMES` hardcoded del dev (no user-controlled).
8. **El SW usa `crypto.randomUUID()` para `localId` de facturas offline**: No usa `Math.random()` para IDs criptográficos (excepto fallback, `sw.js:394-396`).
9. **`.env*` está en `.gitignore`**: Verificado en `.gitignore:30-31`. Secretos reales (si existieran) no se commitearían por accidente.
10. **Estructura multi-tenant declarada explícitamente con `onDelete: Cascade` en `Empresa`**: Si se borra una empresa, todos sus datos se eliminan (GDPR-friendly right-to-erasure).
11. **`requireTenantAccess` en `src/lib/tenant.ts:168-260`** está correctamente diseñada para chequear cross-tenant — el problema es que se invoca en 0 endpoints (los endpoints hacen el `findFirst({ where: { id, empresaId } })` inline que es equivalente en efecto pero menos reutilizable).

---

## 📋 Plan de acción priorizado

| Prioridad | Hallazgo | Esfuerzo (eng-días) | Impacto |
|---|---|---|---|
| 1 | H-CRIT-002: Defaults inseguros de secretos | 0.5 | Crítico |
| 2 | H-CRIT-001: Endpoint demo expuesto | 0.25 | Crítico |
| 3 | H-CRIT-005: Update Next.js + next-auth + node-forge + sharp | 1 | Crítico |
| 4 | H-CRIT-003: Aplicar RBAC en 145 endpoints | 5-10 | Crítico |
| 5 | H-CRIT-004: Superadmin role + plan write desde billing externo | 2 | Crítico |
| 6 | H-CRIT-006: CSRF middleware + sameSite=strict + CSP | 1.5 | Crítico |
| 7 | H-ALT-002: Rate limiting en auth + endpoints sensibles | 1 | Alto |
| 8 | H-ALT-001: Revocación de JWT server-side | 2 | Alto |
| 9 | H-ALT-005: SSRF blocklist en `/api/mcp/conexiones` | 0.5 | Alto |
| 10 | H-ALT-007: No exponer MCP_API_TOKEN | 0.25 | Alto |
| 11 | H-ALT-008: Excluir rutas sensibles del SW cache | 0.5 | Alto |
| 12 | H-ALT-004: Headers de seguridad HTTP | 0.25 | Alto |
| 13 | H-ALT-003: Política password robusta + reset flow | 1 | Alto |
| 14 | H-ALT-006: `timingSafeEqual` en cron secret | 0.1 | Alto |
| 15 | H-MED-001, H-MED-002, H-MED-003: Límites de tamaño en uploads y bodies | 0.5 | Medio |
| 16 | H-MED-004: Cifrar IndexedDB | 2 | Medio |
| 17 | H-MED-005: Remover `ignoreBuildErrors` | 0.5 | Medio |
| 18 | H-MED-006: Combinar `hasPermission` + `requireModule` | 1 | Medio |
| 19 | H-MED-007: Auditoría forense de acciones sensibles | 2 | Medio |
| 20 | H-BAJ-001: Update dependencias con ReDoS | 0.5 | Bajo |
| 21 | H-BAJ-004: Update node-forge | 0.1 | Bajo |
| 22 | H-BAJ-005: Migrar a argon2id | 1 | Bajo |

**Esfuerzo total estimado**: 20-25 días-ingeniero para cierre completo de CRÍTICOS y ALTOS. Los MEDIOS y BAJOS pueden paralelizarse con el roadmap de producto.

**Secuencia recomendada (sprint 1, semana 1)**:
1. H-CRIT-002 (0.5d): Setear secrets reales, documentar rotación, eliminar defaults.
2. H-CRIT-001 (0.25d): Eliminar `/api/auth/demo` de producción.
3. H-ALT-002 (1d): Instalar rate limiter en login/register/dashboard.
4. H-CRIT-005 (1d): `bun update next@latest next-auth@latest`.
5. H-ALT-004 (0.25d): Añadir headers CSP/HSTS en `next.config.ts`.
6. H-CRIT-006 (1.5d): Middleware CSRF + sameSite=strict.

Sprint 2 (semana 2): RBAC granular en 50% endpoints (H-CRIT-003) + superadmin (H-CRIT-004).

Sprint 3 (semana 3-4): RBAC en el 50% restante + auditoría + revocación JWT + SSRF blocklist.

---

## 🎯 Conclusiones del auditor

El ERP Marsella es **técnicamente impresionante en amplitud funcional** (~150 endpoints, 16 módulos verticales, facturación DIAN real con XAdES-EPES, PWA offline-first, MCP server propio) pero presenta **fallas graves de seguridad que lo hacen inelegible para producción en su estado actual**.

**Tres problemas de fondo**:

1. **"Security as afterthought"**: El código demuestra que el equipo conoce las mejores prácticas — existen `ROLES`, `hasPermission`, `requireTenantAccess`, `auditAction`, `requireModule`, `encrypt`/`decrypt` AES-256-GCM, `httpOnly`/`secure`/`sameSite` cookies, schemas Zod, parameter binding Prisma — pero **estas primitivas no se aplican de forma sistemática**. La覆盖率 de `hasPermission` es 3/150 endpoints. La cobertura de `auditAction` es 3/150. La cobertura de `requireModule` es 0/150. La cobertura de `requireTenantAccess` es 0/150 (se prefiere inline `findFirst({ where: { id, empresaId } })` que es efectivo pero no auditable centralmente).

2. **Inseguridad por defecto**: Los defaults de `APP_SECRET` y `APP_ENCRYPTION_KEY` son criptográficamente nulos. La única `.env` presente tiene solo `DATABASE_URL`. La aplicación arranca felizmente con todos los secretos inseguros en producción. Falta una filosofía de **"fail-closed"**: la app debería negegarse a arrancar si `APP_SECRET` o `APP_ENCRYPTION_KEY` no están configurados en `NODE_ENV=production`.

3. **Superficie de ataque desbordada**: Endpoints que no deberían existir en producción (`/api/auth/demo`), endpoints que exponen secretos al primer admin que pase (`/api/mcp/server-info`), endpoints que permiten egress de red arbitraria desde el servidor (`/api/mcp/conexiones/[id]/call-tool`) — todo esto amplifica el impacto de cualquier otro hallazgo.

**Lo más crítico a corto plazo**: La combinación H-CRIT-001 (demo endpoint) + H-CRIT-002 (APP_SECRET default conocido) + H-ALT-007 (server-info expone MCP_API_TOKEN) es una cadena de explotación trivial: cualquier persona en Internet puede obtener una sesión admin en la empresa demo, recuperar el MCP_API_TOKEN, y usarlo para invocar el servidor MCP del ERP sin restricciones. Si el operador dejó `MCP_EMPRESA_ID` vacío (default), el atacante accede a los datos de la primera empresa en la BD — que puede ser un cliente real.

**Recomendación final**: **NO DESPLEGAR A PRODUCCIÓN PÚBLICA** sin cerrar primero H-CRIT-001, H-CRIT-002 y H-CRIT-005 (3 días de ingeniería). Para despliegues internos o pilotos cerrados (VPN/allowlist IP), el plan completo CRÍTICOS+ALTOS (~20 días) es prerrequisito. Antes de aceptar datos financieros reales de clientes (especialmente certificados DIAN con responsabilidad tributaria), se debe ejecutar una re-auditoría tras remediar, idealmente con pentesting externo.

El ERP Marsella tiene el potencial de ser un producto sólido, pero la seguridad debe ascender de "primitivas existentes pero no aplicadas" a "políticas obligatorias en CI/CD". La introducción de un **lint rule custom** que falle el build si un `route.ts` no invoca `getSession()` o `requireAuth()` sería un buen primer paso defensivo automatizado.
