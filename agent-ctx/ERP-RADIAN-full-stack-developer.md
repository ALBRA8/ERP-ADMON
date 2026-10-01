# ERP-RADIAN — DIAN Radian (Eventos de Recepción) — Hermes §5.5

Task ID: ERP-RADIAN
Agent: full-stack-developer
Date: 2026-10-01

## Resumen

Implementé el módulo DIAN Radian para gestionar facturas electrónicas como títulos valor. Los eventos principales (030 acuse recibo, 031 recibo bien, 032 rechazo, 033 transferencia, 034 pago, 035 cobro, 036 cancelación sin pago) son XMLs UBL 2.1 ApplicationResponse firmados XAdES-EPES y enviados al WebService SOAP de DIAN.

## Archivos creados

- `src/lib/radian.ts` (~830 líneas) — 4 funciones principales:
  - `generarEventoRadianXML(input, cufeEvento)` — XML UBL 2.1 ApplicationResponse
  - `calcularCUFEEvento(input)` — SHA-384(numEvento + fecGen + horGen + valTotal + codDocEvento + nitEmisor + tipNotDoc + nitReceptor + cufeFactura + ambiente + "E")
  - `enviarEventoRadianADian(eventoId, empresaId)` — firma XAdES-EPES sobre `<ApplicationResponse>` + envío SOAP a `vpfe-hab.dian.gov.co/Event/v1.0/ApplicationResponseService.svc`
  - `procesarColaRadian(empresaId, limite=50)` — backoff exponencial, contador en `respuestaDIAN.intentos` (modelo no tiene columna de intentos)
  - `siguienteNumeroRadian(empresaId)` — `RAD-2026-NNNNNN` consecutivo por año
  - `TIPOS_EVENTO_RADIAN` constante con 7 tipos + labels + descripciones

- `src/app/api/radian/eventos/route.ts` — GET (filtros tipo/estado/fechaInicio/fechaFin/terceroId/q + paginación) + POST (crea evento, intenta envío automático)
- `src/app/api/radian/eventos/[id]/route.ts` — GET detalle con facturaCompra + tercero enriquecidos
- `src/app/api/radian/eventos/[id]/enviar/route.ts` — POST reenvío manual
- `src/app/api/radian/eventos/[id]/anular/route.ts` — POST anula (no aceptado, no enviado)
- `src/app/api/radian/eventos/bulk/route.ts` — POST masivo (máx 200) para acuses 030
- `src/app/api/radian/eventos/stats/route.ts` — GET con por_tipo, por_estado, total, ultimos_30_dias

- `src/components/radian/radian-view.tsx` (~1200 líneas) — único componente client `RadianView` con 4 tabs:
  - **Eventos**: tabla + filtros + diálogo nuevo evento + sheet detalle con pretty-XML + respuesta DIAN + botones reenviar/anular
  - **Acuse masivo**: rango fechas + tabla facturas compra sin 030 + input manual CUFE por factura + bulk POST
  - **Estadísticas**: 4 KPI cards + barras por tipo + barras por estado + gráfica 30 días apilada por tipo (sin recharts)
  - **Historial**: tabla cronológica con trackId + mensajeError + tooltips

## Archivos modificados

- `src/components/layout/sidebar.tsx`: añadí import `Inbox`, `NavKey |= "radian"`, item `{key:"radian", label:"DIAN Radian", icon:Inbox, group:"Operación"}` después de `dian`
- `src/app/page.tsx`: import `RadianView`, añadí `"radian"` a `View`, caso `view === "radian" && <RadianView />`
- `src/lib/db.ts`: añadí `"eventoRadian"` a `hasAllModels.required` (línea 74) para auto-bust del singleton tras `prisma generate`

## Verificación funcional (curl autenticado demo@marsella.com / demo1234)

- `POST /api/radian/eventos` (tipo 030) → 200 `RAD-2026-000001`, XML firmado XAdES-EPES con `<ds:SignatureValue>`, `<xades:QualifyingProperties>`, `estado=borrador` con `mensajeError="No hay token de proveedor tecnológico configurado. Solicítelo a su PAC."`
- `POST /api/radian/eventos/bulk` (2 eventos 030) → 200 `{creados:2, errores:[], total:2}`
- `GET /api/radian/eventos/stats` → 200 `{por_tipo:{030:N,031:N}, por_estado:{borrador:N, rechazado:N}, total:N, ultimos_30_dias:[30 buckets]}`
- `GET /api/radian/eventos/[id]` → 200 con `xmlEvento`, `respuestaDIAN`, `facturaCompra`, `tercero`
- `POST /api/radian/eventos/[id]/enviar` → 200 `{ok:false, estado:"borrador", mensajeError:"No hay token..."}`
- `POST /api/radian/eventos/[id]/anular` → 200 `{ok:true, evento:{estado:"anulado", observaciones:"[Anulado por demo@marsella.com el 2026-10-01T...]}}`

## Lint
`bun run lint` **EXIT 0** (0 errores, 0 warnings). Sin test code.

## Limitaciones

- Sin credenciales DIAN reales (PAC + certificado), eventos quedan en `borrador` con mensajeError claro (mismo patrón graceful que `dian-real.ts`).
- Modelo `EventoRadian` no tiene columna `intentos` (regla "No tocar Prisma") → contador implícito en `respuestaDIAN.intentos`.
- `FacturaCompra` actual no tiene CUFE → en tab "Acuse masivo" el usuario pega el CUFE manualmente por factura.
- Helper local `signApplicationResponseWithXAdES` en `radian.ts` reimplementa lógica de `signXMLWithXAdES` de `dian-real.ts` pero apuntando XPath a `<ApplicationResponse>` (no `<Invoice>`). No se tocó `dian-real.ts` (regla "No tocar otros módulos").
- `procesarColaRadian` está implementado pero no expuesto como endpoint HTTP en esta tarea (no estaba en el spec). Listo para invocarse desde cron o endpoint futuro.
