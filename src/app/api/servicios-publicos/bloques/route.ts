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
// /api/servicios-publicos/bloques
// GET (lista), POST (crea), PUT (actualiza)
// ============================================================

const schema = z.object({
  id: z.string().optional(),
  codigo: z.string().min(2),
  nombre: z.string().min(2),
  ciclo: z.number().int().min(1).max(12),
  diaCorte: z.number().int().min(1).max(28),
  diaPago: z.number().int().min(1).max(28),
  activo: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");
    const where: any = { empresaId: session.empresaId };
    if (q) {
      where.OR = [
        { codigo: { contains: q } },
        { nombre: { contains: q } },
      ];
    }
    const [items, total] = await Promise.all([
      db.bloqueFacturacion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.bloqueFacturacion.count({ where }),
    ]);
    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar bloques de facturación", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;
    const existe = await db.bloqueFacturacion.findFirst({
      where: { empresaId: session.empresaId, codigo: d.codigo },
    });
    if (existe)
      return badRequest(`Ya existe un bloque con código ${d.codigo}`);
    const bloque = await db.bloqueFacturacion.create({
      data: {
        empresaId: session.empresaId,
        codigo: d.codigo,
        nombre: d.nombre,
        ciclo: d.ciclo,
        diaCorte: d.diaCorte,
        diaPago: d.diaPago,
        activo: d.activo ?? true,
      },
    });
    return ok(bloque);
  } catch (e) {
    return serverError("Error al crear bloque de facturación", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const { id, ...d } = parsed.data;
    if (!id) return badRequest("id requerido");
    const exists = await db.bloqueFacturacion.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!exists) return badRequest("Bloque no encontrado");
    const bloque = await db.bloqueFacturacion.update({
      where: { id },
      data: {
        codigo: d.codigo,
        nombre: d.nombre,
        ciclo: d.ciclo,
        diaCorte: d.diaCorte,
        diaPago: d.diaPago,
        activo: d.activo ?? exists.activo,
      },
    });
    return ok(bloque);
  } catch (e) {
    return serverError("Error al actualizar bloque de facturación", e);
  }
}
