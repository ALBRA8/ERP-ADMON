import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";

// ============================================================
// ERP Marsella — Movimientos bancarios
// GET  /api/movimientos-bancarios
//      ?cuentaBancariaId&conciliado&fechaInicio&fechaFin&tipo&page&pageSize
// POST /api/movimientos-bancarios   Crea + ajusta saldoCuenta + asiento
//      Body: { cuentaBancariaId, tipo, monto, descripcion, terceroId?, fecha? }
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const cuentaBancariaId = getQuery(req, "cuentaBancariaId");
    const conciliado = getQuery(req, "conciliado");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");
    const tipo = getQuery(req, "tipo");
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

    const where: any = { empresaId: session.empresaId };
    if (cuentaBancariaId) where.cuentaBancariaId = cuentaBancariaId;
    if (tipo) where.tipo = tipo;
    if (conciliado === "true" || conciliado === "false") {
      where.conciliado = conciliado === "true";
    }
    if (fechaInicio || fechaFin) {
      where.fecha = {};
      if (fechaInicio) where.fecha.gte = new Date(fechaInicio);
      if (fechaFin) where.fecha.lte = new Date(fechaFin);
    }

    const [items, total] = await Promise.all([
      db.movimientoBancario.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { cuentaBancaria: { include: { banco: true } } },
      }),
      db.movimientoBancario.count({ where }),
    ]);
    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar movimientos bancarios", e);
  }
}

const movSchema = z.object({
  cuentaBancariaId: z.string().min(1),
  tipo: z.enum([
    "deposito",
    "retiro",
    "transferencia",
    "cheque",
    "nota",
    "interes",
    "comision",
  ]),
  monto: z.number().positive(),
  descripcion: z.string().optional(),
  terceroId: z.string().nullish(),
  fecha: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = movSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const cuenta = await db.cuentaBancaria.findFirst({
      where: { id: d.cuentaBancariaId, empresaId: session.empresaId },
    });
    if (!cuenta) return notFound("Cuenta bancaria no encontrada");

    const fecha = d.fecha ? new Date(d.fecha) : new Date();
    // monto positivo: entrada (depósito) o salida (retiro)
    const montoRounded = round(d.monto, 2);
    const esEntrada = ["deposito", "interes", "transferencia"].includes(
      d.tipo,
    );
    const montoConSigno = esEntrada ? montoRounded : -montoRounded;

    // Ajusta saldo de la cuenta
    const nuevoSaldo = round(Number(cuenta.saldoActual) + montoConSigno, 2);
    await db.cuentaBancaria.update({
      where: { id: cuenta.id },
      data: { saldoActual: nuevoSaldo },
    });

    // Genera comprobante contable automático:
    // depósito/interes/transferencia(entrada): débito 1110 (Bancos) / crédito 1105 (Caja)
    // retiro/cheque/comision(nota débito): reverso — débito 1105 / crédito 1110
    let comprobanteId: string | null = null;
    const cuentaBancos = await db.cuentaPuc.findUnique({
      where: { codigo: "1110" },
    });
    const cuentaCaja = await db.cuentaPuc.findUnique({
      where: { codigo: "1105" },
    });
    if (cuentaBancos && cuentaCaja) {
      const year = new Date().getFullYear();
      const cnt = await db.comprobante.count({
        where: { empresaId: session.empresaId },
      });
      const numeroCG = `CG-${year}-${String(cnt + 1).padStart(6, "0")}`;
      const descripcionComp = `${d.tipo.toUpperCase()} ${
        cuenta.numeroCuenta
      } — ${d.descripcion ?? ""}`.trim();
      const comprobante = await db.comprobante.create({
        data: {
          empresaId: session.empresaId,
          numero: numeroCG,
          tipo: "tesoreria",
          fecha,
          descripcion: descripcionComp,
          totalDebito: montoRounded,
          totalCredito: montoRounded,
          diferencia: 0,
          estado: "contabilizado",
          documentoOrigenTipo: "MOVIMIENTO_BANCARIO",
        },
      });
      comprobanteId = comprobante.id;
      // asiento
      if (esEntrada) {
        await db.movimientoContable.create({
          data: {
            empresaId: session.empresaId,
            comprobanteId: comprobante.id,
            cuentaId: cuentaBancos.id,
            terceroId: d.terceroId,
            descripcion: descripcionComp,
            debito: montoRounded,
            credito: 0,
            fecha,
          },
        });
        await db.movimientoContable.create({
          data: {
            empresaId: session.empresaId,
            comprobanteId: comprobante.id,
            cuentaId: cuentaCaja.id,
            terceroId: d.terceroId,
            descripcion: descripcionComp,
            debito: 0,
            credito: montoRounded,
            fecha,
          },
        });
      } else {
        await db.movimientoContable.create({
          data: {
            empresaId: session.empresaId,
            comprobanteId: comprobante.id,
            cuentaId: cuentaCaja.id,
            terceroId: d.terceroId,
            descripcion: descripcionComp,
            debito: montoRounded,
            credito: 0,
            fecha,
          },
        });
        await db.movimientoContable.create({
          data: {
            empresaId: session.empresaId,
            comprobanteId: comprobante.id,
            cuentaId: cuentaBancos.id,
            terceroId: d.terceroId,
            descripcion: descripcionComp,
            debito: 0,
            credito: montoRounded,
            fecha,
          },
        });
      }
    }

    const movimiento = await db.movimientoBancario.create({
      data: {
        empresaId: session.empresaId,
        cuentaBancariaId: cuenta.id,
        fecha,
        tipo: d.tipo,
        monto: montoConSigno,
        descripcion: d.descripcion ?? null,
        terceroId: d.terceroId ?? null,
        comprobanteId,
        conciliado: false,
      },
      include: { cuentaBancaria: { include: { banco: true } } },
    });
    return ok({
      ...movimiento,
      saldoCuenta: nuevoSaldo,
      comprobanteId,
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Conflicto de unicidad al crear movimiento");
    }
    return serverError("Error al crear movimiento bancario", e);
  }
}
