import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";

// Recibos de Caja (CXC) y Comprobantes de Egreso (CXP)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const tipo = new URL(req.url).searchParams.get("tipo") ?? "recibo";
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

    if (tipo === "recibo") {
      const [items, total] = await Promise.all([
        db.reciboCaja.findMany({
          where: { empresaId: session.empresaId },
          orderBy: { fecha: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { tercero: true },
        }),
        db.reciboCaja.count({ where: { empresaId: session.empresaId } }),
      ]);
      return ok({ items, total, page, pageSize });
    }
    if (tipo === "egreso") {
      const [items, total] = await Promise.all([
        db.comprobanteEgreso.findMany({
          where: { empresaId: session.empresaId },
          orderBy: { fecha: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { tercero: true },
        }),
        db.comprobanteEgreso.count({ where: { empresaId: session.empresaId } }),
      ]);
      return ok({ items, total, page, pageSize });
    }
    return badRequest("tipo inválido (recibo | egreso)");
  } catch (e) {
    return serverError("Error al listar cartera", e);
  }
}

const reciboSchema = z.object({
  tipo: z.enum(["recibo", "egreso"]),
  terceroId: z.string().optional(),
  nombreTercero: z.string().min(2),
  valorTotal: z.number().positive(),
  concepto: z.string().optional(),
  formaPago: z.enum(["efectivo", "tarjeta", "transferencia", "cheque"]).default("efectivo"),
  observaciones: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = reciboSchema.safeParse(body);
    if (!parsed.success) return badRequest("Datos inválidos", parsed.error.flatten());
    const data = parsed.data;

    if (data.tipo === "recibo") {
      const cnt = await db.reciboCaja.count({ where: { empresaId: session.empresaId } });
      const numero = `RC-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
      const item = await db.reciboCaja.create({
        data: {
          empresaId: session.empresaId,
          numero,
          terceroId: data.terceroId,
          nombreTercero: data.nombreTercero,
          valorTotal: data.valorTotal,
          concepto: data.concepto,
          formaPago: data.formaPago,
          observaciones: data.observaciones,
        },
      });
      // Bajar cartera del tercero (cliente)
      if (data.terceroId) {
        await db.tercero.update({
          where: { id: data.terceroId },
          data: { saldoCartera: { decrement: data.valorTotal } },
        });
      }
      return ok(item);
    } else {
      const cnt = await db.comprobanteEgreso.count({ where: { empresaId: session.empresaId } });
      const numero = `CE-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
      const item = await db.comprobanteEgreso.create({
        data: {
          empresaId: session.empresaId,
          numero,
          terceroId: data.terceroId,
          nombreTercero: data.nombreTercero,
          valorTotal: data.valorTotal,
          concepto: data.concepto,
          formaPago: data.formaPago,
          observaciones: data.observaciones,
        },
      });
      // Bajar cartera del tercero (proveedor)
      if (data.terceroId) {
        await db.tercero.update({
          where: { id: data.terceroId },
          data: { saldoCartera: { decrement: data.valorTotal } },
        });
      }
      return ok(item);
    }
  } catch (e) {
    return serverError("Error al crear comprobante", e);
  }
}
