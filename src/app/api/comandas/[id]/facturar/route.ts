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
// POST /api/comandas/[id]/facturar
// Convierte comanda en FacturaVenta.
// Body opcional: { terceroId?, nombreCliente?, nitCliente?, formaPago? }
// Llama internamente a POST /api/facturas reenviando la cookie de
// sesión para que tome el empresaId y la resolución DIAN activa.
// Cambia comanda.estado = "facturada", fechaCierre = now(), mesa.estado = "disponible"
// ============================================================
const facturarSchema = z.object({
  terceroId: z.string().optional(),
  nombreCliente: z.string().optional(),
  nitCliente: z.string().optional(),
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

    const body: any = await req.json().catch(() => ({}));
    const parsed = facturarSchema.safeParse(body || {});
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const data = parsed.data;

    // 1. Cargar comanda + detalles + mesa
    const comanda = await db.comanda.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        detalles: true,
        mesa: true,
      },
    });
    if (!comanda) return notFound("Comanda no encontrada");
    if (comanda.estado !== "abierta") {
      return badRequest(
        `La comanda no se puede facturar (estado actual: ${comanda.estado})`,
      );
    }
    const detallesValidos = comanda.detalles.filter(
      (d) => d.estado !== "anulado",
    );
    if (detallesValidos.length === 0) {
      return badRequest("La comanda no tiene items válidos para facturar");
    }

    // 2. Resolver cliente: tercero snapshot o defaults POS
    let nombreCliente = data.nombreCliente ?? "";
    let nitCliente = data.nitCliente ?? "";
    if (data.terceroId) {
      const tercero = await db.tercero.findFirst({
        where: { id: data.terceroId, empresaId: session.empresaId },
      });
      if (tercero) {
        if (!nombreCliente) nombreCliente = tercero.nombre;
        if (!nitCliente) nitCliente = tercero.numeroDocumento;
      }
    }
    if (!nombreCliente) nombreCliente = "Cliente Mostrador";
    if (!nitCliente) nitCliente = "222222222";

    // 3. Mapear items al formato de POST /api/facturas
    const items = detallesValidos.map((d) => ({
      productoId: d.productoId ?? undefined,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      unidadMedida: "UND",
      precioUnitario: d.precioUnitario,
      descuentoPorcentaje: 0,
      tarifaIva: 0, // precios de comanda ya incluyen impuestos (POS)
    }));

    // 4. Llamada interna a /api/facturas (mismo servidor, reenviamos cookie)
    const facturasUrl = new URL("/api/facturas", req.url).toString();
    const facturaRes = await fetch(facturasUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        terceroId: data.terceroId,
        nombreCliente,
        nitCliente,
        items,
        esPOS: true,
        formaPago: data.formaPago ?? "efectivo",
        observaciones: `Comanda ${comanda.id.slice(-6).toUpperCase()} — Mesa ${comanda.mesa?.nombre ?? ""}`,
      }),
    });

    const facturaJson = await facturaRes.json();
    if (!facturaRes.ok) {
      return badRequest(
        facturaJson?.error ?? "Error al crear factura",
        facturaJson,
      );
    }

    // 5. Actualizar comanda y mesa
    await db.comanda.update({
      where: { id: comanda.id },
      data: {
        estado: "facturada",
        fechaCierre: new Date(),
      },
    });
    await db.mesa.update({
      where: { id: comanda.mesaId },
      data: { estado: "disponible" },
    });

    return ok({
      ok: true,
      comandaId: comanda.id,
      estado: "facturada",
      factura: facturaJson,
    });
  } catch (e) {
    return serverError("Error al facturar comanda", e);
  }
}
