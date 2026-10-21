import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, requirePermission } from "@/lib/auth";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  notFound,
  getQuery,
  getQueryInt,
} from "@/lib/api";
import { requireCsrf } from "@/lib/csrf";
import { auditAction } from "@/lib/tenant";
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
// GET /api/radian/eventos
// Lista eventos Radian con filtros (tipo, estado, rango de
// fechas, terceroId, q por CUFE/número/NIT) + paginación.
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const page = getQueryInt(req, "page", 1) ?? 1;
    const pageSize = getQueryInt(req, "pageSize", 25) ?? 25;
    const tipo = getQuery(req, "tipo");
    const estado = getQuery(req, "estado");
    const fechaInicio = getQuery(req, "fechaInicio");
    const fechaFin = getQuery(req, "fechaFin");
    const terceroId = getQuery(req, "terceroId");
    const q = getQuery(req, "q");

    const where: any = { empresaId: session.empresaId };
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (terceroId) where.terceroId = terceroId;
    if (fechaInicio || fechaFin) {
      where.fecha = {};
      if (fechaInicio) where.fecha.gte = new Date(fechaInicio);
      if (fechaFin) where.fecha.lte = new Date(fechaFin + "T23:59:59");
    }
    if (q) {
      where.OR = [
        { numero: { contains: q } },
        { cufeFactura: { contains: q } },
        { nitEmisor: { contains: q } },
        { trackId: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      db.eventoRadian.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.eventoRadian.count({ where }),
    ]);

    return ok({ items, total, page, pageSize });
  } catch (e) {
    return serverError("Error al listar eventos Radian", e);
  }
}

