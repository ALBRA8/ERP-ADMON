import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
} from "@/lib/api";
import { getSession, requirePermission } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { auditAction } from "@/lib/tenant";

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
    // FIX-SEGURIDAD H-CRIT-003: RBAC — anular factura requiere facturas:write.
    const denied = await requirePermission(session, "facturas:write");
    if (denied) return denied;
    // FIX-SEGURIDAD H-CRIT-006: CSRF protection.
    const csrfDenied = await requireCsrf(req);
    if (csrfDenied) return csrfDenied;
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
      if (factura.terceroId && Number(factura.saldoPendiente) > 0) {
        await db.tercero.update({
          where: { id: factura.terceroId },
          data: {
            saldoCartera: { decrement: Number(factura.saldoPendiente) },
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

      // FIX-SEGURIDAD H-ALT-008: auditar anulación de factura.
      await auditAction(
        session,
        "factura_anular",
        "facturaVenta",
        factura.id,
        { numero: factura.numero, total: factura.total },
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        req.headers.get("user-agent")?.slice(0, 200) ?? null,
      );

      return ok({ ok: true, estado: "anulada", id: factura.id });
    }

    return badRequest("Acción no soportada (use accion='anular')");
  } catch (e) {
    return serverError("Error al anular factura", e);
  }
}
