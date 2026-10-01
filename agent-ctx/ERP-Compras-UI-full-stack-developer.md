# Task ERP-Compras-UI — full-stack-developer

## Resumen
Componente `ComprasView` (client component, `src/components/compras/compras-view.tsx`) para la vista de Compras y Proveedores del ERP Marsella.

## Archivos creados / modificados
- **CREADO**: `src/components/compras/compras-view.tsx` (~870 líneas) — único `export function ComprasView`.
- **EDITADO**: `worklog.md` — agregada sección `Task ID: ERP-Compras-UI` con Work Log y Stage Summary.
- No se tocaron Prisma ni endpoints. No se modificó `page.tsx` (ya tenía el import).

## Estructura del componente
- **Combobox reutilizable inline** (Popover + Command con `shouldFilter={false}` y filtrado manual). Items `{id,label,sub}`. Trigger ancho completo con `ChevronsUpDown`. Popover con `--radix-popover-trigger-width`.
- **Tab "Compras registradas"**:
  - Búsqueda por `q` con debounce 350ms → `GET /api/compras?q=...&pageSize=100`.
  - Columnas: número (mono emerald + factura proveedor subscript), fecha, proveedor (nombre + NIT en 2 líneas), # items badge, subtotal, IVA descontable (teal), total, saldo pendiente (amber si >0, emerald si pagada), estado cartera + estado factura badges.
  - Tabla con `max-h-[70vh] overflow-y-auto`, header sticky.
- **Tab "Nueva compra"**: layout `lg:grid-cols-3` (form a la izquierda 2/3, resumen sticky a la derecha 1/3).
  - Proveedor: Combobox + botón "Crear proveedor" → Dialog con nombre/NIT/dígito → `POST /api/terceros` con `tipo:'proveedor'`. Al éxito añade a estado local y selecciona.
  - N° factura proveedor opcional.
  - Bodega destino: Select shadcn con bodegas activas.
  - Fecha vencimiento: input date, default hoy+30 (`addDaysISO(30)`).
  - Tabla items: Combobox producto por fila (autocompleta descripción/unidad/precio/tarifaIva desde el catálogo), descripción editable independiente, cantidad, unidad, precio unitario, descuento (valor), IVA %, Subtotal/IVA/Total calculados en tiempo real. Botón "Item manual" agrega fila sin productoId. Botón eliminar (rose ghost, deshabilitado si solo 1 fila). Footer con totales emerald.
  - Resumen sticky: proveedor/NIT/bodega/vencimiento/#items + subtotal bruto, descuentos, base gravable, IVA descontable (teal), Total a pagar (emerald grande). Alerta validación (amber/emerald). Botón Registrar + Limpiar.
- **Validación previa al submit**: proveedor seleccionado, bodega destino, ≥1 item, cada item con descripción, cantidad>0, precio≥0, descuento≤gross. Mensajes con número de item.
- **POST /api/compras**: payload conforme schema zod del endpoint (`proveedorFacturaNumero?`, `terceroId`, `nombreProveedor`, `nitProveedor`, `fechaVencimiento`, `bodegaDestinoId`, `observaciones?`, `items[]`). Toast `success` con número generado y total. Reset form + vuelta a tab "lista".

## Catálogos cargados al montar (Promise.all)
- `GET /api/terceros?tipo=proveedor&pageSize=300`
- `GET /api/productos?pageSize=500`
- `GET /api/bodegas`

## Estilo / UI
- Moneda COP: `formatCurrency` de `@/lib/currency-fn` (Intl.NumberFormat es-CO).
- Toast sonner para feedback. Estados loading con `Loader2` spin + `animate-pulse`.
- Acento emerald/teal en headers, botones primarios, badges, totales, gradientes.
- Dark mode con `dark:` en todas las superficies.
- Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, tablas `overflow-x-auto`, popover se adapta al ancho del trigger.

## Imports
Restringidos a `@/components/ui/*` (card, tabs, button, input, label, textarea, badge, table, dialog, select, popover, command), `sonner`, `lucide-react`, `@/lib/currency-fn`, `@/lib/utils` (cn).

## Verificación
- `bun run lint` → 0 errores/warnings en `compras-view.tsx`. Los errores reportados son todos en archivos ajenos (`page.tsx`, `cartera-view`, `parametros-view`, `repo-crm-albra/*`, `lib/crypto.ts`).
- `bunx tsc --noEmit` → 0 errores de tipo en el archivo nuevo.
- `dev.log` → el último `Can't resolve '@/components/compras/compras-view'` aparece hasta línea 2950 (estado previo a la creación del archivo). El error actual que aparece al final del log es `@/components/parametros/parametros-view` (otra task), lo que confirma que mi módulo resuelve correctamente.

## Pendientes / Notas para siguientes agentes
- El componente depende de que existan los catálogos (`/api/terceros` con `tipo=proveedor`, `/api/productos`, `/api/bodegas`). Si no hay proveedores registrados, el usuario puede crear uno desde el diálogo "Crear proveedor" del tab "Nueva compra".
- El POST a `/api/compras` ya ejecuta en el backend: entrada al inventario en la bodega destino, IVA descontable y `saldoPendiente = total` para CxP. El frontend no duplica esa lógica; solo envía el payload y muestra toast.
- No se implementó edición/anulación de facturas de compra (no estaba en el scope). Para anular sería necesario un endpoint adicional.
