import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  getQueryInt,
  withAuth,
  parseBody,
} from "@/lib/api";

// Recibos de Caja (CXC) y Comprobantes de Egreso (CXP)
// GET: lista del tenant con paginación por `tipo`.
export async function GET(req: NextRequest) {
  return withAuth(req, { permission: "cartera:read" }, async (session) => {
    try {
      const tipo = new URL(req.url).searchParams.get("tipo") ?? "recibo";
      const page = getQueryInt(req, "page", 1) ?? 1;
      const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
      const where = { empresaId: session.empresaId };

      if (tipo === "recibo") {
        const [items, total] = await Promise.all([
          db.reciboCaja.findMany({
            where,
            orderBy: { fecha: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { tercero: true },
          }),
          db.reciboCaja.count({ where }),
        ]);
        return ok({ items, total, page, pageSize });
      }
      if (tipo === "egreso") {
        const [items, total] = await Promise.all([
          db.comprobanteEgreso.findMany({
            where,
            orderBy: { fecha: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { tercero: true },
          }),
          db.comprobanteEgreso.count({ where }),
        ]);
        return ok({ items, total, page, pageSize });
      }
      return badRequest("tipo inválido (recibo | egreso)");
    } catch (e) {
      return serverError("Error al listar cartera", e);
    }
  });
}

const reciboSchema = z.object({
  tipo: z.enum(["recibo", "egreso"]),
  terceroId: z.string().nullish(),
  nombreTercero: z.string().min(2).max(200),
  valorTotal: z.number().positive().max(1e12),
  concepto: z.string().max(500).optional(),
  formaPago: z
    .enum(["efectivo", "tarjeta", "transferencia", "cheque"])
    .default("efectivo"),
  observaciones: z.string().max(2000).nullish(),
});

// ============================================================
// POST /api/cartera
// Crea recibo/egreso + actualiza saldo cartera del tercero en
// una sola `db.$transaction` (A-CRIT-001).
// ============================================================
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    { permission: "recibos:write" },
    async (session) => {
      const parsed = await parseBody(req, reciboSchema);
      if ("error" in parsed) return parsed.error;
      const data = parsed.data;

      // Validar FK terceroId (A-CRIT-007 robustez)
      if (data.terceroId) {
        const t = await db.tercero.findFirst({
          where: { id: data.terceroId, empresaId: session.empresaId },
          select: { id: true },
        });
        if (!t) return badRequest("Tercero no encontrado en su empresa");
      }

      try {
        const item = await db.$transaction(async (tx) => {
          if (data.tipo === "recibo") {
            const cnt = await tx.reciboCaja.count({
              where: { empresaId: session.empresaId },
            });
            const numero = `RC-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
            const recibo = await tx.reciboCaja.create({
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
              await tx.tercero.update({
                where: { id: data.terceroId },
                data: { saldoCartera: { decrement: data.valorTotal } },
              });
            }
            return recibo;
          } else {
            const cnt = await tx.comprobanteEgreso.count({
              where: { empresaId: session.empresaId },
            });
            const numero = `CE-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
            const egreso = await tx.comprobanteEgreso.create({
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
              await tx.tercero.update({
                where: { id: data.terceroId },
                data: { saldoCartera: { decrement: data.valorTotal } },
              });
            }
            return egreso;
          }
        });
        return ok(item);
      } catch (e) {
        return serverError("Error al crear comprobante", e);
      }
    },
  );
}
