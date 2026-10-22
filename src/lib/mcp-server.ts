// ============================================================
// mcp-server.ts — Servidor MCP del ERP Marsella
// Expone resources, tools y prompts para ser consumidos por
// LLMs (asistentes de IA) u otros sistemas externos.
// Transporte: Streamable HTTP (Web Standard) sobre /api/mcp.
// ============================================================
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { round } from "@/lib/currency";

// ---------- Helpers ----------

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function truncate(s: string, max = 10000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…(truncado)";
}

interface McpContext {
  empresaId: string;
  userId?: string;
}

// ---------- Logging ----------

export async function logMcpCall(params: {
  empresaId: string;
  conexionId?: string;
  direccion: "inbound" | "outbound";
  tipo: "resource" | "tool" | "prompt";
  nombre: string;
  argumentos?: unknown;
  resultado?: unknown;
  duracionMs?: number;
  userId?: string;
  error?: string;
}): Promise<void> {
  try {
    await db.mCPLog.create({
      data: {
        empresaId: params.empresaId,
        conexionId: params.conexionId ?? null,
        direccion: params.direccion,
        tipo: params.tipo,
        nombre: params.nombre,
        argumentos: params.argumentos
          ? truncate(JSON.stringify(params.argumentos))
          : null,
        resultado: params.resultado
          ? truncate(JSON.stringify(params.resultado))
          : null,
        duracionMs: params.duracionMs ?? null,
        userId: params.userId ?? null,
        error: params.error ?? null,
      },
    });
  } catch (e) {
    console.error("[mcp] logMcpCall error", e);
  }
}

// ---------- Datos (queries directas a DB, sin pasar por API HTTP) ----------

async function getDashboardData(empresaId: string) {
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

  const [facturasMes, carteraRaw, productos, comprasMes, egresosMes] =
    await Promise.all([
      db.facturaVenta.findMany({
        where: {
          empresaId,
          fecha: { gte: inicioMes },
          estado: "vigente",
        },
        select: {
          total: true,
          subtotalNeto: true,
          totalIva: true,
          saldoPendiente: true,
        },
      }),
      db.facturaVenta.findMany({
        where: {
          empresaId,
          estado: "vigente",
          saldoPendiente: { gt: 0 },
        },
        select: { saldoPendiente: true, fechaVencimiento: true },
      }),
      db.producto.findMany({
        where: { empresaId, activo: true },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          stockMinimo: true,
          saldosInventario: { select: { cantidad: true } },
        },
      }),
      db.facturaCompra.findMany({
        where: { empresaId, fecha: { gte: inicioMes } },
        select: { total: true },
      }),
      db.comprobanteEgreso.findMany({
        where: { empresaId, fecha: { gte: inicioMes } },
        select: { valorTotal: true },
      }),
    ]);

  const ventasMes = round(
    facturasMes.reduce((a, f) => a + Number(f.total), 0),
    2,
  );
  const carteraTotal = round(
    carteraRaw.reduce((a, c) => a + Number(c.saldoPendiente), 0),
    2,
  );
  const hoy = new Date();
  let carteraVencida = 0;
  let cartera30 = 0;
  let cartera60 = 0;
  let cartera90 = 0;
  let carteraMas90 = 0;
  for (const c of carteraRaw) {
    if (!c.fechaVencimiento) continue;
    const dias = Math.floor(
      (hoy.getTime() - c.fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (dias <= 0) continue;
    const saldo = Number(c.saldoPendiente);
    if (dias <= 30) cartera30 += saldo;
    else if (dias <= 60) cartera60 += saldo;
    else if (dias <= 90) cartera90 += saldo;
    else carteraMas90 += saldo;
    carteraVencida += saldo;
  }

  const stockCritico = productos
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      stockMinimo: p.stockMinimo,
      stockActual: p.saldosInventario.reduce((a, s) => a + s.cantidad, 0),
    }))
    .filter((p) => p.stockActual <= p.stockMinimo);

  const comprasMesTotal = round(
    comprasMes.reduce((a, c) => a + Number(c.total), 0),
    2,
  );
  const egresosMesTotal = round(
    egresosMes.reduce((a, c) => a + Number(c.valorTotal), 0),
    2,
  );

  return {
    periodo: {
      inicio: inicioMes.toISOString(),
      fin: now.toISOString(),
    },
    kpis: {
      ventasMes,
      numFacturasMes: facturasMes.length,
      comprasMes: comprasMesTotal,
      egresosMes: egresosMesTotal,
      carteraTotal,
      carteraVencida: round(carteraVencida, 2),
      cartera30: round(cartera30, 2),
      cartera60: round(cartera60, 2),
      cartera90: round(cartera90, 2),
      carteraMas90: round(carteraMas90, 2),
      productosStockCritico: stockCritico.length,
    },
    stockCritico,
  };
}

async function getTercero(empresaId: string, id: string) {
  const t = await db.tercero.findFirst({
    where: { id, empresaId },
    include: { ciudad: true },
  });
  if (!t) return null;
  return t;
}

