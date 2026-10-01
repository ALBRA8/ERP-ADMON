import { NextRequest } from "next/server";
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
// GET /api/facturas/[id]
// Devuelve la factura con detalles + tercero.
// ============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    if (!id) return badRequest("id requerido");

    const factura = await db.facturaVenta.findFirst({
      where: { id, empresaId: session.empresaId },
      include: {
        detalles: { orderBy: { id: "asc" } },
        tercero: true,
      },
    });
    if (!factura) return notFound("Factura no encontrada");

    return ok(factura);
  } catch (e) {
    return serverError("Error al obtener factura", e);
  }
}

// ============================================================
// PUT /api/facturas/[id]
// Permite anular una factura (estado="anulada"). No elimina el
// registro (auditoría) pero revierte saldos de cartera y tercero.
// Body: { accion?: "anular" }  (default "anular")
// ============================================================
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    if (!id) return badRequest("id requerido");

    const body = await req.json().catch(() => ({}));
    const accion: string = body?.accion ?? "anular";

    const factura = await db.facturaVenta.findFirst({
      where: { id, empresaId: session.empresaId },
    });
    if (!factura) return notFound("Factura no encontrada");
    if (factura.estado === "anulada")
      return badRequest("La factura ya está anulada");

    if (accion === "anular") {
      // 1. Marcar como anulada
      await db.facturaVenta.update({
        where: { id: factura.id },
        data: {
          estado: "anulada",
          estadoCartera: "anulada",
          saldoPendiente: 0,
        },
      });

      // 2. Revertir cartera del tercero si hubo saldo
      if (factura.terceroId && factura.saldoPendiente > 0) {
        await db.tercero.update({
          where: { id: factura.terceroId },
          data: {
            saldoCartera: { decrement: factura.saldoPendiente },
          },
        });
      }

      // 3. Anular comprobante contable asociado (si existe)
      await db.comprobante.updateMany({
        where: {
          empresaId: session.empresaId,
          documentoOrigenId: factura.id,
          documentoOrigenTipo: "FACTURA_VENTA",
          estado: "contabilizado",
        },
        data: { estado: "anulado" },
      });

      return ok({ ok: true, estado: "anulada", id: factura.id });
    }

    return badRequest("Acción no soportada (use accion='anular')");
  } catch (e) {
    return serverError("Error al anular factura", e);
  }
}
