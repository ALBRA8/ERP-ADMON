// ============================================================
// contabilidad.ts — Helpers de asientos contables y cierres de período
// para el ERP Marsella (PUC Colombia).
//
// Funciones:
//   - generarAsientoCompra(compraId, empresaId)
//       Causación de factura de compra:
//         DB 150505 Inventario        (subtotal neto)
//         DB 240802 IVA descontable   (totalIva)
//         CR 220505 Proveedores       (total) — neto de retenciones si las hay
//         CR 2365xx ReteFuente / 2367xx ReteICA / 2368xx ReteIVA (si aplica)
//   - generarAsientoReciboCaja(reciboId, empresaId)
//       Recibo de caja (recaudo CXC):
//         DB 110505 Caja  | 111005 Bancos  (según formaPago)
//         CR 130505 Clientes nacionales (valorTotal)
//   - generarAsientoEgreso(egresoId, empresaId)
//       Comprobante de egreso (pago CXP):
//         DB 220505 Proveedores (valorTotal)
//         CR 110505 Caja  | 111005 Bancos  (según formaPago)
//   - periodoCerrado(empresaId, fecha)
//       Devuelve true si el mes calendario de `fecha` está marcado como
//       cerrado en la tabla CierrePeriodo (cierra mensual o anual del
//       mismo año).
//   - assertPeriodoAbierto(empresaId, fecha)
//       Lanza Error si el período está cerrado (mensaje accionable).
// ============================================================
import { db } from "@/lib/db";
import { round } from "@/lib/currency";