// ============================================================
// POST /api/radian/eventos
// Crea un evento Radian. Body:
//   { facturaCompraId?, tipo, nitEmisor, cufeFactura,
//     terceroId?, observaciones? }
//
// Flujo:
//   1. Genera número consecutivo RAD-YYYY-NNNNNN
//   2. Genera XML UBL del evento
//   3. Calcula CUFE del evento (SHA-384)
//   4. Guarda en estado `borrador`
//   5. Si empresa tiene ConfiguracionDIAN activa, intenta
//      enviar automáticamente. Si falla, queda en `borrador`
//      con mensajeError claro (mismo patrón que módulo DIAN).
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // FIX-SEGURIDAD H-CRIT-003: RBAC — dian:write (solo admin puede gestionar eventos Radian).
    const denied = await requirePermission(session, "dian:write");
    if (denied) return denied;
    // FIX-SEGURIDAD H-CRIT-006: CSRF protection.
    const csrfDenied = await requireCsrf(req);
    if (csrfDenied) return csrfDenied;

    const body = await req.json();
    const { facturaCompraId, tipo, nitEmisor, cufeFactura, terceroId, observaciones } =
      body ?? {};

    // ---------- Validaciones ----------
    if (!tipo) return badRequest("tipo requerido (030|031|...|036)");
    if (!TIPOS_EVENTO_RADIAN.some((t) => t.code === tipo)) {
      return badRequest("tipo inválido. Valores: 030, 031, 032, 033, 034, 035, 036");
    }
    if (!nitEmisor || String(nitEmisor).trim() === "") {
      return badRequest("nitEmisor requerido (NIT del proveedor que emitió la factura)");
    }
    if (!cufeFactura || String(cufeFactura).trim().length < 10) {
      return badRequest("cufeFactura requerido (CUFE de la factura electrónica recibida)");
    }

    // Si viene facturaCompraId, validar que exista y pertenezca a
    // la empresa
    let facturaCompra: any = null;
    if (facturaCompraId) {
      facturaCompra = await db.facturaCompra.findFirst({
        where: { id: facturaCompraId, empresaId: session.empresaId },
      });
      if (!facturaCompra) {
        return notFound("Factura de compra no encontrada");
      }
    }

    // ---------- Generar número consecutivo ----------
    const numero = await siguienteNumeroRadian(session.empresaId);

    // ---------- Datos del evento ----------
    const fechaEvento = new Date();
    const empresa = await db.empresa.findUnique({
      where: { id: session.empresaId },
    });

    // nitEmisor en el evento Radian es el NIT del proveedor que
    // emitió la factura original (receptor del evento). El
    // emisor del evento es la empresa compradora (session.empresa).
    // Para mantener el campo tal como está en el modelo EventoRadian
    // (nitEmisor = NIT del proveedor que emitió la factura), usamos
    // el body.nitEmisor.
    const nitEmisorEvento = String(nitEmisor).trim();
    const nitReceptorEvento = empresa?.nit ?? "0"; // empresa compradora
    const razonSocialEmisorEvento = facturaCompra?.nombreProveedor ?? "PROVEEDOR";
    const razonSocialReceptorEvento = empresa?.razonSocial ?? "EMPRESA";

    // ---------- Cargar config DIAN ----------
    const loaded = await loadDIANConfigFromDB(session.empresaId);
    const ambiente = loaded?.config.ambiente ?? "pruebas";

    // ---------- Calcular CUFE del evento ----------
    const valTotal = "0.00"; // eventos no tienen valor monetario
    const cufeEvento = calcularCUFEEvento({
      numEvento: numero,
      fecGen: fechaEvento.toISOString().slice(0, 10),
      horGen: `${String(fechaEvento.getHours()).padStart(2, "0")}:${String(
        fechaEvento.getMinutes(),
      ).padStart(2, "0")}:${String(fechaEvento.getSeconds()).padStart(2, "0")}-05:00`,
      valTotal,
      codDocEvento: String(tipo),
      nitEmisor: nitEmisorEvento,
      tipNotDoc: "E",
      nitReceptor: nitReceptorEvento,
      cufeFactura: String(cufeFactura).trim(),
      ambiente,
    });

    // ---------- Generar XML ----------
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

    // ---------- Guardar en estado borrador ----------
    const evento = await db.eventoRadian.create({
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
        trackId: null,
        mensajeError: null,
        observaciones: observaciones ?? null,
      },
    });

    // ---------- Intento de envío automático ----------
    // Si la empresa tiene ConfiguracionDIAN activa con certificado
    // cargado, intentar enviar. Si falla (sin credenciales PAC, o
    // error de red), el evento queda en `borrador` con mensajeError
    // claro (mismo patrón que módulo DIAN existente).
    let envioResult: { ok: boolean; trackId?: string; mensaje?: string } | null = null;
    if (loaded) {
      try {
        const res = await enviarEventoRadianADian(evento.id, session.empresaId);
        envioResult = {
          ok: res.ok,
          trackId: res.trackId,
          mensaje: res.mensajeError,
        };
      } catch (e: any) {
        envioResult = {
          ok: false,
          mensaje: "Error enviando evento: " + (e?.message ?? String(e)),
        };
        // Guardar mensajeError si la función no lo hizo
        await db.eventoRadian
          .update({
            where: { id: evento.id },
            data: { estado: "borrador", mensajeError: envioResult.mensaje ?? null },
          })
          .catch(() => {
            /* ignore */
          });
      }
    } else {
      envioResult = {
        ok: false,
        mensaje:
          "No hay configuración DIAN activa con certificado cargado. Sube tu .p12 en Facturación DIAN. El evento quedó en borrador.",
      };
      await db.eventoRadian.update({
        where: { id: evento.id },
        data: { estado: "borrador", mensajeError: envioResult.mensaje },
      });
    }

    // Recargar el evento con su estado final
    const eventoFinal = await db.eventoRadian.findUnique({
      where: { id: evento.id },
    });

    // FIX-SEGURIDAD H-ALT-008: auditar creación de evento Radian.
    await auditAction(
      session,
      "radian_evento_create",
      "eventoRadian",
      evento.id,
      {
        tipo: String(tipo),
        numero,
        nitEmisor: nitEmisorEvento,
        envioAutomatico: envioResult?.ok,
        trackId: envioResult?.trackId,
      },
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      req.headers.get("user-agent")?.slice(0, 200) ?? null,
    );

    return ok({
      evento: eventoFinal,
      envioAutomatico: envioResult,
    });
  } catch (e) {
    return serverError("Error al crear evento Radian", e);
  }
}
