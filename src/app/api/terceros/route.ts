import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQuery, getQueryInt } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const tipo = getQuery(req, "tipo"); // cliente | proveedor | todos
    const q = getQuery(req, "q");
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

    const where: any = { empresaId: session.empresaId };
    if (tipo && tipo !== "todos") where.tipo = tipo;
    if (q) {
      where.OR = [
        { nombre: { contains: q } },
        { numeroDocumento: { contains: q } },
        { email: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      db.tercero.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { ciudad: true },
      }),
      db.tercero.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar terceros", e);
  }
}

const terceroSchema = z.object({
  tipo: z.enum(["cliente", "proveedor", "empleado", "socio", "todos"]),
  tipoDocumento: z.string().default("CC"),
  numeroDocumento: z.string().min(3),
  nombre: z.string().min(2),
  apellido1: z.string().optional(),
  nombreComercial: z.string().optional(),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  ciudadId: z.string().optional(),
  regimenTributario: z.string().default("comun"),
  responsabilidad: z.string().default("iva"),
  cupoCredito: z.number().default(0),
  diasPlazo: z.number().default(0),
  cargo: z.string().optional(),
  salario: z.number().optional(),
  observaciones: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = terceroSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;
    const tercero = await db.tercero.create({
      data: {
        empresaId: session.empresaId,
        tipo: data.tipo,
        tipoDocumento: data.tipoDocumento,
        numeroDocumento: data.numeroDocumento,
        nombre: data.nombre,
        apellido1: data.apellido1,
        nombreComercial: data.nombreComercial,
        direccion: data.direccion,
        telefono: data.telefono,
        email: data.email || null,
        ciudadId: data.ciudadId,
        regimenTributario: data.regimenTributario,
        responsabilidad: data.responsabilidad,
        cupoCredito: data.cupoCredito,
        diasPlazo: data.diasPlazo,
        cargo: data.cargo,
        salario: data.salario,
        observaciones: data.observaciones,
      },
    });
    return ok(tercero);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe un tercero con ese documento");
    }
    return serverError("Error al crear tercero", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return badRequest("id requerido");
    const tercero = await db.tercero.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
    return ok(tercero);
  } catch (e) {
    return serverError("Error al actualizar tercero", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const id = getQuery(req, "id");
    if (!id) return badRequest("id requerido");
    // Soft delete: marcar inactivo
    await db.tercero.update({
      where: { id },
      data: { activo: false },
    });
    return ok({ ok: true });
  } catch (e) {
    return serverError("Error al eliminar tercero", e);
  }
}