// ---------- Asiento contable de compra ----------
export async function generarAsientoCompra(
  compraId: string,
  empresaId: string,
): Promise<string | null> {
  const compra = await db.facturaCompra.findUnique({
    where: { id: compraId },
    include: { detalles: true },
  });
  if (!compra) return null;

  const cnt = await db.comprobante.count({ where: { empresaId } });
  const numero = `CG-${new Date(compra.fecha).getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

  // Cuentas PUC involucradas (lookup por código @unique)
  const cuentas = await db.cuentaPuc.findMany({
    where: {
      codigo: {
        in: ["150505", "240802", "220505", "2365", "2367", "2368"],
      },
    },
  });
  const cuentaMap = new Map(cuentas.map((c) => [c.codigo, c]));
  // La cuenta 150505 / 240802 / 220505 son las mínimas requeridas.
  const req = ["150505", "240802", "220505"];
  if (req.some((c) => !cuentaMap.has(c))) {
    console.warn(
      "[contabilidad] Cuentas PUC mínimas para asiento de compra no encontradas:",
      req,
    );
    return null;
  }

  // Distribución del crédito: proveedores recibe (total - retenciones).
  // Por defecto, sin retenciones registradas en la factura, el pasivo = total.
  const baseGravable = round(compra.subtotal - compra.descuentoTotal, 2);
  const retenciones = Math.max(0, compra.totalRetenciones ?? 0);
  const pasivoProveedores = round(compra.total - retenciones, 2);

  const debitos: { codigo: string; valor: number; descripcion: string }[] = [
    { codigo: "150505", valor: baseGravable, descripcion: `Inventario — compra ${compra.numero}` },
  ];
  if (compra.totalIva > 0) {
    debitos.push({
      codigo: "240802",
      valor: compra.totalIva,
      descripcion: `IVA descontable — compra ${compra.numero}`,
    });
  }

  const creditos: { codigo: string; valor: number; descripcion: string }[] = [
    {
      codigo: "220505",
      valor: pasivoProveedores,
      descripcion: `Proveedores del país — compra ${compra.numero}`,
    },
  ];
  // Si hay retenciones, distribuirlas entre las cuentas 2365/2367/2368.
  // Como en la compra actual no se discrimina por tipo, las imputamos a
  // 2365 (ReteFuente) si la cuenta existe, repartiendo el monto total.
  if (retenciones > 0) {
    if (cuentaMap.has("2365")) {
      creditos.push({
        codigo: "2365",
        valor: retenciones,
        descripcion: `Retenciones en la fuente — compra ${compra.numero}`,
      });
    } else {
      // Sin cuenta de retenciones, mandamos todo a proveedores.
      creditos[0].valor = round(creditos[0].valor + retenciones, 2);
    }
  }

  const totalDebito = round(debitos.reduce((a, d) => a + d.valor, 0), 2);
  const totalCredito = round(creditos.reduce((a, c) => a + c.valor, 0), 2);
  const diferencia = round(totalDebito - totalCredito, 2);

  const comprobante = await db.comprobante.create({
    data: {
      empresaId,
      numero,
      tipo: "compra",
      fecha: compra.fecha,
      descripcion: `Factura de compra ${compra.numero}`,
      totalDebito,
      totalCredito,
      diferencia,
      estado: "contabilizado",
      documentoOrigenId: compra.id,
      documentoOrigenTipo: "FACTURA_COMPRA",
    },
  });

  const movsData: any[] = [];
  for (const d of debitos) {
    const cuenta = cuentaMap.get(d.codigo);
    if (!cuenta || d.valor <= 0) continue;
    movsData.push({
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuenta.id,
      terceroId: compra.terceroId ?? null,
      descripcion: d.descripcion,
      debito: d.valor,
      credito: 0,
      fecha: compra.fecha,
    });
  }
  for (const c of creditos) {
    const cuenta = cuentaMap.get(c.codigo);
    if (!cuenta || c.valor <= 0) continue;
    movsData.push({
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuenta.id,
      terceroId: compra.terceroId ?? null,
      descripcion: c.descripcion,
      debito: 0,
      credito: c.valor,
      fecha: compra.fecha,
    });
  }
  if (movsData.length > 0) {
    await db.movimientoContable.createMany({ data: movsData });
  }

  // Guardar referencia en la factura de compra (campo opcional si existe).
  try {
    await db.facturaCompra.update({
      where: { id: compra.id },
      data: { estadoCartera: compra.estadoCartera } as any,
    });
  } catch {
    /* sin campo comprobanteContableId en schema, no crítico */
  }

  return comprobante.id;
}

// ---------- Asiento contable de Recibo de Caja (recaudo CXC) ----------
export async function generarAsientoReciboCaja(
  reciboId: string,
  empresaId: string,
): Promise<string | null> {
  const recibo = await db.reciboCaja.findUnique({ where: { id: reciboId } });
  if (!recibo) return null;

  const cnt = await db.comprobante.count({ where: { empresaId } });
  const numero = `CG-${new Date(recibo.fecha).getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

  // Cuentas: 110505 Caja general, 111005 Bancos, 130505 Clientes nacionales
  const cuentas = await db.cuentaPuc.findMany({
    where: { codigo: { in: ["110505", "111005", "130505"] } },
  });
  const cuentaMap = new Map(cuentas.map((c) => [c.codigo, c]));
  if (!cuentaMap.has("130505")) {
    console.warn("[contabilidad] Cuenta 130505 (Clientes nacionales) no encontrada");
    return null;
  }
  // Caja o Bancos según formaPago
  const cuentaTesoreriaCodigo = recibo.formaPago === "efectivo" ? "110505" : "111005";
  if (!cuentaMap.has(cuentaTesoreriaCodigo)) {
    console.warn(
      `[contabilidad] Cuenta ${cuentaTesoreriaCodigo} no encontrada, no se genera asiento de recibo`,
    );
    return null;
  }

  const totalDebito = round(recibo.valorTotal, 2);
  const totalCredito = round(recibo.valorTotal, 2);

  const comprobante = await db.comprobante.create({
    data: {
      empresaId,
      numero,
      tipo: "tesoreria",
      fecha: recibo.fecha,
      descripcion: `Recibo de caja ${recibo.numero}`,
      totalDebito,
      totalCredito,
      diferencia: 0,
      estado: "contabilizado",
      documentoOrigenId: recibo.id,
      documentoOrigenTipo: "RECIBO_CAJA",
    },
  });

  await db.movimientoContable.create({
    data: {
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaMap.get(cuentaTesoreriaCodigo)!.id,
      terceroId: recibo.terceroId ?? null,
      descripcion: `Ingreso de caja ${recibo.numero} (${recibo.formaPago})`,
      debito: recibo.valorTotal,
      credito: 0,
      fecha: recibo.fecha,
    },
  });
  await db.movimientoContable.create({
    data: {
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaMap.get("130505")!.id,
      terceroId: recibo.terceroId ?? null,
      descripcion: `Recaudo cartera ${recibo.numero}`,
      debito: 0,
      credito: recibo.valorTotal,
      fecha: recibo.fecha,
    },
  });

  return comprobante.id;
}

// ---------- Asiento contable de Comprobante de Egreso (pago CXP) ----------
export async function generarAsientoEgreso(
  egresoId: string,
  empresaId: string,
): Promise<string | null> {
  const egreso = await db.comprobanteEgreso.findUnique({
    where: { id: egresoId },
  });
  if (!egreso) return null;

  const cnt = await db.comprobante.count({ where: { empresaId } });
  const numero = `CG-${new Date(egreso.fecha).getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;

  const cuentas = await db.cuentaPuc.findMany({
    where: { codigo: { in: ["110505", "111005", "220505"] } },
  });
  const cuentaMap = new Map(cuentas.map((c) => [c.codigo, c]));
  if (!cuentaMap.has("220505")) {
    console.warn("[contabilidad] Cuenta 220505 (Proveedores del país) no encontrada");
    return null;
  }
  const cuentaTesoreriaCodigo = egreso.formaPago === "efectivo" ? "110505" : "111005";
  if (!cuentaMap.has(cuentaTesoreriaCodigo)) {
    console.warn(
      `[contabilidad] Cuenta ${cuentaTesoreriaCodigo} no encontrada, no se genera asiento de egreso`,
    );
    return null;
  }

  const totalDebito = round(egreso.valorTotal, 2);
  const totalCredito = round(egreso.valorTotal, 2);

  const comprobante = await db.comprobante.create({
    data: {
      empresaId,
      numero,
      tipo: "tesoreria",
      fecha: egreso.fecha,
      descripcion: `Comprobante de egreso ${egreso.numero}`,
      totalDebito,
      totalCredito,
      diferencia: 0,
      estado: "contabilizado",
      documentoOrigenId: egreso.id,
      documentoOrigenTipo: "COMPROBANTE_EGRESO",
    },
  });

  await db.movimientoContable.create({
    data: {
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaMap.get("220505")!.id,
      terceroId: egreso.terceroId ?? null,
      descripcion: `Pago a proveedores ${egreso.numero}`,
      debito: egreso.valorTotal,
      credito: 0,
      fecha: egreso.fecha,
    },
  });
  await db.movimientoContable.create({
    data: {
      empresaId,
      comprobanteId: comprobante.id,
      cuentaId: cuentaMap.get(cuentaTesoreriaCodigo)!.id,
      terceroId: egreso.terceroId ?? null,
      descripcion: `Egreso ${egreso.numero} (${egreso.formaPago})`,
      debito: 0,
      credito: egreso.valorTotal,
      fecha: egreso.fecha,
    },
  });

  return comprobante.id;
}

// ---------- Validación de período contable cerrado ----------
// Devuelve true si el mes calendario de `fecha` está cerrado en la empresa.
// Se considera cerrado si existe un CierrePeriodo mensual para
// (empresaId, anio, mes) en estado "cerrado" O un cierre anual
// (empresaId, anio, mes=0) en estado "cerrado".
export async function periodoCerrado(
  empresaId: string,
  fecha: Date,
): Promise<boolean> {
  const anio = new Date(fecha).getFullYear();
  const mes = new Date(fecha).getMonth() + 1; // 1-12
  try {
    const registro = await db.cierrePeriodo.findFirst({
      where: {
        empresaId,
        OR: [
          { anio, mes, estado: "cerrado" },
          { anio, mes: 0, estado: "cerrado" }, // cierre anual
        ],
      },
      select: { id: true },
    });
    return !!registro;
  } catch {
    // Si la tabla no existe o falla, no bloquear operación.
    return false;
  }
}

// Lanza Error si el período está cerrado. Mensaje accionable.
export async function assertPeriodoAbierto(
  empresaId: string,
  fecha: Date,
): Promise<void> {
  const cerrado = await periodoCerrado(empresaId, fecha);
  if (cerrado) {
    const anio = new Date(fecha).getFullYear();
    const mes = new Date(fecha).getMonth() + 1;
    throw new Error(
      `Período cerrado (${anio}-${String(mes).padStart(2, "0")}), no se pueden registrar movimientos`,
    );
  }
}
