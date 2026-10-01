import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// POST /api/cafetero/compras/[id]/liquidar
// Marca la compra como liquidada. Si body.generarFactura=true,
// genera una FacturaVenta (compra) llamando a /api/facturas.
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
    const compra = await db.compraCafe.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { finca: true },
    });
    if (!compra) return notFound("Compra de café no encontrada");

    const body: any = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const d = parsed.data;

    let facturaGenerada: any = null;

    if (d.generarFactura) {
      // Resolver proveedor (tercero)
      let nombreCliente = "Comprador de Café";
      let nitCliente = "222222222";
      let terceroId = compra.terceroId ?? undefined;
      if (compra.terceroId) {
        const t = await db.tercero.findUnique({
          where: { id: compra.terceroId },
        });
        if (t) {
          nombreCliente = t.nombre;
          nitCliente = t.numeroDocumento;
        }
      }
      // Llamada interna a /api/facturas (es una venta que documenta la compra
      // para el proveedor del café — el monto a pagar es valorPagar).
      const items = [
        {
          descripcion: `Compra café ${compra.numero} (${compra.pesoNeto} kg)`,
          cantidad: compra.pesoNeto,
          unidadMedida: "KG",
          precioUnitario: compra.precioBaseKg,
          descuentoPorcentaje: 0,
          tarifaIva: 0,
        },
      ];
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
          formaPago: d.formaPago ?? "transferencia",
          observaciones: `Liquidación compra café ${compra.numero}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return badRequest(
          json?.error ?? "Error al generar factura de compra",
          json,
        );
      }
      facturaGenerada = json;
    }

    await db.compraCafe.update({
      where: { id: compra.id },
      data: {
        estado: "liquidado",
        observaciones:
          (compra.observaciones ?? "") +
          (d.generarFactura
            ? `\n[Liquidada ${new Date().toISOString()} — Factura generada]`
            : `\n[Liquidada ${new Date().toISOString()}]`),
      },
    });

    return ok({
      ok: true,
      compraId: compra.id,
      estado: "liquidado",
      valorPagar: compra.valorPagar,
      factura: facturaGenerada,
    });
  } catch (e) {
    return serverError("Error al liquidar compra de café", e);
  }
}
