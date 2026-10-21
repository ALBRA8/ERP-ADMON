import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/nomina/conceptos
// Lista conceptos de nómina de la empresa (opcional ?tipo=)
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo") ?? undefined;

    const where: any = { empresaId: session.empresaId };
    if (tipo) where.tipo = tipo;

    const conceptos = await db.nominaConcepto.findMany({
      where,
      orderBy: [{ tipo: "asc" }, { codigo: "asc" }],
    });
    return ok(conceptos);
  } catch (e) {
    return serverError("Error al listar conceptos de nómina", e);
  }
}

// ============================================================
// POST /api/nomina/conceptos
// Crea un nuevo concepto de nómina
// ============================================================
const conceptoSchema = z.object({
  codigo: z.string().min(2).max(60),
  nombre: z.string().min(2).max(120),
  tipo: z.enum(["devengo", "deduccion", "aporte_patronal", "provision"]),
  formula: z.string().optional(),
  cuentaContableDebito: z.string().optional(),
  cuentaContableCredito: z.string().optional(),
  basePorDefecto: z
    .enum(["salario", "ibc", "total_devengado"])
    .default("salario"),
  porcentaje: z.number().default(0),
  activo: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = conceptoSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;
    try {
      const concepto = await db.nominaConcepto.create({
        data: { empresaId: session.empresaId, ...data },
      });
      return ok(concepto);
    } catch (e: any) {
      if (e?.code === "P2002") {
        return badRequest("Ya existe un concepto con ese código");
      }
      throw e;
    }
  } catch (e) {
    return serverError("Error al crear concepto de nómina", e);
  }
}

// ============================================================
// PUT /api/nomina/conceptos (body.id)
// Actualiza un concepto existente
// ============================================================
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const { id, ...data } = body;
    if (!id) return badRequest("id requerido");
    const concepto = await db.nominaConcepto.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
    return ok(concepto);
  } catch (e) {
    return serverError("Error al actualizar concepto", e);
  }
}
