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
// GET /api/presupuesto/cdp
// Lista CDP con rubro + crps.
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 200) ?? 200;

    const where = { empresaId: session.empresaId };
    const [items, total] = await Promise.all([
      db.cDP.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          rubro: true,
          crps: { orderBy: { fecha: "desc" } },
        },
      }),
      db.cDP.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar CDP", e);
  }
}

// ============================================================
// POST /api/presupuesto/cdp
// Crea CDP. Genera número CDP-YYYY-NNNNNN. Saldo = valor.
// ============================================================
const crearSchema = z.object({
  rubroId: z.string().min(1),
  valor: z.number().positive(),
  concepto: z.string().optional().nullable(),
  terceroId: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
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

    const rubro = await db.rubroPresupuestal.findFirst({
      where: { id: d.rubroId, empresaId: session.empresaId },
    });
    if (!rubro) return badRequest("Rubro no encontrado");

    const anio = new Date().getFullYear();
    const cnt = await db.cDP.count({
      where: { empresaId: session.empresaId },
    });
    const numero = `CDP-${anio}-${String(cnt + 1).padStart(6, "0")}`;

    const cdp = await db.cDP.create({
      data: {
        empresaId: session.empresaId,
        numero,
        fecha: d.fecha ?? new Date(),
        rubroId: rubro.id,
        valor: d.valor,
        concepto: d.concepto ?? null,
        terceroId: d.terceroId ?? null,
        observaciones: d.observaciones ?? null,
        estado: "vigente",
        saldo: d.valor,
      },
      include: { rubro: true },
    });

    return ok(cdp);
  } catch (e) {
    return serverError("Error al crear CDP", e);
  }
}
