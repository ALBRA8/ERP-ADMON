# Task: ERP-MCP — Servidor y cliente MCP en el ERP Marsella

## Resumen
Implementación completa del estándar **Model Context Protocol** de Anthropic en el ERP Marsella. El ERP ahora puede:
1. **Servir** recursos/tools/prompts a LLMs externos (Claude, GPT, etc.) vía `/api/mcp` con transporte Streamable HTTP (Web Standard, SSE-style).
2. **Consumir** servidores MCP externos (CRM-ALBRA, bancos, Shopify) registrándolos como conexiones con catálogos cacheados.
3. **Auditar** todas las invocaciones inbound/outbound en `MCPLog`.

## Archivos creados
- `prisma/schema.prisma` — modelos `MCPConexion` y `MCPLog` agregados al final
- `src/lib/mcp-server.ts` — factory `createMcpServer({empresaId, userId})` con 10 resources, 9 tools, 3 prompts + helper `logMcpCall`
- `src/lib/mcp-client.ts` — `class MCPClient` con connect/disconnect/listResources/listTools/listPrompts/syncCatalog/readResource/callTool/getPrompt + reintentos backoff exponencial
- `src/app/api/mcp/route.ts` — POST/GET/DELETE con `WebStandardStreamableHTTPServerTransport`, auth dual token+JWT
- `src/app/api/mcp/conexiones/route.ts` — CRUD completo con cifrado AES-256-GCM del authToken
- `src/app/api/mcp/conexiones/[id]/probar/route.ts`
- `src/app/api/mcp/conexiones/[id]/sincronizar/route.ts`
- `src/app/api/mcp/conexiones/[id]/call-tool/route.ts`
- `src/app/api/mcp/conexiones/[id]/read-resource/route.ts`
- `src/app/api/mcp/conexiones/[id]/get-prompt/route.ts`
- `src/app/api/mcp/logs/route.ts` — GET con filtros + DELETE limpieza >90 días
- `src/app/api/mcp/server-info/route.ts` — metadata del servidor + token (solo admin) + snippets cURL/Python/JS
- `src/components/mcp/mcp-view.tsx` — UI con 4 tabs (Servidor / Conexiones / Auditoría / Documentación)

## Archivos modificados
- `src/components/layout/sidebar.tsx` — item `mcp` con icon `Plug` en grupo Sistema
- `src/app/page.tsx` — import McpView, tipo View + caso `view === "mcp"`
- `src/lib/db.ts` — `hasAllModels` extendido con `mCPConexion`/`mCPLog` para forzar re-creación del singleton cached en dev mode
- `.env` — `MCP_API_TOKEN` y `MCP_EMPRESA_ID`

## Decisión técnica
El SDK trae `SSEServerTransport` (Node-only, requiere `IncomingMessage`/`ServerResponse`) pero no encaja en Next.js 16 App Router con Web API. Se usó `WebStandardStreamableHTTPServerTransport` (Web Standards: Request/Response/ReadableStream) que es la evolución moderna del transporte SSE, mantiene la misma semántica de streaming sobre HTTP y es compatible con cualquier runtime (Node, Bun, Deno, Edge). El cliente usa `StreamableHTTPClientTransport`. URI scheme: `marsella://`.

## Validación end-to-end
Verificada con curl:
- ✅ initialize → protocolVersion 2025-03-26, capabilities, serverInfo
- ✅ tools/list → 9 tools con inputSchema JSON Schema generado desde Zod
- ✅ resources/list → 5 resources estáticos
- ✅ resources/templates/list → 5 templates (terceros/{id}, productos/{id}, facturas/{id}, contabilidad/cuenta/{codigo}, inventario/kardex/{productoId})
- ✅ prompts/list → 3 prompts (resumen_ejecutivo, analisis_cartera, cierre_contable)
- ✅ tools/call consultar_balance → balance real del ERP
- ✅ resources/read marsela://dashboard → KPIs reales (ventasMes, cartera, stockCritico)
- ✅ resources/read marsela://terceros/{id} → template URI resuelta con datos del tercero
- ✅ Connection CRUD (POST/GET/PUT/DELETE) con encrypt/decrypt del authToken
- ✅ probar conexión externa → ok:false con error si endpoint inválido; ok:true con catálogo si válido
- ✅ sincronizar → guarda catálogos JSON en DB, actualiza ultimoSync
- ✅ call-tool / read-resource / get-prompt via MCPClient → loguean en MCPLog direccion=outbound
- ✅ GET /api/mcp/logs → auditoría con direccion, tipo, nombre, resultado, duración, error

## Lint / tipos
- `bun run lint` → 0 errores y 0 warnings en TODOS los archivos nuevos
- `bunx tsc --noEmit` → 0 errores en archivos MCP (errores residuales son todos preexistentes en otros módulos)

## Recursos disponibles para LLMs externos
- `marsella://dashboard` — KPIs consolidados
- `marsella://terceros` + `marsella://terceros/{id}`
- `marsella://productos` + `marsella://productos/{id}`
- `marsella://facturas` + `marsella://facturas/{id}`
- `marsella://contabilidad/balance`
- `marsella://contabilidad/cuenta/{codigo}`
- `marsella://inventario/kardex/{productoId}`

## Tools disponibles
- `crear_tercero`, `crear_producto`, `crear_factura` (devuelve {numero, cufe, total})
- `registrar_pago`, `crear_asiento_contable`, `ajustar_inventario`
- `consultar_cartera`, `consultar_balance`, `consultar_kardex`

## Prompts disponibles
- `resumen_ejecutivo`, `analisis_cartera`, `cierre_contable`
