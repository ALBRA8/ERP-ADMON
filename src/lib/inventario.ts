// ============================================================
// inventario.ts — Helpers de inventario (kardex, costo promedio)
// ============================================================
import { db } from "@/lib/db";
import { round } from "@/lib/currency";

export interface MovimientoInvInput {
  empresaId: string;
  productoId: string;
  bodegaId: string;
  tipo: "entrada" | "salida" | "traslado" | "ajuste";
  cantidad: number; // positivo: entrada (+), negativo: salida (-). El signo lo resuelve el caller o lo forzamos por tipo.
  costoUnitario: number;
  documentoTipo?: string;
  documentoId?: string;
  loteId?: string;
  fecha?: Date;
}

// Recalcula saldo + costo promedio (PEPS promedio ponderado) y deja el kardex
export async function registrarMovimientoInventario(input: MovimientoInvInput) {
  const cantidad =
    input.tipo === "salida" ? -Math.abs(input.cantidad) : Math.abs(input.cantidad);

  const fecha = input.fecha ?? new Date();
  const costoTotal = round(cantidad * input.costoUnitario, 2);

  // 1. Crear movimiento kardex
  const movimiento = await db.movimientoInventario.create({
    data: {
      empresaId: input.empresaId,
      productoId: input.productoId,
      bodegaId: input.bodegaId,
      tipo: input.tipo,
      cantidad,
      costoUnitario: input.costoUnitario,
      costoTotal,
      documentoTipo: input.documentoTipo,
      documentoId: input.documentoId,
      loteId: input.loteId,
      fecha,
    },
  });

  // 2. Recalcular saldo
  const saldo = await db.saldoInventario.findUnique({
    where: {
      productoId_bodegaId: {
        productoId: input.productoId,
        bodegaId: input.bodegaId,
      },
    },
  });

  if (saldo) {
    const nuevaCantidad = round(saldo.cantidad + cantidad, 4);
    let nuevoCostoPromedio = saldo.costoPromedio;
    let nuevoCostoTotal = round(saldo.costoTotal + costoTotal, 2);

    if (cantidad > 0) {
      // Entrada: recalcular promedio ponderado
      const prevTotal = round(saldo.cantidad * saldo.costoPromedio, 2);
      const entryTotal = round(cantidad * input.costoUnitario, 2);
      if (nuevaCantidad > 0) {
        nuevoCostoPromedio = round(
          (prevTotal + entryTotal) / nuevaCantidad,
          4,
        );
        nuevoCostoTotal = round(prevTotal + entryTotal, 2);
      } else {
        nuevoCostoPromedio = 0;
        nuevoCostoTotal = 0;
      }
    } else {
      // Salida: mantener costo promedio actual, reducir total
      nuevoCostoTotal = round(nuevaCantidad * saldo.costoPromedio, 2);
    }

    await db.saldoInventario.update({
      where: { id: saldo.id },
      data: {
        cantidad: nuevaCantidad,
        costoTotal: Math.max(0, nuevoCostoTotal),
        costoPromedio: nuevaCantidad > 0 ? nuevoCostoPromedio : 0,
      },
    });

    // Actualizar producto: snapshot de costo promedio
    if (cantidad > 0) {
      await db.producto.update({
        where: { id: input.productoId },
        data: {
          costoPromedio: nuevoCostoPromedio,
          ultimoCosto: input.costoUnitario,
        },
      });
    }
  } else {
    // No existe saldo: crear (solo para entradas)
    if (cantidad > 0) {
      await db.saldoInventario.create({
        data: {
          empresaId: input.empresaId,
          productoId: input.productoId,
          bodegaId: input.bodegaId,
          cantidad,
          costoTotal,
          costoPromedio: input.costoUnitario,
        },
      });
      await db.producto.update({
        where: { id: input.productoId },
        data: {
          costoPromedio: input.costoUnitario,
          ultimoCosto: input.costoUnitario,
        },
      });
    }
  }

  return movimiento;
}

// Consulta Kardex valorizado para un producto en un rango
export async function getKardex(
  empresaId: string,
  productoId: string,
  bodegaId?: string,
  fechaInicio?: Date,
  fechaFin?: Date,
) {
  const where: any = {
    empresaId,
    productoId,
  };
  if (bodegaId) where.bodegaId = bodegaId;
  if (fechaInicio || fechaFin) {
    where.fecha = {};
    if (fechaInicio) where.fecha.gte = fechaInicio;
    if (fechaFin) where.fecha.lte = fechaFin;
  }
  const movs = await db.movimientoInventario.findMany({
    where,
    orderBy: { fecha: "asc" },
  });

  // Calcular saldo acumulado
  let saldo = 0;
  let costoAcumulado = 0;
  return movs.map((m) => {
    saldo = round(saldo + m.cantidad, 4);
    costoAcumulado = round(costoAcumulado + m.costoTotal, 2);
    return {
      ...m,
      saldoCantidad: saldo,
      saldoValor: costoAcumulado,
    };
  });
}
