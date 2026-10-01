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
// /api/servicios-publicos/lecturas
// GET  lista (?usuarioServicioId&bloqueFacturacionId&fechaInicio&fechaFin&facturada + pag)
// POST crea lectura, calcula consumo = actual - anterior (valida no negativo)
// ============================================================

const schema = z.object({
  usuarioServicioId: z.string(),
  lecturaAnterior: z.number().optional(),
  lecturaActual: z.number(),
  bloqueFacturacionId: z.string().optional(),
  observaciones: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const usuarioServicioId = getQuery(req, "usuarioServicioId");
    const bloqueFacturacionId = getQuery(req, "bloqueFacturacionId");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");
    const facturada = getQuery(req, "facturada");

    const where: any = { empresaId: session.empresaId };
    if (usuarioServicioId) where.usuarioServicioId = usuarioServicioId;
    if (bloqueFacturacionId) where.bloqueFacturacionId = bloqueFacturacionId;
    if (facturada !== undefined)
      where.facturada = facturada === "true" || facturada === "1";
    if (fechaInicio || fechaFin) {
      where.fechaLectura = {};
      if (fechaInicio) where.fechaLectura.gte = new Date(fechaInicio);
      if (fechaFin)
        where.fechaLectura.lte = new Date(fechaFin + "T23:59:59");
    }

    const [items, total] = await Promise.all([
      db.lecturaMedidor.findMany({
        where,
        orderBy: { fechaLectura: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { usuarioServicio: true },
      }),
      db.lecturaMedidor.count({ where }),
    ]);

    // Lookup manual de tercero
    const uids = items
      .map((l) => l.usuarioServicio?.terceroId)
      .filter(Boolean) as string[];
    const terceros = uids.length
      ? await db.tercero.findMany({
          where: { id: { in: uids } },
          select: { id: true, nombre: true, numeroDocumento: true },
        })
      : [];
    const tmap = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((l) => ({
      ...l,
      usuarioServicio: l.usuarioServicio
        ? {
            ...l.usuarioServicio,
            tercero: l.usuarioServicio.terceroId
              ? tmap.get(l.usuarioServicio.terceroId) ?? null
              : null,
          }
        : null,
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar lecturas", e);
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

    // validar usuario
    const usuario = await db.usuarioServicio.findFirst({
      where: {
        id: d.usuarioServicioId,
        empresaId: session.empresaId,
      },
    });
    if (!usuario) return badRequest("Usuario de servicio no encontrado");

    // resolver lecturaAnterior automáticamente si no se pasa
    let lecturaAnterior = d.lecturaAnterior;
    if (lecturaAnterior === undefined || lecturaAnterior === null) {
      const ultima = await db.lecturaMedidor.findFirst({
        where: { usuarioServicioId: usuario.id },
        orderBy: { fechaLectura: "desc" },
      });
      lecturaAnterior = ultima?.lecturaActual ?? 0;
    }

    const consumo = d.lecturaActual - lecturaAnterior;
    if (consumo < 0) {
      return badRequest(
        `La lectura actual (${d.lecturaActual}) no puede ser menor que la anterior (${lecturaAnterior})`,
      );
    }

    const lectura = await db.lecturaMedidor.create({
      data: {
        empresaId: session.empresaId,
        usuarioServicioId: usuario.id,
        bloqueFacturacionId: d.bloqueFacturacionId ?? null,
        fechaLectura: new Date(),
        lecturaAnterior,
        lecturaActual: d.lecturaActual,
        consumo,
        observaciones: d.observaciones ?? null,
        facturada: false,
      },
      include: { usuarioServicio: true },
    });
    return ok(lectura);
  } catch (e) {
    return serverError("Error al crear lectura", e);
  }
}