async function listTerceros(
  empresaId: string,
  opts: { tipo?: string; q?: string; page?: number; pageSize?: number },
) {
  const where: any = { empresaId };
  if (opts.tipo && opts.tipo !== "todos") where.tipo = opts.tipo;
  if (opts.q) {
    where.OR = [
      { nombre: { contains: opts.q } },
      { numeroDocumento: { contains: opts.q } },
      { email: { contains: opts.q } },
    ];
  }
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const [items, total] = await Promise.all([
    db.tercero.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { ciudad: true },
    }),
    db.tercero.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

async function getProducto(empresaId: string, id: string) {
  const p = await db.producto.findFirst({
    where: { id, empresaId },
    include: {
      unidadMedida: true,
      linea: true,
      impuesto: true,
      saldosInventario: { include: { bodega: true } },
    },
  });
  if (!p) return null;
  return {
    ...p,
    stockTotal: p.saldosInventario.reduce((a, s) => a + s.cantidad, 0),
    valorInventario: p.saldosInventario.reduce((a, s) => a + Number(s.costoTotal), 0),
    bodegas: p.saldosInventario,
  };
}

async function listProductos(
  empresaId: string,
  opts: { q?: string; page?: number; pageSize?: number },
) {
  const where: any = { empresaId, activo: true };
  if (opts.q) {
    where.OR = [
      { codigo: { contains: opts.q } },
      { nombre: { contains: opts.q } },
      { codigoBarras: { contains: opts.q } },
    ];
  }
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const [items, total] = await Promise.all([
    db.producto.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        unidadMedida: true,
        saldosInventario: { include: { bodega: true } },
      },
    }),
    db.producto.count({ where }),
  ]);
  return {
    items: items.map((p) => ({
      ...p,
      stockTotal: p.saldosInventario.reduce((a, s) => a + s.cantidad, 0),
    })),
    total,
    page,
    pageSize,
  };
}

async function getFactura(empresaId: string, id: string) {
  const f = await db.facturaVenta.findFirst({
    where: { id, empresaId },
    include: {
      tercero: true,
      detalles: true,
      tipoDocumento: true,
    },
  });
  if (!f) return null;
  return f;
}

