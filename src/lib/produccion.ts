// ============================================================
// produccion.ts — Costos y Órdenes de Producción (Hermes §5.7)
// Funciones para transformación / manufactura:
//  - calcularCostoProduccion
//  - aplicarReceta (valida stock de materias primas)
//  - registrarSalidaMateriasPrimas
//  - registrarEntradaProductoTerminado
//  - generarAsientoProduccion (débito 150505 / créditos 150505, 2335, 7205)
// ============================================================

import { db } from "@/lib/db";
import { round } from "@/lib/currency";
import { registrarMovimientoInventario } from "@/lib/inventario";

// ---------- Tipos ----------

export interface OrdenProduccionInput {
  id: string;
  empresaId: string;
  numero: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  estado: string;
  productoResultanteId: string | null;
  cantidadProducir: number;
  cantidadProducida: number;
  costoMateriaPrima: number;
  costoManoObra: number;
  costoIndirectos: number;
  costoTotal: number;
  costoUnitario: number;
  comprobanteContableId: string | null;
  observaciones: string | null;
}

export interface RecetaConIngredientes {
  id: string;
  empresaId: string;
  productoId: string;
  nombre: string;
  descripcion: string | null;
  rendimiento: number;
  activa: boolean;
  ingredientes: RecetaIngredienteRow[];
}

