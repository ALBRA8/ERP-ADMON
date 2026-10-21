import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  getQueryInt,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// GET /api/presupuesto/modificaciones
// Lista modificaciones presupuestales.
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 200) ?? 200;

    const where = { empresaId: session.empresaId };
    const [items, total] = await Promise.all([
      db.modificacionPresupuestal.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.modificacionPresupuestal.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar modificaciones presupuestales", e);
  }
}

// ============================================================
// POST /api/presupuesto/modificaciones
// Crea modificación. Ajusta RubroPresupuestal.apropiacionInicial.
// ============================================================
const crearSchema = z.object({
  tipo: z.enum(["adicion", "reduccion", "traslado"]),
  rubroOrigenId: z.string().optional().nullable(),
  rubroDestinoId: z.string().optional().nullable(),
  valor: z.number().positive(),
  motivo: z.string().optional().nullable(),
  cdpId: z.string().optional().nullable(),
  fecha: z.coerce.date().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = crearSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    // Validar según tipo
    if (d.tipo === "adicion" && !d.rubroDestinoId) {
      return badRequest("Una adición requiere rubroDestinoId");
    }
    if (d.tipo === "reduccion" && !d.rubroOrigenId) {
      return badRequest("Una reducción requiere rubroOrigenId");
    }
    if (d.tipo === "traslado") {
      if (!d.rubroOrigenId || !d.rubroDestinoId) {
        return badRequest("Un traslado requiere ambos rubroOrigenId y rubroDestinoId");
      }
      if (d.rubroOrigenId === d.rubroDestinoId) {
        return badRequest("Origen y destino no pueden ser el mismo rubro");
      }
    }

    const anio = new Date().getFullYear();
    const cnt = await db.modificacionPresupuestal.count({
      where: { empresaId: session.empresaId },
    });
    const numero = `MP-${anio}-${String(cnt + 1).padStart(6, "0")}`;

    const modific = await db.$transaction(async (tx) => {
      // Ajustes según tipo
      if (d.tipo === "adicion" && d.rubroDestinoId) {
        await tx.rubroPresupuestal.update({
          where: { id: d.rubroDestinoId },
          data: { apropiacionInicial: { increment: d.valor } },
        });
      }
      if (d.tipo === "reduccion" && d.rubroOrigenId) {
        await tx.rubroPresupuestal.update({
          where: { id: d.rubroOrigenId },
          data: { apropiacionInicial: { decrement: d.valor } },
        });
      }
      if (d.tipo === "traslado") {
        await tx.rubroPresupuestal.update({
          where: { id: d.rubroOrigenId! },
          data: { apropiacionInicial: { decrement: d.valor } },
        });
        await tx.rubroPresupuestal.update({
          where: { id: d.rubroDestinoId! },
          data: { apropiacionInicial: { increment: d.valor } },
        });
      }

      return tx.modificacionPresupuestal.create({
        data: {
          empresaId: session.empresaId,
          numero,
          fecha: d.fecha ?? new Date(),
          tipo: d.tipo,
          rubroOrigenId: d.rubroOrigenId ?? null,
          rubroDestinoId: d.rubroDestinoId ?? null,
          valor: d.valor,
          motivo: d.motivo ?? null,
          cdpId: d.cdpId ?? null,
          estado: "vigente",
        },
        include: {
          rubroOrigen: true,
          rubroDestino: true,
          cdp: true,
        },
      });
    });

    return ok(modific);
  } catch (e) {
    return serverError("Error al crear modificación presupuestal", e);
  }
}
