import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, getQuery } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// /api/bodegas — CRUD de bodegas (multibodega Marsella ERP)
// GET    -> lista bodegas de la empresa con conteos de inventario
// POST   -> crea una nueva bodega (codigo, nombre, direccion)
// Filtrado por empresaId de la sesión.
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const q = getQuery(req, "q");
    const where: any = { empresaId: session.empresaId };
    if (q) {
      where.OR = [
        { codigo: { contains: q } },
        { nombre: { contains: q } },
        { direccion: { contains: q } },
      ];
    }

    const items = await db.bodega.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        saldosInventario: {
          include: { producto: true },
        },
      },
    });

    const enriched = items.map((b) => ({
      id: b.id,
      codigo: b.codigo,
      nombre: b.nombre,
      direccion: b.direccion,
      responsableId: b.responsableId,
      activa: b.activa,
      createdAt: b.createdAt,
      productosCount: b.saldosInventario.filter((s) => s.cantidad > 0).length,
      cantidadTotal: b.saldosInventario.reduce((a, s) => a + s.cantidad, 0),
      valorTotal: b.saldosInventario.reduce((a, s) => a + Number(s.costoTotal), 0),
    }));

    return ok(enriched);
  } catch (e) {
    return serverError("Error al listar bodegas", e);
  }
}

const bodegaSchema = z.object({
  codigo: z.string().min(1, "El código es obligatorio"),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  direccion: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = bodegaSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }

    const bodega = await db.bodega.create({
      data: {
        empresaId: session.empresaId,
        codigo: parsed.data.codigo.trim(),
        nombre: parsed.data.nombre.trim(),
        direccion: parsed.data.direccion?.trim() || null,
      },
    });

    return ok(bodega);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return badRequest("Ya existe una bodega con ese código");
    }
    return serverError("Error al crear bodega", e);
  }
}
