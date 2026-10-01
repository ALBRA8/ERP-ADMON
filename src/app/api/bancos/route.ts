import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQuery,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// ERP Marsella — Bancos
// GET  /api/bancos              Lista bancos de la empresa
// POST /api/bancos              Crea un banco
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const q = getQuery(req, "q");
    const where: any = { empresaId: session.empresaId };
    if (q) {
      where.OR = [
        { nombre: { contains: q } },
        { codigo: { contains: q } },
        { nit: { contains: q } },
      ];
    }
    const bancos = await db.banco.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: {
        _count: { select: { cuentaBancarias: true } },
      },
    });
    const items = bancos.map((b) => ({
      id: b.id,
      codigo: b.codigo,
      nombre: b.nombre,
      nit: b.nit,
      contacto: b.contacto,
      telefono: b.telefono,
      email: b.email,
      activo: b.activo,
      createdAt: b.createdAt,
      cuentasCount: (b as any)._count?.cuentaBancarias ?? 0,
    }));
    return ok({ items, total: items.length });
  } catch (e) {
    return serverError("Error al listar bancos", e);
  }
}

const bancoSchema = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(2).max(120),
  nit: z.string().optional(),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = bancoSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;
    const banco = await db.banco.create({
      data: {
        empresaId: session.empresaId,
        codigo: d.codigo,
        nombre: d.nombre,
        nit: d.nit ?? null,
        contacto: d.contacto ?? null,
        telefono: d.telefono ?? null,
        email: d.email || null,
      },
    });
    return ok(banco);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe un banco con ese código en la empresa");
    }
    return serverError("Error al crear banco", e);
  }
}
