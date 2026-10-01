import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQuery, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { round } from "@/lib/currency";

// GET /api/contabilidad?op=cuentas | comprobantes | balance | mayor | auxiliar
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const op = getQuery(req, "op");

    if (op === "cuentas") {
      const cuentas = await db.cuentaPuc.findMany({
        where: { empresaId: session.empresaId },
        orderBy: { codigo: "asc" },
      });
      return ok(cuentas);
    }

    if (op === "comprobantes") {
      const page = getQueryInt(req, "page", 1) ?? 1;
      const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
      const where: any = { empresaId: session.empresaId };
      const [items, total] = await Promise.all([
        db.comprobante.findMany({
          where,
          orderBy: { fecha: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { _count: { select: { movimientos: true } } },
        }),
        db.comprobante.count({ where }),
      ]);
      return ok({ items, total, page, pageSize });
    }

    if (op === "balance") {
      // Balance de prueba: lista todas las cuentas con saldo
      const cuentas = await db.cuentaPuc.findMany({
        where: { empresaId: session.empresaId },
        orderBy: { codigo: "asc" },
      });
      const movs = await db.movimientoContable.findMany({
        where: {
          empresaId: session.empresaId,
          comprobante: { estado: "contabilizado" },
        },
        select: { cuentaId: true, debito: true, credito: true },
      });
      const sumas: Record<string, { debito: number; credito: number }> = {};
      for (const m of movs) {
        const cur = sumas[m.cuentaId] ?? { debito: 0, credito: 0 };
        cur.debito += m.debito;
        cur.credito += m.credito;
        sumas[m.cuentaId] = cur;
      }
      const balance = cuentas.map((c) => {
        const s = sumas[c.id] ?? { debito: 0, credito: 0 };
        const saldo = round(
          c.naturaleza === "debito"
            ? s.debito - s.credito
            : s.credito - s.debito,
          2,
        );
        return {
          ...c,
          debito: round(s.debito, 2),
          credito: round(s.credito, 2),
          saldo,
          naturaleza: c.naturaleza,
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
      return ok({
        cuentas: balance.filter(
          (b) => b.debito !== 0 || b.credito !== 0 || b.nivel <= 2,
        ),
        totalDebito,
        totalCredito,
        diferencia: round(totalDebito - totalCredito, 2),
      });
    }

    if (op === "mayor") {
      const cuentaId = getQuery(req, "cuentaId");
      if (!cuentaId) return badRequest("cuentaId requerido");
      const movs = await db.movimientoContable.findMany({
        where: {
          empresaId: session.empresaId,
          cuentaId,
          comprobante: { estado: "contabilizado" },
        },
        orderBy: { fecha: "asc" },
        include: { comprobante: true, tercero: true },
      });
      let saldoAnterior = 0;
      return ok(
        movs.map((m) => {
          saldoAnterior = round(saldoAnterior + m.debito - m.credito, 2);
          return {
            ...m,
            saldo: saldoAnterior,
          };
        }),
      );
    }

    if (op === "auxiliar") {
      // Libro auxiliar por tercero
      const terceroId = getQuery(req, "terceroId");
      if (!terceroId) return badRequest("terceroId requerido");
      const movs = await db.movimientoContable.findMany({
        where: {
          empresaId: session.empresaId,
          terceroId,
          comprobante: { estado: "contabilizado" },
        },
        orderBy: { fecha: "asc" },
        include: { cuenta: true, comprobante: true },
      });
      let saldo = 0;
      return ok(
        movs.map((m) => {
          saldo = round(saldo + m.debito - m.credito, 2);
          return { ...m, saldo };
        }),
      );
    }

    return badRequest("op inválido (cuentas | comprobantes | balance | mayor | auxiliar)");
  } catch (e) {
    return serverError("Error al consultar contabilidad", e);
  }
}

const asientoSchema = z.object({
  fecha: z.string().optional(),
  descripcion: z.string().optional(),
  movimientos: z.array(z.object({
    cuentaId: z.string(),
    terceroId: z.string().optional(),
    descripcion: z.string().optional(),
    debito: z.number().default(0),
    credito: z.number().default(0),
  })).min(2),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = asientoSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;
    const totalDebito = round(
      data.movimientos.reduce((a, m) => a + m.debito, 0),
      2,
    );
    const totalCredito = round(
      data.movimientos.reduce((a, m) => a + m.credito, 0),
      2,
    );
    const diferencia = round(totalDebito - totalCredito, 2);
    if (Math.abs(diferencia) > 0.01) {
      return badRequest(
        `Asiento descuadrado: débitos ${totalDebito} vs créditos ${totalCredito} (diferencia ${diferencia})`,
      );
    }

    const cnt = await db.comprobante.count({ where: { empresaId: session.empresaId } });
    const numero = `CG-${new Date().getFullYear()}-${String(cnt + 1).padStart(6, "0")}`;
    const fecha = data.fecha ? new Date(data.fecha) : new Date();

    const comprobante = await db.comprobante.create({
      data: {
        empresaId: session.empresaId,
        numero,
        tipo: "manual",
        fecha,
        descripcion: data.descripcion ?? `Asiento manual ${numero}`,
        totalDebito,
        totalCredito,
        diferencia: 0,
        estado: "contabilizado",
      },
    });

    for (const m of data.movimientos) {
      await db.movimientoContable.create({
        data: {
          empresaId: session.empresaId,
          comprobanteId: comprobante.id,
          cuentaId: m.cuentaId,
          terceroId: m.terceroId,
          descripcion: m.descripcion,
          debito: m.debito,
          credito: m.credito,
          fecha,
        },
      });
    }

    return ok(comprobante);
  } catch (e) {
    return serverError("Error al crear asiento", e);
  }
}
