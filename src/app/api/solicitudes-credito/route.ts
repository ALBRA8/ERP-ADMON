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
import { calcularAmortizacionFrench, sumarMeses } from "@/lib/credito";

// ============================================================
// GET /api/solicitudes-credito
// Lista solicitudes con filtros ?estado=...
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const estado = getQuery(req, "estado");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;

    const [items, total] = await Promise.all([
      db.solicitudCredito.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tercero: true,
          creditos: true,
        },
      }),
      db.solicitudCredito.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar solicitudes de crédito", e);
  }
}

// ============================================================
// POST /api/solicitudes-credito
// Crea solicitud en estado pendiente.
// ============================================================
const crearSchema = z.object({
  terceroId: z.string().optional().nullable(),
  montoSolicitado: z.number().positive(),
  tasaInteres: z.number().min(0),
  plazoMeses: z.number().int().positive(),
  cuotaN: z.number().int().positive(),
  destino: z.string().optional().nullable(),
  referencias: z.string().optional().nullable(), // JSON
  observaciones: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const parsed = crearSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    const solicitud = await db.solicitudCredito.create({
      data: {
        empresaId: session.empresaId,
        terceroId: d.terceroId ?? null,
        montoSolicitado: d.montoSolicitado,
        tasaInteres: d.tasaInteres,
        plazoMeses: d.plazoMeses,
        cuotaN: d.cuotaN,
        destino: d.destino ?? null,
        referencias: d.referencias ?? null,
        observaciones: d.observaciones ?? null,
        estado: "pendiente",
      },
      include: { tercero: true },
    });

    return ok(solicitud);
  } catch (e) {
    return serverError("Error al crear solicitud de crédito", e);
  }
}

// ============================================================
// PUT /api/solicitudes-credito
// Actualizar estado (aprobada | rechazada | anulada).
// Si se aprueba con `crearCredito=true`, crea el Credito asociado.
// ============================================================
const updateSchema = z.object({
  id: z.string().min(1),
  estado: z.enum(["aprobada", "rechazada", "anulada"]),
  crearCredito: z.boolean().optional().default(false),
  fechaInicio: z.coerce.date().optional(),
  observaciones: z.string().optional().nullable(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    const solicitud = await db.solicitudCredito.findFirst({
      where: { id: d.id, empresaId: session.empresaId },
    });
    if (!solicitud) return badRequest("Solicitud no encontrada");

    const data: any = {
      estado: d.estado,
      aprobadoPorId: session.userId,
      fechaAprobacion: new Date(),
      observaciones: d.observaciones ?? solicitud.observaciones,
    };

    let creditoCreado = null;

    if (d.estado === "aprobada" && d.crearCredito) {
      const fechaInicio = d.fechaInicio ?? new Date();
      const cuotas = calcularAmortizacionFrench(
        solicitud.montoSolicitado,
        solicitud.tasaInteres,
        solicitud.plazoMeses,
        fechaInicio,
      );
      const fechaFin = sumarMeses(fechaInicio, solicitud.plazoMeses);

      creditoCreado = await db.$transaction(async (tx) => {
        // Marcar solicitud aprobada
        await tx.solicitudCredito.update({ where: { id: solicitud.id }, data });

        const credito = await tx.credito.create({
          data: {
            empresaId: session.empresaId,
            terceroId: solicitud.terceroId,
            solicitudId: solicitud.id,
            montoPrincipal: solicitud.montoSolicitado,
            tasaInteres: solicitud.tasaInteres,
            plazoMeses: solicitud.plazoMeses,
            cuotaN: solicitud.cuotaN,
            fechaInicio,
            fechaFin,
            saldoCapital: solicitud.montoSolicitado,
            estado: "vigente",
          },
        });

        await tx.cuotaCredito.createMany({
          data: cuotas.map((c) => ({
            creditoId: credito.id,
            empresaId: session.empresaId,
            numero: c.numero,
            fechaVencimiento: c.fechaVencimiento,
            capital: c.capital,
            interes: c.interes,
            totalCuota: c.totalCuota,
            saldoCapital: c.saldoCapital,
            estado: "pendiente",
          })),
        });

        return credito;
      });

      const withCuotas = await db.credito.findUnique({
        where: { id: creditoCreado.id },
        include: { cuotas: { orderBy: { numero: "asc" } } },
      });
      return ok({
        solicitud: await db.solicitudCredito.findUnique({
          where: { id: solicitud.id },
          include: { tercero: true, creditos: true },
        }),
        credito: withCuotas,
      });
    }

    // No crear crédito — solo actualizar estado
    const actualizada = await db.solicitudCredito.update({
      where: { id: solicitud.id },
      data,
      include: { tercero: true, creditos: true },
    });

    return ok({ solicitud: actualizada, credito: null });
  } catch (e) {
    return serverError("Error al actualizar solicitud", e);
  }
}
