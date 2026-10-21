import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/presupuesto/rubros?vigencia=2026
// Devuelve rubros con jerarquía (children + cuentaPadre).
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const vigenciaParam = getQuery(req, "vigencia");
    const vigencia =
      vigenciaParam && Number.isFinite(parseInt(vigenciaParam, 10))
        ? parseInt(vigenciaParam, 10)
        : new Date().getFullYear();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 500) ?? 500;

    const where = { empresaId: session.empresaId, vigencia };

    const [items, total] = await Promise.all([
      db.rubroPresupuestal.findMany({
        where,
        orderBy: [{ codigo: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          cuentaPadre: true,
          children: true,
        },
      }),
      db.rubroPresupuestal.count({ where }),
    ]);

    return ok({ items, total, page, pageSize, vigencia });
  } catch (e) {
    return serverError("Error al listar rubros presupuestales", e);
  }
}

// ============================================================
// POST /api/presupuesto/rubros
// Crea rubro (codigo, nombre, tipo, nivel, cuentaPadreId?, vigencia, apropiacionInicial).
// ============================================================
const crearSchema = z.object({
  codigo: z.string().min(1).max(50),
  nombre: z.string().min(2),
  tipo: z.enum(["ingreso", "gasto"]),
  nivel: z.number().int().min(1).max(10).optional(),
  cuentaPadreId: z.string().optional().nullable(),
  vigencia: z.number().int().optional(),
  apropiacionInicial: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = crearSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    // Calcular nivel automáticamente si no se provee
    let nivel = d.nivel ?? 1;
    if (d.cuentaPadreId) {
      const padre = await db.rubroPresupuestal.findFirst({
        where: { id: d.cuentaPadreId, empresaId: session.empresaId },
      });
      if (!padre) return badRequest("Rubro padre no encontrado");
      nivel = padre.nivel + 1;
    }

    const vigencia = d.vigencia ?? new Date().getFullYear();

    const existente = await db.rubroPresupuestal.findFirst({
      where: {
        empresaId: session.empresaId,
        codigo: d.codigo,
        vigencia,
      },
    });
    if (existente) {
      return badRequest(
        `Ya existe un rubro con código ${d.codigo} para la vigencia ${vigencia}`,
      );
    }

    const rubro = await db.rubroPresupuestal.create({
      data: {
        empresaId: session.empresaId,
        codigo: d.codigo,
        nombre: d.nombre,
        tipo: d.tipo,
        nivel,
        cuentaPadreId: d.cuentaPadreId ?? null,
        vigencia,
        apropiacionInicial: d.apropiacionInicial,
      },
      include: { cuentaPadre: true, children: true },
    });

    return ok(rubro);
  } catch (e) {
    return serverError("Error al crear rubro presupuestal", e);
  }
}
