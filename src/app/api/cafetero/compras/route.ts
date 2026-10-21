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
// /api/cafetero/compras
// GET  lista con filtros ?q&fechaInicio&fechaFin&estado + paginación
// POST crea compra de café y calcula liquidación completa
// ============================================================

const compraSchema = z.object({
  terceroId: z.string().nullish(),
  fincaId: z.string().nullish(),
  pesoBruto: z.number().positive(),
  tara: z.number().nonnegative().default(0),
  factorRendimiento: z.number().nonnegative().default(0),
  humedad: z.number().nonnegative().default(0),
  precioBaseKg: z.number().positive(),
  observaciones: z.string().optional(),
});

async function genNumero(empresaId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.compraCafe.count({ where: { empresaId } });
  return `CAF-${year}-${String(count + 1).padStart(6, "0")}`;
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

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (q) where.numero = { contains: q };
    if (fechaInicio || fechaFin) {
      where.fecha = {};
      if (fechaInicio) where.fecha.gte = new Date(fechaInicio);
      if (fechaFin) where.fecha.lte = new Date(fechaFin + "T23:59:59");
    }

    const [items, total] = await Promise.all([
      db.compraCafe.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { finca: true, controlCalidad: true },
      }),
      db.compraCafe.count({ where }),
    ]);

    // Lookup manual de tercero (CompraCafe.terceroId no tiene relation)
    const tids = items.map((c) => c.terceroId).filter(Boolean) as string[];
    const terceros = tids.length
      ? await db.tercero.findMany({
          where: { id: { in: tids } },
          select: { id: true, nombre: true, numeroDocumento: true },
        })
      : [];
    const tmap = new Map(terceros.map((t) => [t.id, t]));
    const enriched = items.map((c) => ({
      ...c,
      tercero: c.terceroId ? tmap.get(c.terceroId) ?? null : null,
    }));

    return ok({ items: enriched, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar compras de café", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = compraSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    // Validar tercero
    if (d.terceroId) {
      const t = await db.tercero.findFirst({
        where: { id: d.terceroId, empresaId: session.empresaId },
      });
      if (!t) return badRequest("Tercero no encontrado");
    }
    // Validar finca
    if (d.fincaId) {
      const f = await db.finca.findFirst({
        where: { id: d.fincaId, empresaId: session.empresaId },
      });
      if (!f) return badRequest("Finca no encontrada");
    }

    // Cálculos de liquidación (Hermes §5.16)
    const pesoNeto = d.pesoBruto - d.tara;
    if (pesoNeto <= 0)
      return badRequest("El peso neto (peso bruto - tara) debe ser > 0");
    const valorBruto = pesoNeto * d.precioBaseKg;
    // Descuentos: humedad (1% por cada % encima de 12) + factor rendimiento
    const descHumedad =
      d.humedad > 12 ? (d.humedad - 12) * pesoNeto * 0.01 : 0;
    const descRend = (d.factorRendimiento * valorBruto) / 100;
    const descuentos = descHumedad + descRend;
    // Retenciones: retefuente 0.5% sobre café
    const retenciones = valorBruto * 0.005;
    const valorPagar = valorBruto - descuentos - retenciones;

    const numero = await genNumero(session.empresaId);

    const compra = await db.compraCafe.create({
      data: {
        empresaId: session.empresaId,
        numero,
        terceroId: d.terceroId ?? null,
        fincaId: d.fincaId ?? null,
        fecha: new Date(),
        pesoBruto: d.pesoBruto,
        tara: d.tara,
        pesoNeto,
        factorRendimiento: d.factorRendimiento,
        humedad: d.humedad,
        precioBaseKg: d.precioBaseKg,
        valorBruto,
        descuentos,
        retenciones,
        valorPagar,
        estado: "vigente",
        observaciones: d.observaciones ?? null,
      },
      include: { finca: true, controlCalidad: true },
    });

    let tercero = null;
    if (compra.terceroId) {
      tercero = await db.tercero.findUnique({
        where: { id: compra.terceroId },
        select: { id: true, nombre: true, numeroDocumento: true },
      });
    }
    return ok({ ...compra, tercero });
  } catch (e) {
    return serverError("Error al crear compra de café", e);
  }
}