export interface RecetaIngredienteRow {
  id: string;
  recetaId: string;
  empresaId: string;
  productoId: string | null;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

// ---------- 1. Cálculo de costos ----------

/**
 * Recalcula costoTotal = costoMateriaPrima + costoManoObra + costoIndirectos
 * y costoUnitario = costoTotal / cantidadProducida (si cantidadProducida > 0).
 * Devuelve los campos recalculados — no muta BD.
 */
export function calcularCostoProduccion(orden: {
  costoMateriaPrima: number;
  costoManoObra: number;
  costoIndirectos: number;
  cantidadProducida: number;
}) {
  const costoMateriaPrima = round(orden.costoMateriaPrima || 0, 2);
  const costoManoObra = round(orden.costoManoObra || 0, 2);
  const costoIndirectos = round(orden.costoIndirectos || 0, 2);
  const costoTotal = round(costoMateriaPrima + costoManoObra + costoIndirectos, 2);
  const cantidadProducida = Number(orden.cantidadProducida) || 0;
  const costoUnitario =
    cantidadProducida > 0 ? round(costoTotal / cantidadProducida, 2) : 0;
  return {
    costoMateriaPrima,
    costoManoObra,
    costoIndirectos,
    costoTotal,
    costoUnitario,
  };
}

// ---------- 2. Aplicar receta: valida stock ----------

export interface IngredienteAplicado {
  productoId: string | null;
  descripcion: string;
  cantidadRequerida: number;
  stockActual: number;
  costoUnitario: number;
  subtotal: number;
  disponible: boolean;
}

export interface ResultadoAplicarReceta {
  ingredientes: IngredienteAplicado[];
  totalCosto: number;
  todoDisponible: boolean;
}

/**
 * Para cada ingrediente de la receta:
 * - Calcula cantidadRequerida = ingrediente.cantidad * cantidadProducir
 * - Verifica stock en la bodega indicada (saldoInventario)
 * - Calcula subtotal = cantidadRequerida * costoUnitario
 * Retorna el detalle y el total de costo estimado.
 */
export async function aplicarReceta(
  receta: RecetaConIngredientes,
  cantidadProducir: number,
  bodegaId: string,
): Promise<ResultadoAplicarReceta> {
  const ingredientes: IngredienteAplicado[] = [];
  let totalCosto = 0;
  let todoDisponible = true;

  for (const ing of receta.ingredientes) {
    const cantidadRequerida = round(ing.cantidad * cantidadProducir, 4);
    let stockActual = 0;
    if (ing.productoId) {
      const saldo = await db.saldoInventario.findUnique({
        where: {
          productoId_bodegaId: {
            productoId: ing.productoId,
            bodegaId,
          },
        },
      });
      stockActual = saldo ? round(saldo.cantidad, 4) : 0;
    }
    const subtotal = round(cantidadRequerida * ing.costoUnitario, 2);
    const disponible = stockActual >= cantidadRequerida;
    if (!disponible) todoDisponible = false;
    ingredientes.push({
      productoId: ing.productoId,
      descripcion: ing.descripcion,
      cantidadRequerida,
      stockActual,
      costoUnitario: ing.costoUnitario,
      subtotal,
      disponible,
    });
    totalCosto = round(totalCosto + subtotal, 2);
  }

  return { ingredientes, totalCosto, todoDisponible };
}

// ---------- 3. Registrar salidas de materias primas ----------

/**
 * Para cada detalle de tipo "materia_prima" de la orden, registra movimiento
 * de inventario tipo "salida" en la bodega indicada. Idempotente: no hace
 * nada si la orden no está "en_proceso" o "finalizada".
 */
export async function registrarSalidaMateriasPrimas(
  ordenId: string,
  bodegaId: string,
): Promise<{ registrados: number; totalCosto: number }> {
  const orden = await db.ordenProduccion.findUnique({
    where: { id: ordenId },
    include: {
      detalles: {
        where: { tipo: "materia_prima" },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!orden) throw new Error("Orden de producción no encontrada");

  // Verificar bodega
  const bodega = await db.bodega.findFirst({
    where: { id: bodegaId, empresaId: orden.empresaId },
  });
  if (!bodega) throw new Error("Bodega no encontrada");

  // No registrar si ya se registraron salidas para esta orden+documento
  const prev = await db.movimientoInventario.findFirst({
    where: {
      empresaId: orden.empresaId,
      bodegaId,
      documentoTipo: "ORDEN_PRODUCCION",
      documentoId: orden.id,
      tipo: "salida",
    },
    select: { id: true },
  });
  if (prev) {
    // Ya se registraron salidas — idempotente
    return { registrados: 0, totalCosto: 0 };
  }

  let totalCosto = 0;
  let registrados = 0;
  for (const det of orden.detalles) {
    if (!det.productoId) continue;
    await registrarMovimientoInventario({
      empresaId: orden.empresaId,
      productoId: det.productoId,
      bodegaId,
      tipo: "salida",
      cantidad: det.cantidad,
      costoUnitario: det.costoUnitario,
      documentoTipo: "ORDEN_PRODUCCION",
      documentoId: orden.id,
    });
    totalCosto = round(totalCosto + det.subtotal, 2);
    registrados++;
  }
  return { registrados, totalCosto };
}

// ---------- 4. Registrar entrada de producto terminado ----------

/**
 * Registra movimiento de inventario tipo "entrada" para el
 * productoResultante, en la bodega indicada, con el costo unitario calculado.
 * Idempotente: si ya existe entrada para este documento, no la duplica.
 */
// Tipo helper: la transacción interactiva de Prisma tiene la misma
// "shape" que el client para los modelos que usamos aquí. Permitimos
// pasar opcionalmente una tx para que la entrada se ejecute dentro
// de la transacción del caller (A-CRIT-001).
type TxClient = typeof db;

export async function registrarEntradaProductoTerminado(
  ordenId: string,
  bodegaId: string,
  cantidadProducida: number,
  costoUnitario: number,
  tx?: TxClient,
): Promise<{ registrado: boolean; movimientoId: string | null }> {
  const client = tx ?? db;
  const orden = await client.ordenProduccion.findUnique({
    where: { id: ordenId },
  });
  if (!orden) throw new Error("Orden de producción no encontrada");
  if (!orden.productoResultanteId) {
    throw new Error(
      "La orden no tiene producto resultante configurado — no se puede registrar entrada",
    );
  }
  const bodega = await client.bodega.findFirst({
    where: { id: bodegaId, empresaId: orden.empresaId },
  });
  if (!bodega) throw new Error("Bodega no encontrada");

  // Idempotente
  const prev = await client.movimientoInventario.findFirst({
    where: {
      empresaId: orden.empresaId,
      bodegaId,
      productoId: orden.productoResultanteId,
      documentoTipo: "ORDEN_PRODUCCION_ENTRADA",
      documentoId: orden.id,
      tipo: "entrada",
    },
    select: { id: true },
  });
  if (prev) return { registrado: false, movimientoId: prev.id };

  // Si recibimos tx, registramos el movimiento directamente con esa
  // tx (no podemos reusar `registrarMovimientoInventario` que usa el
  // client global). En ese caso replicamos la lógica mínima de
  // entrada + recálculo de costo promedio.
  if (tx) {
    const cantidad = Math.abs(cantidadProducida);
    const costoTotal = round(cantidad * costoUnitario, 2);
    await tx.movimientoInventario.create({
      data: {
        empresaId: orden.empresaId,
        productoId: orden.productoResultanteId,
        bodegaId,
        tipo: "entrada",
        cantidad,
        costoUnitario,
        costoTotal,
        documentoTipo: "ORDEN_PRODUCCION_ENTRADA",
        documentoId: orden.id,
        fecha: new Date(),
      },
    });

    const saldo = await tx.saldoInventario.findUnique({
      where: {
        productoId_bodegaId: {
          productoId: orden.productoResultanteId,
          bodegaId,
        },
      },
    });
    if (saldo) {
      const prevCantidad = Number(saldo.cantidad);
      const prevCostoProm = Number(saldo.costoPromedio);
      const prevTotal = round(prevCantidad * prevCostoProm, 2);
      const entryTotal = round(cantidad * costoUnitario, 2);
      const nuevaCantidad = round(prevCantidad + cantidad, 4);
      const nuevoCostoPromedio =
        nuevaCantidad > 0
          ? round((prevTotal + entryTotal) / nuevaCantidad, 4)
          : 0;
      const nuevoCostoTotal = round(prevTotal + entryTotal, 2);
      await tx.saldoInventario.update({
        where: { id: saldo.id },
        data: {
          cantidad: nuevaCantidad,
          costoTotal: nuevoCostoTotal,
          costoPromedio: nuevoCostoPromedio,
        },
      });
      await tx.producto.update({
        where: { id: orden.productoResultanteId },
        data: {
          costoPromedio: nuevoCostoPromedio,
          ultimoCosto: costoUnitario,
        },
      });
    } else {
      await tx.saldoInventario.create({
        data: {
          empresaId: orden.empresaId,
          productoId: orden.productoResultanteId,
          bodegaId,
          cantidad,
          costoTotal,
          costoPromedio: costoUnitario,
        },
      });
      await tx.producto.update({
        where: { id: orden.productoResultanteId },
        data: {
          costoPromedio: costoUnitario,
          ultimoCosto: costoUnitario,
        },
      });
    }
    return { registrado: true, movimientoId: null };
  }

  const mov = await registrarMovimientoInventario({
    empresaId: orden.empresaId,
    productoId: orden.productoResultanteId,
    bodegaId,
    tipo: "entrada",
    cantidad: cantidadProducida,
    costoUnitario,
    documentoTipo: "ORDEN_PRODUCCION_ENTRADA",
    documentoId: orden.id,
  });
  return { registrado: true, movimientoId: mov.id };
}

// ---------- 5. Generar asiento contable de producción ----------

/**
 * Genera comprobante contable:
 *  - Débito a 150505 (Inventario producto terminado) por costoTotal
 *  - Crédito a 150505 (Inventario materia prima) por costoMateriaPrima
 *  - Crédito a 2335 (Mano de obra por pagar) por costoManoObra
 *  - Crédito a 7205 (Costos indirectos) por costoIndirectos
 * Vincula el comprobante a la orden via comprobanteContableId.
 * Si los créditos suman menos que el débito (por redondeo), ajusta con
 * pequeño débito a 7205 (diferencia en costos indirectos).
 */
export async function generarAsientoProduccion(
  ordenId: string,
  empresaId: string,
): Promise<{ comprobanteId: string; numero: string }> {
  const orden = await db.ordenProduccion.findFirst({
    where: { id: ordenId, empresaId },
  });
  if (!orden) throw new Error("Orden de producción no encontrada");

  if (orden.comprobanteContableId) {
    // Ya tiene comprobante — no regenera
    const prev = await db.comprobante.findUnique({
      where: { id: orden.comprobanteContableId },
      select: { id: true, numero: true },
    });
    if (prev) return { comprobanteId: prev.id, numero: prev.numero };
  }

  // Lookup de cuentas PUC por código
  const codigos = ["150505", "2335", "7205"];
  const cuentas = await db.cuentaPuc.findMany({
    where: { empresaId, codigo: { in: codigos } },
    select: { id: true, codigo: true, nombre: true, naturaleza: true },
  });
  const cmap = new Map(cuentas.map((c) => [c.codigo, c]));
  const cInvPT = cmap.get("150505");
  const cMOxPagar = cmap.get("2335");
  const cCIND = cmap.get("7205");
  const faltantes = codigos.filter((c) => !cmap.has(c));
  if (faltantes.length) {
    throw new Error(
      `No se encontraron las cuentas PUC con códigos: ${faltantes.join(", ")}. ` +
        `Cree las cuentas en Contabilidad → Plan de Cuentas antes de finalizar la orden.`,
    );
  }

  const costoMateriaPrima = round(orden.costoMateriaPrima || 0, 2);
  const costoManoObra = round(orden.costoManoObra || 0, 2);
  const costoIndirectos = round(orden.costoIndirectos || 0, 2);
  const costoTotal = round(orden.costoTotal || 0, 2);

  // Ajuste de diferencia por redondeo sobre costos indirectos (crédito)
  const totalCredito = round(
    costoMateriaPrima + costoManoObra + costoIndirectos,
    2,
  );
  const diferencia = round(costoTotal - totalCredito, 2);
  const costoIndirectosAjustado = round(costoIndirectos + diferencia, 2);

  const totalDebito = costoTotal;
  const totalCreditoFinal = round(
    costoMateriaPrima + costoManoObra + costoIndirectosAjustado,
    2,
  );

  // Generar número CP-2026-NNNNNN (Comprobante de Producción)
  const year = new Date().getFullYear();
  const cnt = await db.comprobante.count({ where: { empresaId } });
  const numero = `CP-${year}-${String(cnt + 1).padStart(6, "0")}`;
  const fecha = orden.fechaFin ?? new Date();

  const comprobante = await db.comprobante.create({
    data: {
      empresaId,
      numero,
      tipo: "produccion",
      fecha,
      descripcion: `Asiento de producción — Orden ${orden.numero}`,
      totalDebito,
      totalCredito: totalCreditoFinal,
      diferencia: 0,
      estado: "contabilizado",
      documentoOrigenId: orden.id,
      documentoOrigenTipo: "ORDEN_PRODUCCION",
    },
  });

  // Movimientos
  // 1. Débito Inventario producto terminado (150505) — costoTotal
  await db.movimientoContable.create({
    data: {
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cInvPT!.id,
      descripcion: `Entrada producto terminado — Orden ${orden.numero}`,
      debito: totalDebito,
      credito: 0,
      fecha,
    },
  });

  // 2. Crédito Inventario materia prima (150505) — costoMateriaPrima
  if (costoMateriaPrima > 0) {
    await db.movimientoContable.create({
      data: {
        empresaId,
        comprobanteId: comprobante.id,
        cuentaId: cInvPT!.id,
        descripcion: `Salida materias primas — Orden ${orden.numero}`,
        debito: 0,
        credito: costoMateriaPrima,
        fecha,
      },
    });
  }

  // 3. Crédito Mano de obra por pagar (2335) — costoManoObra
  if (costoManoObra > 0) {
    await db.movimientoContable.create({
      data: {
        empresaId,
        comprobanteId: comprobante.id,
        cuentaId: cMOxPagar!.id,
        descripcion: `Mano de obra por pagar — Orden ${orden.numero}`,
        debito: 0,
        credito: costoManoObra,
        fecha,
      },
    });
  }

  // 4. Crédito Costos indirectos (7205) — costoIndirectosAjustado
  if (costoIndirectosAjustado > 0) {
    await db.movimientoContable.create({
      data: {
        empresaId,
        comprobanteId: comprobante.id,
        cuentaId: cCIND!.id,
        descripcion: `Costos indirectos — Orden ${orden.numero}`,
        debito: 0,
        credito: costoIndirectosAjustado,
        fecha,
      },
    });
  }

  // Vincular comprobante a la orden
  await db.ordenProduccion.update({
    where: { id: orden.id },
    data: { comprobanteContableId: comprobante.id },
  });

  return { comprobanteId: comprobante.id, numero };
}

// ---------- 6. Reversar salidas (anulación) ----------

/**
 * Si la orden está "en_proceso" y se anula, reversa las salidas de materia
 * prima registradas (registra un movimiento tipo "entrada" por cada salida).
 */
export async function reversarSalidasMateriasPrimas(
  ordenId: string,
  bodegaId: string,
): Promise<{ reversados: number; totalCosto: number }> {
  const orden = await db.ordenProduccion.findUnique({
    where: { id: ordenId },
    include: {
      detalles: {
        where: { tipo: "materia_prima" },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!orden) throw new Error("Orden de producción no encontrada");

  // Verificar que existieron salidas
  const salidasPrevias = await db.movimientoInventario.findFirst({
    where: {
      empresaId: orden.empresaId,
      bodegaId,
      documentoTipo: "ORDEN_PRODUCCION",
      documentoId: orden.id,
      tipo: "salida",
    },
    select: { id: true },
  });
  if (!salidasPrevias) {
    return { reversados: 0, totalCosto: 0 };
  }

  // Verificar que no existan ya reversiones (idempotente)
  const revPrevia = await db.movimientoInventario.findFirst({
    where: {
      empresaId: orden.empresaId,
      bodegaId,
      documentoTipo: "ORDEN_PRODUCCION_REVERSO",
      documentoId: orden.id,
      tipo: "entrada",
    },
    select: { id: true },
  });
  if (revPrevia) {
    return { reversados: 0, totalCosto: 0 };
  }

  let totalCosto = 0;
  let reversados = 0;
  for (const det of orden.detalles) {
    if (!det.productoId) continue;
    await registrarMovimientoInventario({
      empresaId: orden.empresaId,
      productoId: det.productoId,
      bodegaId,
      tipo: "entrada",
      cantidad: det.cantidad,
      costoUnitario: det.costoUnitario,
      documentoTipo: "ORDEN_PRODUCCION_REVERSO",
      documentoId: orden.id,
    });
    totalCosto = round(totalCosto + det.subtotal, 2);
    reversados++;
  }
  return { reversados, totalCosto };
}
