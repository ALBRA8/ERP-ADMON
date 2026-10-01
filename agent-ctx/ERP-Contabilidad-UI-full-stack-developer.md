# Agent Context — ERP-Contabilidad-UI

## Task
Construir vista de Contabilidad (PUC + asientos + balance) del ERP Marsella.
Task ID: `ERP-Contabilidad-UI`.

## Outputs
- `src/components/contabilidad/contabilidad-view.tsx` (1550 líneas, client component `ContabilidadView`).
- `worklog.md` actualizado con sección `ERP-Contabilidad-UI`.

## Key Decisions
- Un solo archivo con 4 tabs (PUC, Asientos, Balance, Mayor) + 2 subcomponentes Dialog.
- Cuentas y terceros cargados al montar (compartidos entre tabs). Comprobantes/balance/mayor cargados on-demand al activar el tab o al consultar.
- Validación de cuadre en tiempo real: diferencia = Σdébitos − Σcréditos, `cuadrado` si `|diferencia| < 0.01`. Botón "Guardar" deshabilitado hasta cuadrar + al menos 2 movimientos con cuenta.
- Acento emerald/teal, dark mode `dark:` en todas las superficies.
- Imports sólo de `@/components/ui/*`, `sonner`, `lucide-react`, y `@/lib/currency-fn`.

## Endpoints Usados
- `GET /api/contabilidad?op=cuentas` → lista de `CuentaPuc`
- `GET /api/contabilidad?op=comprobantes&pageSize=100` → `{items, total, page, pageSize}` de comprobantes
- `GET /api/contabilidad?op=balance` → `{cuentas[], totalDebito, totalCredito, diferencia}`
- `GET /api/contabilidad?op=mayor&cuentaId=<id>` → array de movimientos con saldo acumulado
- `POST /api/contabilidad` con `{fecha, descripcion, movimientos[]}` → crea asiento manual
- `GET /api/terceros?pageSize=200` → `{items, total, page, pageSize}` de terceros

## Notas para Siguientes Agentes
- El endpoint `POST /api/contabilidad` actual SÓLO soporta creación de asientos manuales (no creación de cuentas PUC). El diálogo "Nueva cuenta" intenta POST con `_tipo:"cuenta"` pero el backend no lo soporta todavía → lanzará error 400 con mensaje claro. Si se desea crear cuentas PUC desde la UI, agregar rama en el endpoint POST del backend.
- El botón "Exportar Excel" en balance es mock: abre `/api/contabilidad/export?op=balance` y muestra toast. Ese endpoint no existe → descargará vacío o 404. Implementar endpoint de export si es requerido.
- Los errores de lint/tsc residuales (`page.tsx:59` setState in effect, `repo-crm-albra/*`, `crypto.ts:71`, `db.ts:4`) son preexistentes y de otros módulos. No tocar.
