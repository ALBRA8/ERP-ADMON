import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import {
  TIPOS_EVENTO_RADIAN,
  generarEventoRadianXML,
  calcularCUFEEvento,
  enviarEventoRadianADian,
  siguienteNumeroRadian,
  type TipoEventoRadian,
} from "@/lib/radian";
import { loadDIANConfigFromDB } from "@/lib/dian-real";

// ============================================================
// POST /api/radian/eventos/bulk
// Crea múltiples eventos Radian de golpe (útil para acuses
// masivos 030 sobre facturas de compra recibidas).
//
// Body: { eventos: [{ facturaCompraId, tipo, nitEmisor,
//   cufeFactura, terceroId?, observaciones? }] }
//
// Devuelve: { creados: N, errores: [{index, error}] }
//
// Transaccional por evento (no global): si uno falla, los demás
// se procesan. Cada evento se crea en estado `borrador` y se
// intenta enviar si hay config DIAN activa (igual que POST
// /api/radian/eventos).
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const eventos: any[] = Array.isArray(body?.eventos) ? body.eventos : null;
    if (!eventos || eventos.length === 0) {
      return badRequest("Se requiere un array no vacío de eventos");
    }
    if (eventos.length > 200) {
      return badRequest("Máximo 200 eventos por lote");
    }

    // Cargar empresa + config DIAN una sola vez
    const empresa = await db.empresa.findUnique({
      where: { id: session.empresaId },
    });
    const loaded = await loadDIANConfigFromDB(session.empresaId);
    const ambiente = loaded?.config.ambiente ?? "pruebas";

    let creados = 0;
    const errores: Array<{ index: number; error: string; data?: any }> = [];

    for (let i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      try {
        const { facturaCompraId, tipo, nitEmisor, cufeFactura, terceroId, observaciones } =
          ev ?? {};

        if (!tipo || !TIPOS_EVENTO_RADIAN.some((t) => t.code === tipo)) {
          throw new Error("tipo inválido");
        }
        if (!nitEmisor) {
          throw new Error("nitEmisor requerido");
        }
        if (!cufeFactura || String(cufeFactura).trim().length < 10) {
          throw new Error("cufeFactura requerido");
        }

        // Validar factura compra si viene
        let facturaCompra: any = null;
        if (facturaCompraId) {
          facturaCompra = await db.facturaCompra.findFirst({
            where: { id: facturaCompraId, empresaId: session.empresaId },
          });
          if (!facturaCompra) {
            throw new Error("facturaCompra no encontrada");
          }
        }

        // Número consecutivo
        const numero = await siguienteNumeroRadian(session.empresaId);

        const fechaEvento = new Date();
        const nitEmisorEvento = String(nitEmisor).trim();
        const nitReceptorEvento = empresa?.nit ?? "0";
        const razonSocialEmisorEvento =
          facturaCompra?.nombreProveedor ?? "PROVEEDOR";
        const razonSocialReceptorEvento = empresa?.razonSocial ?? "EMPRESA";

        const cufeEvento = calcularCUFEEvento({
          numEvento: numero,
          fecGen: fechaEvento.toISOString().slice(0, 10),
          horGen: `${String(fechaEvento.getHours()).padStart(2, "0")}:${String(
            fechaEvento.getMinutes(),
          ).padStart(2, "0")}:${String(fechaEvento.getSeconds()).padStart(
            2,
            "0",
          )}-05:00`,
          valTotal: "0.00",
          codDocEvento: String(tipo),
          nitEmisor: nitEmisorEvento,
          tipNotDoc: "E",
          nitReceptor: nitReceptorEvento,
          cufeFactura: String(cufeFactura).trim(),
          ambiente,
        });

        const xmlEvento = generarEventoRadianXML(
          {
            numero,
            tipo: tipo as TipoEventoRadian,
            fecha: fechaEvento,
            nitEmisor: nitEmisorEvento,
            razonSocialEmisor: razonSocialEmisorEvento,
            nitReceptor: nitReceptorEvento,
            razonSocialReceptor: razonSocialReceptorEvento,
            cufeFactura: String(cufeFactura).trim(),
            observaciones,
          },
          cufeEvento,
        );

        const created = await db.eventoRadian.create({
          data: {
            empresaId: session.empresaId,
            numero,
            facturaCompraId: facturaCompraId ?? null,
            tipo: String(tipo),
            fecha: fechaEvento,
            terceroId: terceroId ?? facturaCompra?.terceroId ?? null,
            nitEmisor: nitEmisorEvento,
            cufeFactura: String(cufeFactura).trim(),
            estado: "borrador",
            xmlEvento,
            respuestaDIAN: JSON.stringify({
              cufeEvento,
              generadoEn: fechaEvento.toISOString(),
              intentos: 0,
            }),
            observaciones: observaciones ?? null,
          },
        });

        // Intento de envío (no bloqueante)
        if (loaded) {
          try {
            await enviarEventoRadianADian(created.id, session.empresaId);
          } catch (e: any) {
            await db.eventoRadian
              .update({
                where: { id: created.id },
                data: {
                  estado: "borrador",
                  mensajeError:
                    "Error envío automático: " + (e?.message ?? String(e)),
                },
              })
              .catch(() => {
                /* ignore */
              });
          }
        }

        creados++;
      } catch (e: any) {
        errores.push({
          index: i,
          error: e?.message ?? String(e),
          data: ev,
        });
      }
    }

    return ok({
      creados,
      errores,
      total: eventos.length,
    });
  } catch (e) {
    return serverError("Error en creación masiva de eventos Radian", e);
  }
}
