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
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";

// ============================================================
// ERP Marsella — Cuentas bancarias
// GET  /api/cuentas-bancarias                Lista (con ?include=movimientos)
// POST /api/cuentas-bancarias                Crea
// PUT  /api/cuentas-bancarias                Actualiza
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const include = getQuery(req, "include");
    const bancoId = getQuery(req, "bancoId");
    const where: any = { empresaId: session.empresaId };
    if (bancoId) where.bancoId = bancoId;
    const cuentas = await db.cuentaBancaria.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        banco: true,
        ...(include === "movimientos"
          ? {
              movimientoBancarios: {
                orderBy: { fecha: "desc" },
                take: 20,
              },
            }
          : {}),
      },
    });
    return ok({ items: cuentas, total: cuentas.length });
  } catch (e) {
    return serverError("Error al listar cuentas bancarias", e);
  }
}

const createSchema = z.object({
  bancoId: z.string().min(1),
  numeroCuenta: z.string().min(3).max(40),
  tipo: z.enum(["ahorro", "corriente"]).default("corriente"),
  titular: z.string().min(2).max(150),
  saldoActual: z.number().default(0),
  moneda: z.string().default("COP"),
  activa: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    // Validar que el banco exista y pertenezca a la empresa
    const banco = await db.banco.findFirst({
      where: { id: d.bancoId, empresaId: session.empresaId },
    });
    if (!banco) return notFound("Banco no encontrado");
    // Validar número único en la empresa
    const dup = await db.cuentaBancaria.findFirst({
      where: { empresaId: session.empresaId, numeroCuenta: d.numeroCuenta },
    });
    if (dup) {
      return badRequest("Ya existe una cuenta con ese número en la empresa");
    }
    const cuenta = await db.cuentaBancaria.create({
      data: {
        empresaId: session.empresaId,
        bancoId: d.bancoId,
        numeroCuenta: d.numeroCuenta,
        tipo: d.tipo,
        titular: d.titular,
        saldoActual: round(d.saldoActual, 2),
        moneda: d.moneda,
        activa: d.activa,
      },
      include: { banco: true },
    });
    return ok(cuenta);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una cuenta con ese número en la empresa");
    }
    return serverError("Error al crear cuenta bancaria", e);
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  bancoId: z.string().nullish(),
  numeroCuenta: z.string().min(3).max(40).optional(),
  tipo: z.enum(["ahorro", "corriente"]).optional(),
  titular: z.string().min(2).max(150).optional(),
  saldoActual: z.number().optional(),
  moneda: z.string().optional(),
  activa: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const { id, ...rest } = d;
    const existing = await db.cuentaBancaria.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!existing) return notFound("Cuenta bancaria no encontrada");
    if (rest.bancoId) {
      const banco = await db.banco.findFirst({
        where: { id: rest.bancoId, empresaId: session.empresaId },
      });
      if (!banco) return notFound("Banco no encontrado");
    }
    if (rest.numeroCuenta && rest.numeroCuenta !== existing.numeroCuenta) {
      const dup = await db.cuentaBancaria.findFirst({
        where: {
          empresaId: session.empresaId,
          numeroCuenta: rest.numeroCuenta,
          NOT: { id },
        },
      });
      if (dup) {
        return badRequest("Ya existe una cuenta con ese número en la empresa");
      }
    }
    const dataUpdate: any = {};
    if (rest.bancoId !== undefined) dataUpdate.bancoId = rest.bancoId;
    if (rest.numeroCuenta !== undefined)
      dataUpdate.numeroCuenta = rest.numeroCuenta;
    if (rest.tipo !== undefined) dataUpdate.tipo = rest.tipo;
    if (rest.titular !== undefined) dataUpdate.titular = rest.titular;
    if (rest.saldoActual !== undefined)
      dataUpdate.saldoActual = round(rest.saldoActual, 2);
    if (rest.moneda !== undefined) dataUpdate.moneda = rest.moneda;
    if (rest.activa !== undefined) dataUpdate.activa = rest.activa;

    const updated = await db.cuentaBancaria.update({
      where: { id },
      data: dataUpdate,
      include: { banco: true },
    });
    return ok(updated);
  } catch (e) {
    return serverError("Error al actualizar cuenta bancaria", e);
  }
}
