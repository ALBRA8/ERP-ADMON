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
import { round } from "@/lib/currency";

// ============================================================
// POST /api/nomina/[id]/pagar
// Cambia el estado de la nómina a "pagada" y genera un
// comprobante de egreso asociado (CE-YYYY-NNNNNN) que descuenta
// el pasivo "Salarios por pagar" (250505) contra Bancos (111005).
// ============================================================
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const { id } = await params;
    if (!id) return badRequest("id requerido");

    const nomina = await db.nomina.findFirst({
      where: { id, empresaId: session.empresaId },
      include: { detalles: true },
    });
    if (!nomina) return notFound("Nómina no encontrada");

    if (nomina.estado === "anulada") {
      return badRequest("La nómina está anulada, no se puede pagar");
    }
    if (nomina.estado === "pagada") {
      return badRequest("La nómina ya está pagada");
    }
    if (nomina.estado !== "causada") {
      return badRequest("La nómina debe estar causada antes de pagarla");
    }

    // Generar comprobante de egreso CE-YYYY-NNNNNN
    const year = new Date().getFullYear();
    const cnt = await db.comprobanteEgreso.count({
      where: {
        empresaId: session.empresaId,
        numero: { startsWith: `CE-${year}-` },
      },
    });
    const numeroCE = `CE-${year}-${String(cnt + 1).padStart(6, "0")}`;
    const fecha = new Date();

    const nombreEmpleados = nomina.detalles
      .map((d) => {
        // Buscar nombre del tercero
        return `Empleado ${d.terceroId.slice(-6)}`;
      })
      .join(", ");

    const egreso = await db.comprobanteEgreso.create({
      data: {
        empresaId: session.empresaId,
        numero: numeroCE,
        nombreTercero: `Nómina ${nomina.numero} (${nomina.detalles.length} empleados)`,
        fecha,
        valorTotal: round(nomina.netoAPagar, 2),
        concepto: `Pago de nómina ${nomina.numero}`,
        formaPago: "transferencia",
        estado: "vigente",
      },
    });

    // Generar asiento contable: débito 250505 (Salarios por pagar) / crédito 111005 (Bancos)
    const cuentaSalariosPorPagar = await db.cuentaPuc.findUnique({
      where: { codigo: "250505" },
    });
    const cuentaBancos = await db.cuentaPuc.findUnique({
      where: { codigo: "111005" },
    });
    if (cuentaSalariosPorPagar && cuentaBancos) {
      const cntCG = await db.comprobante.count({
        where: {
          empresaId: session.empresaId,
        },
      });
      const numeroCG = `CG-${year}-${String(cntCG + 1).padStart(6, "0")}`;
      const comprobante = await db.comprobante.create({
        data: {
          empresaId: session.empresaId,
          numero: numeroCG,
          tipo: "tesoreria",
          fecha,
          descripcion: `Pago nómina ${nomina.numero} (egreso ${numeroCE})`,
          totalDebito: round(nomina.netoAPagar, 2),
          totalCredito: round(nomina.netoAPagar, 2),
          diferencia: 0,
          estado: "contabilizado",
          documentoOrigenId: nomina.id,
          documentoOrigenTipo: "PAGO_NOMINA",
        },
      });
      await db.movimientoContable.create({
        data: {
          empresaId: session.empresaId,
          comprobanteId: comprobante.id,
          cuentaId: cuentaSalariosPorPagar.id,
          descripcion: `Pago nómina ${nomina.numero}`,
          debito: round(nomina.netoAPagar, 2),
          credito: 0,
          fecha,
        },
      });
      await db.movimientoContable.create({
        data: {
          empresaId: session.empresaId,
          comprobanteId: comprobante.id,
          cuentaId: cuentaBancos.id,
          descripcion: `Egreso ${numeroCE} — pago nómina ${nomina.numero}`,
          debito: 0,
          credito: round(nomina.netoAPagar, 2),
          fecha,
        },
      });
    }

    await db.nomina.update({
      where: { id },
      data: { estado: "pagada" },
    });

    return ok({
      ok: true,
      id,
      estado: "pagada",
      egreso: { numero: numeroCE, id: egreso.id, valorTotal: egreso.valorTotal },
    });
  } catch (e) {
    return serverError("Error al pagar nómina", e);
  }
}
