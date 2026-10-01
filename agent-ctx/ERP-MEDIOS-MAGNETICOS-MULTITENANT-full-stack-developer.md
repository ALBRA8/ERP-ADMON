# ERP-MEDIOS-MAGNETICOS-MULTITENANT — Work Record

**Task ID**: ERP-MEDIOS-MAGNETICOS-MULTITENANT
**Agent**: full-stack-developer
**Date**: 2026-10-01

## Summary
Implementé los Medios Magnéticos DIAN (formatos 1007, 2276, 2277, 1647, 2238) con generadores que consultan RecibosCaja, ComprobantesEgreso, FacturasVenta y FacturasCompra del año, y producen archivos .txt (DIAN) y .xlsx (exceljs). También añadí el modelo `PlanSuscripcion` + `AuditoriaMultiTenant` a `prisma/schema.prisma` (solo append al final, sin tocar nada existente) y el middleware `src/lib/tenant.ts` con `requireTenantAccess`, `auditAction`, `checkPlanLimits`, `requireModule`, `getResumenPlanUso`. Construí 7 rutas API para medios magnéticos + 3 rutas para multi-empresa (plan, auditoría). Creé los componentes `medios-view.tsx` y `admin-view.tsx` con tabs y Sheet de detalle, y los agregué al sidebar y al router de `page.tsx`.

## Archivos creados
- `src/lib/medios-magneticos.ts` — 5 generadores + `generarArchivoTXT` + `generarArchivoXLSX` (exceljs dinámico).
- `src/lib/tenant.ts` — `requireTenantAccess`, `auditAction`, `checkPlanLimits`, `requireModule`, `getResumenPlanUso`, `PLANES_DISPONIBLES`, `MODULOS_SISTEMA`.
- `src/app/api/medios-magneticos/route.ts` — GET lista.
- `src/app/api/medios-magneticos/generar/route.ts` — POST genera medio + detalles + auditoría.
- `src/app/api/medios-magneticos/[id]/route.ts` — GET detalle paginado + DELETE.
- `src/app/api/medios-magneticos/[id]/txt/route.ts` — GET .txt.
- `src/app/api/medios-magneticos/[id]/xlsx/route.ts` — GET .xlsx.
- `src/app/api/empresa/plan/route.ts` — GET plan+uso, PUT plan.
- `src/app/api/empresa/auditoria/route.ts` — GET auditoría con filtros.
- `src/components/medios-magneticos/medios-view.tsx` — tabs Generar / Listado + Sheet detalle.
- `src/components/admin/admin-view.tsx` — tabs Plan y límites / Auditoría + Sheet detalle.

## Archivos modificados
- `prisma/schema.prisma` — append `PlanSuscripcion` + `AuditoriaMultiTenant` + relaciones en `model Empresa`.
- `src/components/layout/sidebar.tsx` — imports `FileSpreadsheet`, `Shield`; NavKey + items `medios` y `admin`.
- `src/app/page.tsx` — imports `MediosView`, `AdminView`; tipo `View` + casos de render `medios` y `admin`.

## Verificación
- `bunx prisma format` + `bun run db:push --accept-data-loss` — Prisma Client regenerado.
- `npx eslint <mis archivos>` — EXIT=0 (sin errores).
- `bun run lint` global — 0 errores nuevos (19 preexistentes en `cafetero-view.tsx`, fuera de scope).
- `curl` end-to-end en sesión demo:
  - `GET /api/empresa/plan` → 200, plan free + uso real (1 usuario, 10 terceros, 10 productos, 2 facturas/mes).
  - `POST /api/medios-magneticos/generar` con `{2277, 2026}` → 200, medio con 2 registros, totalRetenido=3040.
  - `POST .../generar` con `{1647, 2026}` → 200, 1 registro (factura venta con cliente).
  - `POST .../generar` con `{2238, 2026}` → 200, 2 registros (egreso + compra por tercero).
  - `GET /api/medios-magneticos/[id]/txt` → 200, `H|900.123.456-7|2026|2238|Marsella S.A.S.|2026-10-01` + D|... + `T|2|5336000.00|0.00`.
  - `GET /api/medios-magneticos/[id]/xlsx` → 200, Excel 2007+ 7555 bytes.
  - `GET /api/medios-magneticos/[id]` → 200, medio + `medioMagneticoDetalles[]`.
  - `DELETE /api/medios-magneticos/[id]` → 200 `{ok:true, id:...}`.
  - `GET /api/empresa/auditoria` → 200, 3 logs con `detalles` JSON.
  - `PUT /api/empresa/plan` con `{plan:"pro", modulos:[...]}` → 200, plan actualizado.

## Decisiones técnicas
- `exceljs` importado dinámicamente (`await import("exceljs")`) en el route handler del backend, no en el cliente.
- `auditAction` es best-effort: no rompe el flujo principal si la inserción de log falla.
- TXT con separador `|` y CRLF (DIAN estándar). Línea header `H|`, detalle `D|`, totales `T|`.
- `requireTenantAccess` soporta entidades: factura, facturaCompra, reciboCaja, comprobanteEgreso, tercero, producto, medioMagnetico, empresa.
- `checkPlanLimits` cuenta registros reales con `db.{modelo}.count({where:{empresaId}})`.
- `getPlanEmpresa` crea el plan `free` on-demand si no existe (lazy initialization).
- Modos 1007 y 2276 devuelven 400 con mensaje explicativo si no hay documentos con retenciones (en lugar de crear medio vacío).
- NO se tocó `cafetero-view.tsx` (errores `react-hooks/static-components` preexistentes, fuera de scope).
EOF