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
// /api/taller/ordenes
// GET  lista (?q&estado&fechaInicio&fechaFin&tecnicoId + pag)
// POST crea orden, genera número OST-2026-NNNNNN, estado=ingresado
// ============================================================

const schema = z.object({
  terceroId: z.string().optional(),
  equipo: z.string().min(2),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  serial: z.string().optional(),
  problemaReportado: z.string().min(3),
  observaciones: z.string().optional(),
});

async function genNumero(empresaId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.ordenServicioTecnico.count({ where: { empresaId } });
  return `OST-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const q = getQuery(req, "q");
    const estado = getQuery(req, "estado");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");
    const tecnicoId = getQuery(req, "tecnicoId");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (tecnicoId) where.tecnicoAsignadoId = tecnicoId;
    if (fechaInicio || fechaFin) {
      where.fechaIngreso = {};
      if (fechaInicio) where.fechaIngreso.gte = new Date(fechaInicio);
      if (fechaFin)
        where.fechaIngreso.lte = new Date(fechaFin + "T23:59:59");
    }
    if (q) {
      where.OR = [
        { numero: { contains: q } },
        { equipo: { contains: q } },
        { marca: { contains: q } },
        { modelo: { contains: q } },
        { serial: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      db.ordenServicioTecnico.findMany({
        where,
        orderBy: { fechaIngreso: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { detalleServicioTecnicos: true } } },
      }),
      db.ordenServicioTecnico.count({ where }),
    ]);

    // Lookup manual de tercero y técnico (no hay relación formal)
    const ids = [
      ...items.map((o) => o.terceroId),
      ...items.map((o) => o.tecnicoAsignadoId),
    ].filter(Boolean) as string[];
    const terceros = ids.length
      ? await db.tercero.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            nombre: true,
            numeroDocumento: true,
            telefono: true,
          },
        })
      : [];
    const tmap = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((o) => ({
      ...o,
      tercero: o.terceroId ? tmap.get(o.terceroId) ?? null : null,
      tecnico: o.tecnicoAsignadoId
        ? tmap.get(o.tecnicoAsignadoId) ?? null
        : null,
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar órdenes de servicio", e);
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

    if (d.terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: d.terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }

    const numero = await genNumero(session.empresaId);
    const orden = await db.ordenServicioTecnico.create({
      data: {
        empresaId: session.empresaId,
        numero,
        terceroId: d.terceroId ?? null,
        fechaIngreso: new Date(),
        estado: "ingresado",
        equipo: d.equipo,
        marca: d.marca ?? null,
        modelo: d.modelo ?? null,
        serial: d.serial ?? null,
        problemaReportado: d.problemaReportado,
        observaciones: d.observaciones ?? null,
        valorRepuestos: 0,
        valorManoObra: 0,
        valorTotal: 0,
      },
    });

    let tercero = null;
    if (orden.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: orden.terceroId },
        select: { id: true, nombre: true, numeroDocumento: true, telefono: true },
      });
    }
    return ok({ ...orden, tercero });
  } catch (e) {
    return serverError("Error al crear orden de servicio", e);
  }
}
