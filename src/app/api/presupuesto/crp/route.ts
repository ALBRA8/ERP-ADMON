import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQueryInt,
} from "@/lib/api";
import { getSession, requirePermission } from "@/lib/auth";

// ============================================================
// GET /api/presupuesto/crp
// Lista CRP con cdp padre.
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 200) ?? 200;

    const where = { empresaId: session.empresaId };
    const [items, total] = await Promise.all([
      db.cRP.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { cdp: { include: { rubro: true } } },
      }),
      db.cRP.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar CRP", e);
  }
}

// ============================================================
// POST /api/presupuesto/crp
// Crea CRP. Genera número CRP-YYYY-NNNNNN. Saldo = valor.
// Decrementa CDP.saldo.
// ============================================================
const crearSchema = z.object({
  cdpId: z.string().min(1),
  valor: z.number().positive(),
  concepto: z.string().optional().nullable(),
  terceroId: z.string().optional().nullable(),
  fecha: z.coerce.date().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // FIX-SEGURIDAD H-CRIT-003: RBAC — presupuesto:write.
    const denied = await requirePermission(session, "presupuesto:write");
    if (denied) return denied;

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = crearSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    const cdp = await db.cDP.findFirst({
      where: { id: d.cdpId, empresaId: session.empresaId },
    });
    if (!cdp) return badRequest("CDP no encontrado");
    if (cdp.estado !== "vigente") {
      return badRequest("El CDP no está vigente");
    }
    if (d.valor > cdp.saldo + 0.005) {
      return badRequest(
        `Saldo del CDP insuficiente. Disponible: ${cdp.saldo} - Solicitado: ${d.valor}`,
      );
    }

    const anio = new Date().getFullYear();
    const cnt = await db.cRP.count({
      where: { empresaId: session.empresaId },
    });
    const numero = `CRP-${anio}-${String(cnt + 1).padStart(6, "0")}`;

    const crp = await db.$transaction(async (tx) => {
      const nuevoSaldo = Math.max(
        0,
        Math.round((cdp.saldo - d.valor) * 100) / 100,
      );
      await tx.cDP.update({
        where: { id: cdp.id },
        data: {
          saldo: nuevoSaldo,
          estado: nuevoSaldo <= 0.005 ? "comprometido" : cdp.estado,
        },
      });

      return tx.cRP.create({
        data: {
          empresaId: session.empresaId,
          numero,
          cdpId: cdp.id,
          fecha: d.fecha ?? new Date(),
          valor: d.valor,
          concepto: d.concepto ?? null,
          terceroId: d.terceroId ?? null,
          estado: "vigente",
          saldo: d.valor,
        },
        include: { cdp: { include: { rubro: true } } },
      });
    });

    return ok(crp);
  } catch (e) {
    return serverError("Error al crear CRP", e);
  }
}
