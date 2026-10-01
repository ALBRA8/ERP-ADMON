# Task: ERP-Parametros-UI

Agent: full-stack-developer
Task: Construir vista de Parámetros del ERP Marsella

## Files created
1. `/home/z/my-project/src/app/api/empresas/route.ts` (GET + PUT)
2. `/home/z/my-project/src/app/api/resolucion-dian/route.ts` (GET + POST)
3. `/home/z/my-project/src/app/api/usuarios/route.ts` (GET + POST)
4. `/home/z/my-project/src/components/parametros/parametros-view.tsx` (client component, ~1600 lines)

## Component signature
```ts
export function ParametrosView({
  empresa,
  usuario,
  onReload,
}: {
  empresa?: any;
  usuario?: any;
  onReload?: () => void;
})
```

## 5 Tabs
- **Empresa**: editable form (NIT, razón social, nombre comercial, dirección, teléfono, ciudad, email, website, representante legal, régimen tributario select [simple|comun|gran_contribuyente], responsabilidad select [iva|no_responsable], moneda select [COP|USD], decimales, zona horaria, logo). PUT `/api/empresas` with zod validation; `dirty` flag disables button until changes; `onReload?.()` called on success.
- **Resolución DIAN**: cards grid + "Nueva resolución" Dialog with all fields (numeroResolucion, fechas, prefijo, rangoInicio/rangoFin, tipoOperacion, ambiente, activa Switch). POST desactiva las demás si `activa`.
- **Usuarios y roles**: table (email, nombre, rol badge variant, último login, estado) + "Nuevo usuario" Dialog → POST `/api/usuarios` (email/nombre/rol select/password/teléfono/cargo). Backend uses `hashPassword` from `@/lib/crypto`.
- **Tipos de documento**: read-only table (codigo badge, nombre, naturaleza, afectaCartera, afectaInventario, consecutivoSiguiente). Loaded via `GET /api/empresas?op=tipos-documento`.
- **Información del sistema**: metadata card + emerald card with "Restablecer datos demo" (toast, no destructive op) + full-width card with 6 Hermes→Marsella improvements.

## Security
- All 3 routes use `getSession()` from `@/lib/auth` and filter by `session.empresaId`.
- `PUT /api/empresas` requires `hasPermission(rol, 'parametros:read')` AND `body.id === session.empresaId`.
- `POST /api/usuarios` requires `session.rol === 'admin'`.
- `POST /api/resolucion-dian` requires `hasPermission(rol, 'parametros:read')`.

## Prisma field notes
DB uses lowercase: `rangoinicio`, `rangoinicioActual`, `rangoFinActual`. The `/api/resolucion-dian` route normalizes to `rangoInicio`, `rangoInicioActual`, `rangoFinActual` in the response.

## Style
- Acento emerald/teal en headers, botones primarios, badges activos.
- Dark mode con `dark:`.
- Responsive: `TabsList` grid-cols-3 sm:grid-cols-5; tablas `overflow-x-auto`; grids 1/2/3 columnas.
- Toast sonner en todos los flujos.

## Status
- ✅ Lint clean (0 errors/warnings in the 4 new files).
- ✅ tsc clean (0 type errors in the 4 new files).
- ✅ Resuelve el `Module not found: '@/components/parametros/parametros-view'` pendiente del worklog previo.
- ✅ `src/app/page.tsx:101` ya referencia `<ParametrosView empresa={empresa} usuario={usuario} onReload={checkSession} />`.
