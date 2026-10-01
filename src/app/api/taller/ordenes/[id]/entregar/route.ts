import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// POST /api/taller/ordenes/[id]/entregar
// Cambia estado a "entregado". Si body.generarFactura=true,
// genera FacturaVenta con los detalles como items (POST /api/facturas).
// ============================================================

const schema = z.object({
  generarFactura: z.boolean().optional(),
  formaPago: z
    .enum(["efectivo", "tarjeta", "transferencia", "credito", "mixto"])
    .optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    const orden = await db.ordenServicioTecnico.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { detalleServicioTecnicos: true },
    });
    if (!orden) return notFound("Orden de servicio no encontrada");
    if (orden.estado !== "listo") {
      return badRequest(
        `La orden debe estar en estado "listo" para entregarse (estado actual: ${orden.estado})`,
      );
    }

    const body: any = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    let factura: any = null;
    if (d.generarFactura && orden.detalleServicioTecnicos.length > 0) {
      let nombreCliente = "Cliente Mostrador";
      let nitCliente = "222222222";
      let terceroId = orden.terceroId ?? undefined;
      if (orden.terceroId) {
        const t = await db.tercero.findUnique({
          where: { id: orden.terceroId },
        });
        if (t) {
          nombreCliente = t.nombre;
          nitCliente = t.numeroDocumento;
        }
      }
      const items = orden.detalleServicioTecnicos.map((det) => ({
        descripcion: `${det.tipo.toUpperCase()} — ${det.descripcion}`,
        cantidad: det.cantidad,
        unidadMedida: "UND",
        precioUnitario: det.precioUnitario,
        descuentoPorcentaje: 0,
        tarifaIva: 0,
      }));
      const url = new URL("/api/facturas", req.url).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: req.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({
          terceroId,
          nombreCliente,
          nitCliente,
          items,
          esPOS: false,
          formaPago: d.formaPago ?? "efectivo",
          observaciones: `Orden de servicio ${orden.numero}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return badRequest(
          json?.error ?? "Error al generar factura",
          json,
        );
      }
      factura = json;
    }

    const updated = await db.ordenServicioTecnico.update({
      where: { id: orden.id },
      data: {
        estado: "entregado",
        facturaId: factura?.id ?? orden.facturaId ?? null,
      },
    });

    return ok({
      ok: true,
      orden: updated,
      factura,
    });
  } catch (e) {
    return serverError("Error al entregar orden", e);
  }
}