async function listFacturas(
  empresaId: string,
  opts: { estado?: string; page?: number; pageSize?: number },
) {
  const where: any = { empresaId };
  if (opts.estado) where.estado = opts.estado;
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const [items, total] = await Promise.all([
    db.facturaVenta.findMany({
      where,
      orderBy: { fecha: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { tercero: true },
    }),
    db.facturaVenta.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

async function getBalance(empresaId: string) {
  const cuentas = await db.cuentaPuc.findMany({
    where: { empresaId },
    orderBy: { codigo: "asc" },
  });
  const movs = await db.movimientoContable.findMany({
    where: {
      empresaId,
      comprobante: { estado: "contabilizado" },
    },
    select: { cuentaId: true, debito: true, credito: true },
  });
  const sumas: Record<string, { debito: number; credito: number }> = {};
  for (const m of movs) {
    const cur = sumas[m.cuentaId] ?? { debito: 0, credito: 0 };
    cur.debito += Number(m.debito);
    cur.credito += Number(m.credito);
    sumas[m.cuentaId] = cur;
  }
  const balance = cuentas.map((c) => {
    const s = sumas[c.id] ?? { debito: 0, credito: 0 };
    const saldo = round(
      c.naturaleza === "debito" ? s.debito - s.credito : s.credito - s.debito,
      2,
    );
    return {
      codigo: c.codigo,
      nombre: c.nombre,
      naturaleza: c.naturaleza,
      nivel: c.nivel,
      debito: round(s.debito, 2),
      credito: round(s.credito, 2),
      saldo,
    };
  });
  const totalDebito = round(
    balance.reduce((a, b) => a + b.debito, 0),
    2,
  );
  const totalCredito = round(
    balance.reduce((a, b) => a + b.credito, 0),
    2,
  );
  return {
    cuentas: balance.filter(
      (b) => b.debito !== 0 || b.credito !== 0 || b.nivel <= 2,
    ),
    totalDebito,
    totalCredito,
    diferencia: round(totalDebito - totalCredito, 2),
  };
}

async function getMayorCuenta(empresaId: string, codigo: string) {
  const cuenta = await db.cuentaPuc.findFirst({
    where: { empresaId, codigo },
  });
  if (!cuenta) return null;
  const movs = await db.movimientoContable.findMany({
    where: {
      empresaId,
      cuentaId: cuenta.id,
      comprobante: { estado: "contabilizado" },
    },
    orderBy: { fecha: "asc" },
    include: { comprobante: true, tercero: true },
  });
  let saldo = 0;
  return {
    cuenta: {
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      naturaleza: cuenta.naturaleza,
    },
    movimientos: movs.map((m) => {
      saldo = round(saldo + Number(m.debito) - Number(m.credito), 2);
      return {
        fecha: m.fecha,
        comprobante: m.comprobante?.numero,
        descripcion: m.descripcion,
        debito: m.debito,
        credito: m.credito,
        saldo,
        tercero: m.tercero?.nombre,
      };
    }),
  };
}

async function getKardex(
  empresaId: string,
  productoId: string,
  bodegaId?: string,
  fechaInicio?: Date,
  fechaFin?: Date,
) {
  const where: any = { empresaId, productoId };
  if (bodegaId) where.bodegaId = bodegaId;
  if (fechaInicio || fechaFin) {
    where.fecha = {};
    if (fechaInicio) where.fecha.gte = fechaInicio;
    if (fechaFin) where.fecha.lte = fechaFin;
  }
  const movs = await db.movimientoInventario.findMany({
    where,
    orderBy: { fecha: "asc" },
    include: { producto: true, bodega: true },
  });
  let cantidad = 0;
  let valor = 0;
  return {
    producto: movs[0]?.producto
      ? {
          id: movs[0].producto.id,
          codigo: movs[0].producto.codigo,
          nombre: movs[0].producto.nombre,
        }
      : null,
    movimientos: movs.map((m) => {
      cantidad = round(cantidad + m.cantidad, 2);
      valor = round(valor + Number(m.costoTotal), 2);
      return {
        fecha: m.fecha,
        bodega: m.bodega?.nombre,
        tipo: m.tipo,
        cantidad: m.cantidad,
        costoUnitario: m.costoUnitario,
        costoTotal: m.costoTotal,
        documentoTipo: m.documentoTipo,
        documentoId: m.documentoId,
        saldoCantidad: cantidad,
        saldoValor: valor,
      };
    }),
  };
}

// ---------- Factory: crear servidor MCP por empresa ----------

export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    {
      name: "marsella-erp",
      version: "1.0.0",
    },
    {
      instructions:
        "Servidor MCP del ERP Marsella. Recursos: dashboard, terceros, productos, facturas, contabilidad, inventario. Tools para crear entidades y consultar saldos. Prompts para análisis gerencial.",
    },
  );

  // ---------- Resources ----------

  // marsella://dashboard
  server.registerResource(
    "dashboard",
    "marsella://dashboard",
    {
      title: "Dashboard KPIs",
      description:
        "KPIs consolidados del ERP: ventas del mes, cartera (total/vencida/aging), stock crítico, compras y egresos del mes.",
      mimeType: "application/json",
    },
    async () => {
      const start = Date.now();
      try {
        const data = await getDashboardData(ctx.empresaId);
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://dashboard",
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: "marsella://dashboard",
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://dashboard",
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://terceros/{id}
  server.registerResource(
    "tercero-detalle",
    new ResourceTemplate("marsella://terceros/{id}", { list: undefined }),
    {
      title: "Detalle de un tercero",
      description: "Información completa de un cliente, proveedor o empleado.",
      mimeType: "application/json",
    },
    async (uri: URL, { id }) => {
      const start = Date.now();
      try {
        const data = await getTercero(ctx.empresaId, String(id));
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://terceros/${id}`,
          argumentos: { id },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://terceros/${id}`,
          argumentos: { id },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://terceros (lista filtrada por query)
  server.registerResource(
    "terceros-lista",
    "marsella://terceros",
    {
      title: "Lista de terceros",
      description:
        "Lista filtrada de terceros. Query: ?tipo=cliente|proveedor&q=texto&page=1&pageSize=50",
      mimeType: "application/json",
    },
    async (uri: URL) => {
      const start = Date.now();
      const params = uri.searchParams;
      const tipo = params.get("tipo") ?? undefined;
      const q = params.get("q") ?? undefined;
      const page = params.get("page") ? Number(params.get("page")) : undefined;
      const pageSize = params.get("pageSize")
        ? Number(params.get("pageSize"))
        : undefined;
      try {
        const data = await listTerceros(ctx.empresaId, {
          tipo: tipo ?? undefined,
          q: q ?? undefined,
          page,
          pageSize,
        });
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://terceros",
          argumentos: { tipo, q, page, pageSize },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://terceros",
          argumentos: { tipo, q, page, pageSize },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://productos/{id}
  server.registerResource(
    "producto-detalle",
    new ResourceTemplate("marsella://productos/{id}", { list: undefined }),
    {
      title: "Detalle de un producto",
      description: "Información completa de un producto con stock por bodega.",
      mimeType: "application/json",
    },
    async (uri: URL, { id }) => {
      const start = Date.now();
      try {
        const data = await getProducto(ctx.empresaId, String(id));
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://productos/${id}`,
          argumentos: { id },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://productos/${id}`,
          argumentos: { id },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://productos (lista)
  server.registerResource(
    "productos-lista",
    "marsella://productos",
    {
      title: "Lista de productos",
      description: "Lista filtrada de productos. Query: ?q=texto&page=1",
      mimeType: "application/json",
    },
    async (uri: URL) => {
      const start = Date.now();
      const params = uri.searchParams;
      const q = params.get("q") ?? undefined;
      const page = params.get("page") ? Number(params.get("page")) : undefined;
      const pageSize = params.get("pageSize")
        ? Number(params.get("pageSize"))
        : undefined;
      try {
        const data = await listProductos(ctx.empresaId, {
          q: q ?? undefined,
          page,
          pageSize,
        });
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://productos",
          argumentos: { q, page, pageSize },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://productos",
          argumentos: { q, page, pageSize },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://facturas/{id}
  server.registerResource(
    "factura-detalle",
    new ResourceTemplate("marsella://facturas/{id}", { list: undefined }),
    {
      title: "Detalle de una factura de venta",
      description: "Factura con CUFE, XML y detalles. Incluye tercero y items.",
      mimeType: "application/json",
    },
    async (uri: URL, { id }) => {
      const start = Date.now();
      try {
        const data = await getFactura(ctx.empresaId, String(id));
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://facturas/${id}`,
          argumentos: { id },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://facturas/${id}`,
          argumentos: { id },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://facturas (lista)
  server.registerResource(
    "facturas-lista",
    "marsella://facturas",
    {
      title: "Lista de facturas de venta",
      description: "Lista filtrada por estado. Query: ?estado=vigente|anulada",
      mimeType: "application/json",
    },
    async (uri: URL) => {
      const start = Date.now();
      const estado = uri.searchParams.get("estado") ?? undefined;
      try {
        const data = await listFacturas(ctx.empresaId, { estado: estado ?? undefined });
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://facturas",
          argumentos: { estado },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://facturas",
          argumentos: { estado },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://contabilidad/balance
  server.registerResource(
    "balance-prueba",
    "marsella://contabilidad/balance",
    {
      title: "Balance de prueba",
      description: "Balance de prueba actual con totales y diferencia.",
      mimeType: "application/json",
    },
    async () => {
      const start = Date.now();
      try {
        const data = await getBalance(ctx.empresaId);
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://contabilidad/balance",
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: "marsella://contabilidad/balance",
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: "marsella://contabilidad/balance",
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://contabilidad/cuenta/{codigo}
  server.registerResource(
    "mayor-cuenta",
    new ResourceTemplate("marsella://contabilidad/cuenta/{codigo}", { list: undefined }),
    {
      title: "Mayor de una cuenta",
      description: "Libro mayor de una cuenta por código PUC (ej: 1105).",
      mimeType: "application/json",
    },
    async (uri: URL, { codigo }) => {
      const start = Date.now();
      try {
        const data = await getMayorCuenta(ctx.empresaId, String(codigo));
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://contabilidad/cuenta/${codigo}`,
          argumentos: { codigo },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://contabilidad/cuenta/${codigo}`,
          argumentos: { codigo },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // marsella://inventario/kardex/{productoId}
  server.registerResource(
    "kardex-producto",
    new ResourceTemplate("marsella://inventario/kardex/{productoId}", { list: undefined }),
    {
      title: "Kardex de un producto",
      description:
        "Kardex (movimientos valorizados) de un producto. Query opcional: ?bodegaId=&fechaInicio=&fechaFin=",
      mimeType: "application/json",
    },
    async (uri: URL, { productoId }) => {
      const start = Date.now();
      const params = uri.searchParams;
      const bodegaId = params.get("bodegaId") ?? undefined;
      const fechaInicio = params.get("fechaInicio")
        ? new Date(params.get("fechaInicio")!)
        : undefined;
      const fechaFin = params.get("fechaFin")
        ? new Date(params.get("fechaFin")!)
        : undefined;
      try {
        const data = await getKardex(
          ctx.empresaId,
          String(productoId),
          bodegaId,
          fechaInicio,
          fechaFin,
        );
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://inventario/kardex/${productoId}`,
          argumentos: { productoId, bodegaId, fechaInicio, fechaFin },
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "resource",
          nombre: `marsella://inventario/kardex/${productoId}`,
          argumentos: { productoId, bodegaId, fechaInicio, fechaFin },
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        throw e;
      }
    },
  );

  // ---------- Tools ----------

  // crear_tercero
  server.registerTool(
    "crear_tercero",
    {
      description:
        "Crea un nuevo tercero (cliente, proveedor, empleado o socio).",
      inputSchema: {
        tipo: z.enum(["cliente", "proveedor", "empleado", "socio", "todos"]),
        tipoDocumento: z.string().default("CC"),
        numeroDocumento: z.string().min(3),
        nombre: z.string().min(2),
        telefono: z.string().optional(),
        email: z.string().optional(),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const t = await db.tercero.create({
          data: {
            empresaId: ctx.empresaId,
            tipo: args.tipo,
            tipoDocumento: args.tipoDocumento,
            numeroDocumento: args.numeroDocumento,
            nombre: args.nombre,
            telefono: args.telefono,
            email: args.email || null,
          },
        });
        const result = { id: t.id, nombre: t.nombre, tipo: t.tipo };
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_tercero",
          argumentos: args,
          resultado: result,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_tercero",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // crear_producto
  server.registerTool(
    "crear_producto",
    {
      description: "Crea un nuevo producto con código, nombre, precio y costo.",
      inputSchema: {
        codigo: z.string().min(2),
        nombre: z.string().min(2),
        precio: z.number().nonnegative(),
        costo: z.number().nonnegative().default(0),
        tarifaIva: z.number().default(19),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const p = await db.producto.create({
          data: {
            empresaId: ctx.empresaId,
            codigo: args.codigo,
            nombre: args.nombre,
            precio1: args.precio,
            costoPromedio: args.costo,
            ultimoCosto: args.costo,
            tarifaIva: args.tarifaIva,
          },
        });
        const result = { id: p.id, codigo: p.codigo, nombre: p.nombre };
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_producto",
          argumentos: args,
          resultado: result,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_producto",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // crear_factura
  server.registerTool(
    "crear_factura",
    {
      description:
        "Crea una factura de venta simplificada. Devuelve { numero, cufe, total }. Items: [{ productoId?, descripcion, cantidad, precioUnitario, tarifaIva? }].",
      inputSchema: {
        terceroId: z.string(),
        items: z
          .array(
            z.object({
              productoId: z.string().optional(),
              descripcion: z.string(),
              cantidad: z.number().positive(),
              precioUnitario: z.number().nonnegative(),
              tarifaIva: z.number().default(19),
            }),
          )
          .min(1),
        formaPago: z
          .enum(["efectivo", "tarjeta", "transferencia", "credito", "mixto"])
          .default("efectivo"),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const tercero = await db.tercero.findFirst({
          where: { id: args.terceroId, empresaId: ctx.empresaId },
        });
        if (!tercero) throw new Error("Tercero no encontrado");

        // Resolución DIAN activa
        const resolucion = await db.resolucionDian.findFirst({
          where: { empresaId: ctx.empresaId, activa: true },
          orderBy: { createdAt: "desc" },
        });
        if (!resolucion) throw new Error("No hay resolución DIAN activa");
        if (resolucion.consecutivoSiguiente > resolucion.rangoFin) {
          throw new Error("Se agotó el rango de numeración DIAN");
        }

        let subtotalBruto = 0;
        let totalIva = 0;
        let costoTotal = 0;
        const detallesData: any[] = [];
        for (const item of args.items) {
          const gross = round(item.cantidad * item.precioUnitario, 2);
          const iva = round(gross * (item.tarifaIva / 100), 2);
          subtotalBruto += gross;
          totalIva += iva;
          let costoUnitario = 0;
          if (item.productoId) {
            const prod = await db.producto.findUnique({
              where: { id: item.productoId },
            });
            if (prod) {
              costoUnitario = prod.costoPromedio;
              costoTotal += costoUnitario * item.cantidad;
            }
          }
          detallesData.push({
            productoId: item.productoId,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            unidadMedida: "UND",
            precioUnitario: item.precioUnitario,
            descuentoPorcentaje: 0,
            descuentoValor: 0,
            subtotal: gross,
            tarifaIva: item.tarifaIva,
            iva,
            total: round(gross + iva, 2),
            costoUnitario,
          });
        }

        const subtotalNeto = round(subtotalBruto, 2);
        const total = round(subtotalNeto + totalIva, 2);
        const consecutivo = resolucion.consecutivoSiguiente;
        const numero = `${resolucion.prefijo}-${String(consecutivo).padStart(6, "0")}`;

        // CUFE mock (sha384 simple)
        const cufe = `${numero}|${total}|${Date.now()}`.padEnd(64, "x");

        const factura = await db.facturaVenta.create({
          data: {
            empresaId: ctx.empresaId,
            numero,
            consecutivoDIAN: consecutivo,
            prefijo: resolucion.prefijo,
            terceroId: tercero.id,
            nombreCliente: tercero.nombre,
            nitCliente: tercero.numeroDocumento,
            subtotalBruto,
            descuentoTotal: 0,
            subtotalNeto,
            totalIva,
            total,
            cufe,
            estadoDIAN: "procesado",
            formaPago: args.formaPago,
            saldoPendiente:
              args.formaPago === "credito" ? total : 0,
            estadoCartera:
              args.formaPago === "credito" ? "pendiente" : "pagada",
            estado: "vigente",
            detalles: { create: detallesData },
          },
        });

        // Avanzar consecutivo DIAN
        await db.resolucionDian.update({
          where: { id: resolucion.id },
          data: { consecutivoSiguiente: { increment: 1 } },
        });

        // Si es a crédito, subir saldo de cartera del tercero
        if (args.formaPago === "credito") {
          await db.tercero.update({
            where: { id: tercero.id },
            data: { saldoCartera: { increment: total } },
          });
        }

        const result = {
          id: factura.id,
          numero: factura.numero,
          cufe: factura.cufe,
          total: factura.total,
        };
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_factura",
          argumentos: args,
          resultado: result,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_factura",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // registrar_pago
  server.registerTool(
    "registrar_pago",
    {
      description:
        "Registra un recibo de caja (CXC) o comprobante de egreso (CXP).",
      inputSchema: {
        terceroId: z.string(),
        valor: z.number().positive(),
        formaPago: z
          .enum(["efectivo", "tarjeta", "transferencia", "cheque"])
          .default("efectivo"),
        concepto: z.string().optional(),
        tipo: z.enum(["recibo", "egreso"]).default("recibo"),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const tercero = await db.tercero.findFirst({
          where: { id: args.terceroId, empresaId: ctx.empresaId },
        });
        if (!tercero) throw new Error("Tercero no encontrado");

        let numero: string;
        let item: any;
        if (args.tipo === "recibo") {
          const cnt = await db.reciboCaja.count({
            where: { empresaId: ctx.empresaId },
          });
          numero = `RC-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
          item = await db.reciboCaja.create({
            data: {
              empresaId: ctx.empresaId,
              numero,
              terceroId: tercero.id,
              nombreTercero: tercero.nombre,
              valorTotal: args.valor,
              concepto: args.concepto,
              formaPago: args.formaPago,
            },
          });
          await db.tercero.update({
            where: { id: tercero.id },
            data: { saldoCartera: { decrement: args.valor } },
          });
        } else {
          const cnt = await db.comprobanteEgreso.count({
            where: { empresaId: ctx.empresaId },
          });
          numero = `CE-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
          item = await db.comprobanteEgreso.create({
            data: {
              empresaId: ctx.empresaId,
              numero,
              terceroId: tercero.id,
              nombreTercero: tercero.nombre,
              valorTotal: args.valor,
              concepto: args.concepto,
              formaPago: args.formaPago,
            },
          });
        }

        const result = { id: item.id, numero, valor: args.valor };
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "registrar_pago",
          argumentos: args,
          resultado: result,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "registrar_pago",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // crear_asiento_contable
  server.registerTool(
    "crear_asiento_contable",
    {
      description:
        "Crea un asiento contable manual con N movimientos. Debe cuadrar (total débito = total crédito).",
      inputSchema: {
        descripcion: z.string().optional(),
        movimientos: z
          .array(
            z.object({
              cuentaId: z.string(),
              debito: z.number().default(0),
              credito: z.number().default(0),
            }),
          )
          .min(2),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const totalDebito = round(
          args.movimientos.reduce((a, m) => a + m.debito, 0),
          2,
        );
        const totalCredito = round(
          args.movimientos.reduce((a, m) => a + m.credito, 0),
          2,
        );
        const diferencia = round(totalDebito - totalCredito, 2);
        if (Math.abs(diferencia) > 0.01) {
          throw new Error(
            `Asiento descuadrado: débitos ${totalDebito} vs créditos ${totalCredito}`,
          );
        }

        const cnt = await db.comprobante.count({
          where: { empresaId: ctx.empresaId },
        });
        const numero = `CG-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
        const comprobante = await db.comprobante.create({
          data: {
            empresaId: ctx.empresaId,
            numero,
            tipo: "manual",
            descripcion: args.descripcion ?? `Asiento MCP ${numero}`,
            totalDebito,
            totalCredito,
            diferencia: 0,
            estado: "contabilizado",
            movimientos: {
              create: args.movimientos.map((m) => ({
                empresaId: ctx.empresaId,
                cuentaId: m.cuentaId,
                debito: m.debito,
                credito: m.credito,
              })),
            },
          },
        });

        // Actualizar saldos de cuentas
        for (const m of args.movimientos) {
          const cuenta = await db.cuentaPuc.findUnique({
            where: { id: m.cuentaId },
          });
          if (cuenta) {
            const delta =
              cuenta.naturaleza === "debito"
                ? m.debito - m.credito
                : m.credito - m.debito;
            await db.cuentaPuc.update({
              where: { id: cuenta.id },
              data: { saldoActual: { increment: delta } },
            });
          }
        }

        const result = {
          id: comprobante.id,
          numero: comprobante.numero,
          totalDebito,
          totalCredito,
        };
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_asiento_contable",
          argumentos: args,
          resultado: result,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "crear_asiento_contable",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // ajustar_inventario
  server.registerTool(
    "ajustar_inventario",
    {
      description:
        "Registra un movimiento de inventario (entrada/salida/ajuste) y actualiza saldos.",
      inputSchema: {
        productoId: z.string(),
        bodegaId: z.string(),
        tipo: z.enum(["entrada", "salida", "traslado", "ajuste"]),
        cantidad: z.number(),
        costoUnitario: z.number().default(0),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const cantidad =
          args.tipo === "salida" || args.tipo === "ajuste"
            ? args.cantidad
            : Math.abs(args.cantidad);
        const costoTotal = round(cantidad * args.costoUnitario, 2);

        const movimiento = await db.movimientoInventario.create({
          data: {
            empresaId: ctx.empresaId,
            productoId: args.productoId,
            bodegaId: args.bodegaId,
            tipo: args.tipo,
            cantidad:
              args.tipo === "salida" ? -Math.abs(cantidad) : Math.abs(cantidad),
            costoUnitario: args.costoUnitario,
            costoTotal,
            documentoTipo: "AJUSTE_MCP",
          },
        });

        // Actualizar saldo
        const existing = await db.saldoInventario.findUnique({
          where: {
            productoId_bodegaId: {
              productoId: args.productoId,
              bodegaId: args.bodegaId,
            },
          },
        });
        if (existing) {
          const nuevaCantidad = round(
            existing.cantidad +
              (args.tipo === "salida" ? -Math.abs(cantidad) : Math.abs(cantidad)),
            2,
          );
          const nuevoCosto = round(
            Number(existing.costoTotal) +
              (args.tipo === "salida" ? -costoTotal : costoTotal),
            2,
          );
          await db.saldoInventario.update({
            where: { id: existing.id },
            data: {
              cantidad: nuevaCantidad,
              costoTotal: nuevoCosto,
              costoPromedio:
                nuevaCantidad > 0 ? round(nuevoCosto / nuevaCantidad, 2) : 0,
            },
          });
        } else if (args.tipo !== "salida") {
          await db.saldoInventario.create({
            data: {
              empresaId: ctx.empresaId,
              productoId: args.productoId,
              bodegaId: args.bodegaId,
              cantidad: Math.abs(cantidad),
              costoTotal,
              costoPromedio: args.costoUnitario,
            },
          });
        }

        const result = { id: movimiento.id, tipo: args.tipo, cantidad, costoTotal };
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "ajustar_inventario",
          argumentos: args,
          resultado: result,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "ajustar_inventario",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // consultar_cartera
  server.registerTool(
    "consultar_cartera",
    {
      description:
        "Consulta saldos de cartera por cliente (CXC) o proveedor (CXP).",
      inputSchema: {
        tipo: z.enum(["cxc", "cxp"]).optional(),
        terceroId: z.string().optional(),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const tipo = args.tipo ?? "cxc";
        let data: any;
        if (tipo === "cxc") {
          if (args.terceroId) {
            const tercero = await db.tercero.findFirst({
              where: { id: args.terceroId, empresaId: ctx.empresaId },
              select: {
                id: true,
                nombre: true,
                saldoCartera: true,
                cupoCredito: true,
                facturasVenta: {
                  where: { estado: "vigente", saldoPendiente: { gt: 0 } },
                  select: {
                    numero: true,
                    total: true,
                    saldoPendiente: true,
                    fechaVencimiento: true,
                  },
                },
              },
            });
            data = tercero;
          } else {
            const terceros = await db.tercero.findMany({
              where: {
                empresaId: ctx.empresaId,
                saldoCartera: { gt: 0 },
              },
              select: {
                id: true,
                nombre: true,
                saldoCartera: true,
                cupoCredito: true,
              },
              orderBy: { saldoCartera: "desc" },
            });
            data = { total: terceros.length, terceros };
          }
        } else {
          // CXP: facturas de compra pendientes
          const facturas = await db.facturaCompra.findMany({
            where: {
              empresaId: ctx.empresaId,
              ...(args.terceroId ? { terceroId: args.terceroId } : {}),
            },
            select: {
              id: true,
              numero: true,
              total: true,
              fecha: true,
              tercero: { select: { id: true, nombre: true } },
            },
            orderBy: { fecha: "desc" },
          });
          data = { total: facturas.length, facturas };
        }
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "consultar_cartera",
          argumentos: args,
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "consultar_cartera",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // consultar_balance
  server.registerTool(
    "consultar_balance",
    {
      description: "Devuelve el balance de prueba completo (todas las cuentas).",
      inputSchema: {},
    },
    async () => {
      const start = Date.now();
      try {
        const data = await getBalance(ctx.empresaId);
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "consultar_balance",
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "consultar_balance",
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // consultar_kardex
  server.registerTool(
    "consultar_kardex",
    {
      description:
        "Devuelve el kardex (movimientos valorizados) de un producto en un rango de fechas.",
      inputSchema: {
        productoId: z.string(),
        bodegaId: z.string().optional(),
        fechaInicio: z.string().optional(),
        fechaFin: z.string().optional(),
      },
    },
    async (args) => {
      const start = Date.now();
      try {
        const data = await getKardex(
          ctx.empresaId,
          args.productoId,
          args.bodegaId,
          args.fechaInicio ? new Date(args.fechaInicio) : undefined,
          args.fechaFin ? new Date(args.fechaFin) : undefined,
        );
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "consultar_kardex",
          argumentos: args,
          resultado: data,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (e: any) {
        await logMcpCall({
          empresaId: ctx.empresaId,
          direccion: "inbound",
          tipo: "tool",
          nombre: "consultar_kardex",
          argumentos: args,
          duracionMs: Date.now() - start,
          userId: ctx.userId,
          error: e?.message ?? String(e),
        });
        return {
          content: [{ type: "text", text: `Error: ${e?.message ?? e}` }],
          isError: true,
        };
      }
    },
  );

  // ---------- Prompts ----------

  server.registerPrompt(
    "resumen_ejecutivo",
    {
      description:
        "Genera un resumen ejecutivo del estado del negocio: ventas del mes, cartera vencida y stock crítico.",
    },
    async () => {
      const text = `Eres un analista financiero del ERP Marsella.

Genera un **resumen ejecutivo** del estado del negocio usando los datos disponibles.

Pasos sugeridos:
1. Lee el resource \`marsella://dashboard\` para obtener KPIs consolidados (ventas mes, cartera vencida, aging, stock crítico, compras, egresos).
2. Lee el resource \`marsella://contabilidad/balance\` para obtener totales de balance (débitos, créditos, diferencia).
3. Genera un resumen estructurado en markdown con:
   - **Ventas del mes**: monto total, número de facturas, comparación con compras.
   - **Cartera**: total pendiente, total vencido, distribución por aging (30/60/90/+90 días), clientes más grandes.
   - **Stock crítico**: lista de productos bajo el mínimo, impacto operativo sugerido.
   - **Recomendaciones**: 3 acciones prioritarias para el siguiente cierre.

Usa cantidades en COP, formato es-CO. Sé concreto y accionable.`;
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "analisis_cartera",
    {
      description:
        "Analiza la cartera vencida por cliente y propone estrategia de cobro.",
    },
    async () => {
      const text = `Eres un analista de cartera del ERP Marsella.

Analiza la cartera vencida por cliente y propone una estrategia de cobro.

Pasos sugeridos:
1. Llama a la tool \`consultar_cartera\` con \`{ tipo: "cxc" }\` para obtener saldos por cliente.
2. Lee el resource \`marsella://dashboard\` para obtener el aging (30/60/90/+90 días).
3. Genera un análisis estructurado con:
   - **Top 5 deudores**: nombre, saldo, días de mora estimados, % del total.
   - **Segmentación**: alto riesgo (>90 días), medio (60-90), bajo (30-60).
   - **Estrategia de cobro por segmento**: acción recomendada (llamada, carta, pre-jurídico, negociación).
   - **Provisión sugerida**: % de castigo esperado por segmento.

Usa COP es-CO. Sé específico con montos y nombres.`;
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "cierre_contable",
    {
      description:
        "Genera el cierre contable del mes: lista asientos pendientes, verifica cuadre del balance, sugiere ajustes.",
    },
    async () => {
      const text = `Eres contador del ERP Marsella a cargo del cierre contable mensual.

Genera el cierre contable del mes.

Pasos sugeridos:
1. Lee el resource \`marsella://contabilidad/balance\` para obtener el balance de prueba actual.
2. Verifica cuadre: total débito vs total crédito. La diferencia debe ser 0.00.
3. Identifica cuentas con saldo anómalo (naturaleza contraria al saldo) o saldos muy grandes que requieren revisión.
4. Sugiere los **asientos de cierre** necesarios:
   - Gastos pagados por anticipado
   - Ingresos recibidos por anticipado
   - Depreciaciones del periodo
   - Provisiones (clientes, inventarios, impuestos)
   - Cierre de cuentas de resultado (P&G → utilidad)
5. Para cada asiento sugerido, muestra el JSON con \`descripcion\` y \`movimientos[]\` listo para enviar a la tool \`crear_asiento_contable\`.

Usa PUC colombiano. Códigos estándar: 5105 (gastos), 4105 (ingresos), 1592 (depreciación acumulada), 1305 (clientes), etc.`;
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      };
    },
  );

  return server;
}

// ---------- Catálogos estáticos (para server-info endpoint) ----------

export const MCP_RESOURCES_INFO = [
  { uri: "marsella://dashboard", name: "dashboard", description: "KPIs consolidados (ventas, cartera, stock crítico)", mimeType: "application/json" },
  { uri: "marsella://terceros", name: "terceros-lista", description: "Lista filtrada de terceros (?tipo=&q=)", mimeType: "application/json" },
  { uri: "marsella://terceros/{id}", name: "tercero-detalle", description: "Detalle de un tercero", mimeType: "application/json" },
  { uri: "marsella://productos", name: "productos-lista", description: "Lista filtrada de productos (?q=)", mimeType: "application/json" },
  { uri: "marsella://productos/{id}", name: "producto-detalle", description: "Detalle de producto con stock", mimeType: "application/json" },
  { uri: "marsella://facturas", name: "facturas-lista", description: "Lista de facturas (?estado=)", mimeType: "application/json" },
  { uri: "marsella://facturas/{id}", name: "factura-detalle", description: "Detalle de factura con CUFE y XML", mimeType: "application/json" },
  { uri: "marsella://contabilidad/balance", name: "balance-prueba", description: "Balance de prueba actual", mimeType: "application/json" },
  { uri: "marsella://contabilidad/cuenta/{codigo}", name: "mayor-cuenta", description: "Mayor de una cuenta por código PUC", mimeType: "application/json" },
  { uri: "marsella://inventario/kardex/{productoId}", name: "kardex-producto", description: "Kardex de un producto", mimeType: "application/json" },
];

export const MCP_TOOLS_INFO = [
  { name: "crear_tercero", description: "Crea un nuevo tercero", inputSchema: { tipo: "string", tipoDocumento: "string", numeroDocumento: "string", nombre: "string", telefono: "string?", email: "string?" } },
  { name: "crear_producto", description: "Crea un nuevo producto", inputSchema: { codigo: "string", nombre: "string", precio: "number", costo: "number", tarifaIva: "number" } },
  { name: "crear_factura", description: "Crea una factura de venta. Devuelve {numero, cufe, total}", inputSchema: { terceroId: "string", items: "array", formaPago: "string" } },
  { name: "registrar_pago", description: "Registra recibo de caja (CXC) o egreso (CXP)", inputSchema: { terceroId: "string", valor: "number", formaPago: "string", concepto: "string?", tipo: "string" } },
  { name: "crear_asiento_contable", description: "Crea un asiento contable manual", inputSchema: { descripcion: "string?", movimientos: "array" } },
  { name: "ajustar_inventario", description: "Registra movimiento de inventario", inputSchema: { productoId: "string", bodegaId: "string", tipo: "string", cantidad: "number", costoUnitario: "number" } },
  { name: "consultar_cartera", description: "Consulta saldos CXC/CXP", inputSchema: { tipo: "string?", terceroId: "string?" } },
  { name: "consultar_balance", description: "Devuelve el balance de prueba", inputSchema: {} },
  { name: "consultar_kardex", description: "Kardex de un producto", inputSchema: { productoId: "string", bodegaId: "string?", fechaInicio: "string?", fechaFin: "string?" } },
];

export const MCP_PROMPTS_INFO = [
  { name: "resumen_ejecutivo", description: "Genera un resumen ejecutivo del estado del negocio", arguments: [] },
  { name: "analisis_cartera", description: "Analiza la cartera vencida por cliente y propone estrategia de cobro", arguments: [] },
  { name: "cierre_contable", description: "Genera el cierre contable del mes", arguments: [] },
];
