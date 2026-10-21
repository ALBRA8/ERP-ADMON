import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  getQuery,
  getQueryInt,
  withAuth,
  parseBody,
} from "@/lib/api";

// ============================================================
// GET /api/terceros
// Lista terceros del tenant con paginación y filtros.
// Patrón A-CRIT-006: usa `withAuth` + permiso RBAC.
// ============================================================
export async function GET(req: NextRequest) {
  return withAuth(req, { permission: "terceros:read" }, async (session) => {
    try {
      const tipo = getQuery(req, "tipo"); // cliente | proveedor | todos
      const q = getQuery(req, "q");
      const page = getQueryInt(req, "page", 1) ?? 1;
      const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;

      const where: { empresaId: string; tipo?: string; OR?: unknown[] } = {
        empresaId: session.empresaId,
      };
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
  });
}

// ============================================================
// POST /api/terceros
// Crea un tercero en el tenant de la sesión.
// Patrón A-CRIT-006: withAuth + parseBody(Zod).
// ============================================================
const terceroSchema = z.object({
  tipo: z.enum(["cliente", "proveedor", "empleado", "socio", "todos"]),
  tipoDocumento: z.string().default("CC"),
  numeroDocumento: z.string().min(3).max(20),
  nombre: z.string().min(2).max(200),
  apellido1: z.string().max(100).optional(),
  nombreComercial: z.string().max(200).optional(),
  direccion: z.string().max(200).optional(),
  telefono: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  ciudadId: z.string().optional(),
  regimenTributario: z.string().default("comun"),
  responsabilidad: z.string().default("iva"),
  cupoCredito: z.number().nonnegative().default(0),
  diasPlazo: z.number().int().nonnegative().default(0),
  cargo: z.string().max(100).optional(),
  salario: z.number().nonnegative().optional(),
  observaciones: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  return withAuth(req, { permission: "terceros:write" }, async (session) => {
    const parsed = await parseBody(req, terceroSchema);
    if ("error" in parsed) return parsed.error;

    try {
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
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2002") {
        return badRequest("Ya existe un tercero con ese documento");
      }
      return serverError("Error al crear tercero", e);
    }
  });
}

// ============================================================
// PUT /api/terceros
// Actualiza un tercero PROPIO del tenant (A-CRIT-007).
// Validación Zod + filtro `empresaId` en el `where` para evitar
// cross-tenant mutation por id conocido.
// ============================================================
const terceroUpdateSchema = z.object({
  id: z.string().min(1),
  tipo: z
    .enum(["cliente", "proveedor", "empleado", "socio", "todos"])
    .optional(),
  tipoDocumento: z.string().max(5).optional(),
  numeroDocumento: z.string().min(3).max(20).optional(),
  nombre: z.string().min(2).max(200).optional(),
  apellido1: z.string().max(100).optional(),
  nombreComercial: z.string().max(200).optional(),
  direccion: z.string().max(200).optional(),
  telefono: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  ciudadId: z.string().optional(),
  regimenTributario: z.string().max(30).optional(),
  responsabilidad: z.string().max(30).optional(),
  cupoCredito: z.number().nonnegative().optional(),
  diasPlazo: z.number().int().nonnegative().optional(),
  cargo: z.string().max(100).optional(),
  salario: z.number().nonnegative().optional(),
  observaciones: z.string().max(2000).optional(),
  activo: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  return withAuth(req, { permission: "terceros:write" }, async (session) => {
    const parsed = await parseBody(req, terceroUpdateSchema);
    if ("error" in parsed) return parsed.error;

    try {
      const { id, ...data } = parsed.data;
      // A-CRIT-007: filtro `empresaId` en el where previene
      // actualizar un tercero de otra empresa. Si no existe o no
      // pertenece al tenant, Prisma lanza P2025 (record not found).
      const tercero = await db.tercero.update({
        where: { id, empresaId: session.empresaId },
        data: {
          ...(data as Record<string, unknown>),
          updatedAt: new Date(),
        },
      });
      return ok(tercero);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2025") {
        return badRequest("Tercero no encontrado en su empresa");
      }
      if (err?.code === "P2002") {
        return badRequest("Ya existe un tercero con ese documento");
      }
      return serverError("Error al actualizar tercero", e);
    }
  });
}

// ============================================================
// DELETE /api/terceros?id=...
// Soft-delete (activo=false) validando tenant (A-CRIT-007).
// ============================================================
export async function DELETE(req: NextRequest) {
  return withAuth(req, { permission: "terceros:write" }, async (session) => {
    try {
      const id = getQuery(req, "id");
      if (!id) return badRequest("id requerido");
      // A-CRIT-007: el where incluye `empresaId` para garantizar
      // que el tercero pertenece al tenant de la sesión.
      await db.tercero.update({
        where: { id, empresaId: session.empresaId },
        data: { activo: false },
      });
      return ok({ ok: true });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "P2025") {
        return badRequest("Tercero no encontrado en su empresa");
      }
      return serverError("Error al eliminar tercero", e);
    }
  });
}
