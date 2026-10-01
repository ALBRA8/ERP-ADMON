# Agent Work Record — ERP-Terceros-UI

**Task ID:** ERP-Terceros-UI
**Agent:** full-stack-developer
**Status:** Completado

## Resumen

Vista de Terceros (clientes/proveedores/empleados/socios unificados) del ERP Marsella, con CRUD completo, búsqueda con debounce, filtro por tipo, y formulario modal en Dialog.

## Archivos creados

1. **`/home/z/my-project/src/components/terceros/terceros-view.tsx`** — Client component `"use client"` (~700 líneas). Exporta `TercerosView`. Incluye:
   - Listado en `Table` shadcn con columnas: Documento, Nombre, Tipo, Teléfono, Email, Ciudad, Saldo cartera (COP), Estado, Acciones.
   - Búsqueda con debounce 400 ms (`GET /api/terceros?q=...`).
   - Filtro toggle (todos | cliente | proveedor | empleado | socio) con iconos.
   - Dialog crear/editar con 3 fieldsets: Identificación, Contacto, Fiscal/Crédito. Campos requeridos por la task.
   - AlertDialog para soft-delete.
   - Estado de carga (`Skeleton`) y estado vacío contextual.
   - Toasts con `sonner`.
   - Paleta emerald/teal (sin azul/índigo). Dark mode con clases `dark:`. Layout responsive mobile-first.

2. **`/home/z/my-project/src/app/api/ciudades/route.ts`** — Handler `GET` protegido por sesión JWT, consulta `db.ciudad` por `empresaId`, retorna `[{ id, codigoDane, nombre, departamento }]`.

## Decisiones técnicas

- **Sin react-query**: uso de `useEffect`+`fetch`+`useState` como pide la task.
- **Debounce con `setTimeout` + `useRef`** (400 ms) para no saturar el backend.
- **Currency formatter**: `new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 })` — sin decimales porque COP suele ser entero grande.
- **Toggle de tipo**: botones custom en vez de `ToggleGroup` para control fino del color emerald y mejor responsive (wrap en mobile).
- **`Select` de ciudad con opción "— Sin ciudad —"** usando valor centinela `__none__` que el handler convierte a `""` antes de mandar al backend.
- **Form state** con `string` para todos los inputs (inclusive números) — conversión `Number()` al serializar payload. Evita bugs de input controlled con `NaN`.
- **PUT**: manda `{ id, ...payload }` (el handler PUT del backend espera `id` y `data`).
- **DELETE**: soft-delete (backend marca `activo: false`), copia del AlertDialog lo aclara al usuario.

## Validación

- `bun run lint`: mis archivos limpios (0 errores). Errores restantes son de archivos fuera de mi scope (`page.tsx`, `theme-toggle`, scripts `repo-crm-albra`).
- Dev log: `TercerosView` se resuelve correctamente desde `page.tsx`. El build actual falla por módulos de otros agentes (`ProductosView`, `FacturacionView`, `ComprasView`, `CarteraView`, `ContabilidadView`, `ParametrosView`) que aún no existen — no es mi responsabilidad.

## Notas para el agente principal / siguientes agentes

- El modelo `Tercero` permite `tipo = "todos"` en su enum pero el formulario de creación solo ofrece `cliente | proveedor | empleado | socio` (coherente con el dominio).
- El handler `POST` valida con Zod y requiere `regimenTributario` y `responsabilidad` con defaults; el frontend envía solo `regimenTributario` y deja `responsabilidad` al default del backend.
- Para que la vista funcione end-to-end, debe existir al menos una fila en `Ciudad` para el `empresaId` de la sesión. Si no hay ciudades, el Select muestra "Cargando ciudades..." y luego "Sin ciudad" como única opción — no bloquea la creación del tercero.
