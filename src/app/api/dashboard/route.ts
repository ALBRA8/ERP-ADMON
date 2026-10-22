import { db } from "@/lib/db";
import { ok, serverError } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return ok({ authenticated: false });
    }
    const empresa = await db.empresa.findUnique({
      where: { id: session.empresaId },
      select: {
        id: true,
        nit: true,
        razonSocial: true,
        nombreComercial: true,
        ciudad: true,
        moneda: true,
        decimales: true,
        direccion: true,
        telefono: true,
        email: true,
        representanteLegal: true,
        regimenTributario: true,
        responsabilidad: true,
      },
    });

    // KPIs: ventas mes, cartera vencida, stock crítico, utilidad
    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const inicioMesPasado = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const facturasMes = await db.facturaVenta.findMany({
      where: {
        empresaId: session.empresaId,
        fecha: { gte: inicioMes },
        estado: "vigente",
      },
      select: { total: true, subtotalNeto: true, totalIva: true },
    });
    const facturasMesPasado = await db.facturaVenta.findMany({
      where: {
        empresaId: session.empresaId,
        fecha: { gte: inicioMesPasado, lt: inicioMes },
        estado: "vigente",
      },
      select: { total: true },
    });

    const ventasMes = facturasMes.reduce((a, f) => a + Number(f.total), 0);
    const ventasMesPasado = facturasMesPasado.reduce((a, f) => a + Number(f.total), 0);
    const numFacturasMes = facturasMes.length;

    // Cartera pendiente
    const cartera = await db.facturaVenta.findMany({
      where: {
        empresaId: session.empresaId,
        estado: "vigente",
        saldoPendiente: { gt: 0 },
      },
      select: {
        saldoPendiente: true,
        fechaVencimiento: true,
      },
    });
    const carteraTotal = cartera.reduce((a, c) => a + Number(c.saldoPendiente), 0);

    const hoy = new Date();
    let carteraVencida = 0;
    let cartera30 = 0;
    let cartera60 = 0;
    let cartera90 = 0;
    let carteraMas90 = 0;
    for (const c of cartera) {
      if (!c.fechaVencimiento) continue;
      const dias = Math.floor(
        (hoy.getTime() - c.fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (dias <= 0) continue; // no vencida
      const saldo = Number(c.saldoPendiente);
      if (dias <= 30) cartera30 += saldo;
      else if (dias <= 60) cartera60 += saldo;
      else if (dias <= 90) cartera90 += saldo;
      else carteraMas90 += saldo;
      carteraVencida += saldo;
    }

    // Stock crítico: productos con saldo < stockMinimo
    const stockCritico = await db.producto.findMany({
      where: { empresaId: session.empresaId, activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        stockMinimo: true,
        saldosInventario: { select: { cantidad: true } },
      },
    });
    const productosCriticos = stockCritico
      .map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        stockTotal: p.saldosInventario.reduce((a, s) => a + Number(s.cantidad), 0),
        stockMinimo: Number(p.stockMinimo),
      }))
      .filter((p) => p.stockTotal <= p.stockMinimo);

    // Compras mes
    const comprasMes = await db.facturaCompra.aggregate({
      where: {
        empresaId: session.empresaId,
        fecha: { gte: inicioMes },
        estado: "vigente",
      },
      _sum: { total: true },
    });

    // Productos totales y terceros totales
    const totalProductos = await db.producto.count({
      where: { empresaId: session.empresaId, activo: true },
    });
    const totalClientes = await db.tercero.count({
      where: { empresaId: session.empresaId, tipo: "cliente", activo: true },
    });
    const totalProveedores = await db.tercero.count({
      where: { empresaId: session.empresaId, tipo: "proveedor", activo: true },
    });

    // Movimientos contables: total débitos del mes
    const contaMovs = await db.movimientoContable.aggregate({
      where: {
        empresaId: session.empresaId,
        fecha: { gte: inicioMes },
        comprobante: { estado: "contabilizado" },
      },
      _sum: { debito: true, credito: true },
    });

    return ok({
      authenticated: true,
      usuario: {
        id: session.userId,
        email: session.email,
        nombre: session.nombre,
        rol: session.rol,
      },
      empresa,
      kpis: {
        ventasMes,
        ventasMesPasado,
        numFacturasMes,
        carteraTotal,
        carteraVencida,
        cartera30,
        cartera60,
        cartera90,
        carteraMas90,
        productosCriticosCount: productosCriticos.length,
        comprasMes: Number(comprasMes._sum.total ?? 0),
        totalProductos,
        totalClientes,
        totalProveedores,
        totalDebitosMes: Number(contaMovs._sum.debito ?? 0),
        totalCreditosMes: Number(contaMovs._sum.credito ?? 0),
      },
      stockCritico: productosCriticos.slice(0, 10),
    });
  } catch (e) {
    return serverError("Error al cargar dashboard", e);
  }
}
