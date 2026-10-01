import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQueryInt, getQuery } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { calcularAmortizacionFrench, sumarMeses } from "@/lib/credito";

// ============================================================
// GET /api/creditos
// Lista créditos con filtros ?estado=...&terceroId=... y paginación.
// Include cuotas.
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 50) ?? 50;
    const estado = getQuery(req, "estado");
    const terceroId = getQuery(req, "terceroId");

    const where: any = { empresaId: session.empresaId };
    if (estado) where.estado = estado;
    if (terceroId) where.terceroId = terceroId;

    const [items, total] = await Promise.all([
      db.credito.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tercero: true,
          solicitud: true,
          cuotas: { orderBy: { numero: "asc" } },
        },
      }),
      db.credito.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar créditos", e);
  }
}

// ============================================================
// POST /api/creditos
// Crea crédito + cuotas (sistema French).
// ============================================================
const crearSchema = z.object({
  terceroId: z.string().optional().nullable(),
  solicitudId: z.string().optional().nullable(),
  montoPrincipal: z.number().positive(),
  tasaInteres: z.number().min(0), // % EA en decimal (0.18)
  plazoMeses: z.number().int().positive(),
  cuotaN: z.number().int().positive(),
  fechaInicio: z.coerce.date(),
  diasGracia: z.number().int().min(0).optional(),
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

    // Normaliza tasa: si viene como porcentaje (ej. 24 para 24% EA), la convierte a decimal (0.24)
    const tasaDecimal = d.tasaInteres > 1 ? d.tasaInteres / 100 : d.tasaInteres;

    const cuotas = calcularAmortizacionFrench(
      d.montoPrincipal,
      tasaDecimal,
      d.plazoMeses,
      d.fechaInicio,
    );

    const fechaFin = sumarMeses(d.fechaInicio, d.plazoMeses);

    // Transacción: crear crédito + todas las cuotas
    const credito = await db.$transaction(async (tx) => {
      const credito = await tx.credito.create({
        data: {
          empresaId: session.empresaId,
          terceroId: d.terceroId ?? null,
          solicitudId: d.solicitudId ?? null,
          montoPrincipal: d.montoPrincipal,
          tasaInteres: tasaDecimal,
          plazoMeses: d.plazoMeses,
          cuotaN: d.cuotaN,
          fechaInicio: d.fechaInicio,
          fechaFin,
          saldoCapital: d.montoPrincipal,
          estado: "vigente",
        },
      });

      // Bulk insert cuotas
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

    const creado = await db.credito.findUnique({
      where: { id: credito.id },
      include: {
        tercero: true,
        solicitud: true,
        cuotas: { orderBy: { numero: "asc" } },
      },
    });

    return ok(creado);
  } catch (e) {
    return serverError("Error al crear crédito", e);
  }
}
