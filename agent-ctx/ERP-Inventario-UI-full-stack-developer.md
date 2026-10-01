# Agent Work Record — ERP-Inventario-UI

**Task ID:** ERP-Inventario-UI
**Agent:** full-stack-developer
**Status:** Completado

## Resumen

Vista de **Inventarios Multibodega** del ERP Marsella, con tres pestañas (Bodegas, Saldos por bodega, Kardex), gestión de bodegas, ajustes de inventario y kardex valorizado con saldo acumulado. Acento emerald/teal, dark mode y responsive.

## Archivos creados

1. **`/home/z/my-project/src/components/inventario/inventario-view.tsx`** — Client component `"use client"` (~750 líneas). Exporta `InventarioView` (named + default). Incluye:
   - **Header** con icono `Boxes`, título, descripción y botones contextuales (Refrescar + acción primaria según pestaña activa).
   - **Tabs**: `Bodegas`, `Saldos por bodega`, `Kardex`.
   - **Tab Bodegas**: grid responsive `1/2/3` de cards con borde lateral emerald. Cada card muestra icono, nombre, código, dirección y 3 stat tiles (Productos / Unidades / Valor COP). Estado vacío con CTA.
   - **Tab Saldos**: toolbar con búsqueda libre + badges resumen (total unidades / valor COP). `Table` con scroll vertical (`max-h-[60vh]`) y header sticky. Columnas: Producto, Bodega, Cantidad, Costo promedio, Costo total, Stock mínimo. Resalta con amber los saldos bajo mínimo.
   - **Tab Kardex**: card de filtros con `Select` de producto, `Select` de bodega (opcional con opción "Todas"), inputs `date` desde/hasta, botón Consultar. `Table` con scroll + header sticky. Columnas: Fecha, Tipo (badge de color), Cantidad (+/-), Costo unitario, Costo total, Saldo acumulado (cantidad + valor), Documento.
   - **Dialog Nueva bodega**: código (con icono Hash), nombre, dirección (con icono MapPin). Valida campos obligatorios y notifica con toast.
   - **Dialog Ajuste de inventario**: Select de producto, Select de bodega, selector visual de tipo (Entrada/Salida/Ajuste con iconos y color emerald/rose/amber), cantidad, costo unitario (autocompleta con costo promedio del saldo existente), motivo. Llama a `POST /api/inventario` (que registra movimiento + recalcula saldo/costo promedio).
   - **Carga inicial** de productos (`GET /api/productos?pageSize=500`) y bodegas (`GET /api/bodegas`) al montar. Saldos se cargan lazy al abrir el tab. Kardex se carga solo al presionar Consultar.
   - **Refresh** re-ejecuta la carga activa según pestaña.
   - Toasts con `sonner` para éxito/error en cada acción.
   - **Tipos de movimiento** colorizados: entrada → emerald, salida → rose, ajuste → amber, traslado → slate (en lugar de azul).

2. **`/home/z/my-project/src/app/api/bodegas/route.ts`** — Handlers `GET` + `POST` protegidos por `getSession()`, filtrando por `empresaId`:
   - **GET**: lista bodegas con `saldosInventario` incluidos; enriquece cada bodega con `productosCount` (saldos con cantidad > 0), `cantidadTotal` y `valorTotal`. Soporta query `q` para búsqueda libre.
   - **POST**: valida con Zod (`codigo` min 1, `nombre` min 2, `direccion` opcional); crea bodega con `empresaId` de sesión. Maneja `P2002` (código duplicado) con mensaje útil.

## Decisiones técnicas

- **Imports restringidos**: solo `@/components/ui/*`, `sonner`, `lucide-react`, más hooks de `react` (`useCallback`, `useEffect`, `useMemo`, `useState`). No se usó `cn` de `@/lib/utils` para cumplir la regla "solo imports de @/components/ui/*, sonner, lucide-react" — los `className` se construyen con strings literales.
- **Helpers de formato** definidos dentro del propio archivo (`copFormatter`, `numFormatter`, `fmtCOP`, `fmtNum`, `fmtFecha`) — no se importó de `@/lib/currency`.
- **Fetch helpers** internos `apiGet<T>` y `apiPost<T>` con manejo de errores que extrae `{ error }` del JSON de respuesta del backend.
- **Color centinela para "todas"**: en selects de Kardex se usa el valor `"__all__"` y se convierte a vacío antes de enviar al backend (similar a la convención `__none__` usada por el agente de Terceros).
- **Auto-completar costo unitario**: al elegir producto en el diálogo de ajuste, si existe un saldo previo con `costoPromedio > 0`, se sugiere automáticamente (sin sobrescribir si el usuario ya escribió).
- **Tabs radix**: `TabsTrigger` con icono + label para affordance visual claro en mobile.
- **Skeletons** para estados de carga (cards de bodegas, filas de tabla de saldos/kardex).
- **Saldos bajo mínimo**: se marcan con `⚠` y color amber en la celda Cantidad cuando `cantidad <= stockMinimo` y `stockMinimo > 0`.
- **Saldo acumulado en Kardex**: el backend (`getKardex` en `@/lib/inventario.ts`) ya computa `saldoCantidad` y `saldoValor` por fila en orden cronológico ascendente; el frontend solo los muestra.

## Validación

- `bun run lint`: **mis archivos sin errores ni warnings** (0 problemas en `inventario-view.tsx` y `bodegas/route.ts`). Los 9 errores y 1 warning restantes son todos de archivos fuera de mi scope (`repo-crm-albra/*`, `page.tsx`, `theme-toggle`, `lib/crypto.ts`, `lib/db.ts`).
- Dev log: `InventarioView` se resuelve correctamente desde `page.tsx`. El build actual sigue fallando por módulos de otros agentes (`ProductosView`, `FacturacionView`, `ComprasView`, `CarteraView`, `ContabilidadView`, `ParametrosView`) que aún no existen — **no es responsabilidad de esta task**.

## Notas para el agente principal / siguientes agentes

- La vista depende de `GET /api/productos` y `GET /api/bodegas`. Si el endpoint de productos no retorna `items` con `inventariable !== false`, se mostrará "Sin productos" en los diálogos de ajuste.
- `POST /api/inventario` requiere `productoId`, `bodegaId`, `tipo` (entrada|salida|ajuste), `cantidad`, `costoUnitario`, `motivo` (opcional). El campo `motivo` no se persiste en el modelo actual (solo llega al handler, que ignora extras no definidos en el schema Zod) — sería una mejora futura agregar columna `motivo` a `MovimientoInventario`.
- El Kardex requiere `productoId` obligatorio en el backend; el frontend ofrece "Todos los productos" como UI pero al consultar envía solo si está seleccionado. Si no se selecciona, el backend responde 400 — para que "Todos" funcione end-to-end habría que extender el handler `GET /api/inventario?op=kardex` para aceptar `empresaId`-only. Queda como TODO.
- El handler `GET /api/bodegas` reemplaza funcionalmente a `GET /api/inventario?op=bodegas` (este último sigue funcionando y es el usado por otros potenciales consumidores; no se tocó para no romper contratos existentes).
