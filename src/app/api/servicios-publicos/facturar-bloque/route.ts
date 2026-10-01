import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, badRequest, serverError, unauthorized, notFound } from "@/lib/api";
import { getSession } from "@/lib/auth";

// ============================================================
// POST /api/servicios-publicos/facturar-bloque
// Body: { bloqueFacturacionId }
// Toma todas las lecturas no facturadas del bloque, para cada una
// genera una FacturaVenta (POST /api/facturas con tercero del usuario).
// Calcula valor = (cargoFijo) + (consumo * tarifaVariable).
// Marca lectura como facturada. Devuelve { facturas, totalFacturado }
// ============================================================

const schema = z.object({
  bloqueFacturacionId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return badRequest("Datos inválidos", parsed.error.flatten());
    const { bloqueFacturacionId } = parsed.data;

    const bloque = await db.bloqueFacturacion.findFirst({
      where: { id: bloqueFacturacionId, empresaId: session.empresaId },
    });
    if (!bloque) return notFound("Bloque de facturación no encontrado");

    const lecturas = await db.lecturaMedidor.findMany({
      where: {
        empresaId: session.empresaId,
        bloqueFacturacionId,
        facturada: false,
      },
      include: { usuarioServicio: true },
    });

    let facturas = 0;
    let totalFacturado = 0;
    const errores: { lecturaId: string; error: string }[] = [];

    for (const lectura of lecturas) {
      try {
        const u = lectura.usuarioServicio;
        if (!u) {
          errores.push({
            lecturaId: lectura.id,
            error: "Sin usuario asociado",
          });
          continue;
        }
        const cargoFijo = u.tarifaFija ?? 0;
        const consumo = lectura.consumo ?? 0;
        const valor = cargoFijo + consumo * (u.tarifaVariable ?? 0);

        // Resolver cliente
        let nombreCliente = `Usuario ${u.numeroContrato}`;
        let nitCliente = "222222222";
        let terceroId = u.terceroId ?? undefined;
        if (u.terceroId) {
          const t = await db.tercero.findUnique({
            where: { id: u.terceroId },
          });
          if (t) {
            nombreCliente = t.nombre;
            nitCliente = t.numeroDocumento;
          }
        }

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
            items: [
              {
                descripcion: `Servicio público — Consumo ${consumo} (Bloque ${bloque.codigo})`,
                cantidad: 1,
                unidadMedida: "UND",
                precioUnitario: valor,
                descuentoPorcentaje: 0,
                tarifaIva: 0,
              },
            ],
            esPOS: false,
            formaPago: "credito",
            observaciones: `Lectura ${lectura.id.slice(-6).toUpperCase()} — bloque ${bloque.codigo}`,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          errores.push({
            lecturaId: lectura.id,
            error: json?.error ?? "Error al crear factura",
          });
          continue;
        }
        // Marcar lectura facturada
        await db.lecturaMedidor.update({
          where: { id: lectura.id },
          data: {
            facturada: true,
            facturaId: json.id ?? null,
          },
        });
        facturas++;
        totalFacturado += valor;
      } catch (e: any) {
        errores.push({
          lecturaId: lectura.id,
          error: e?.message ?? "Error inesperado",
        });
      }
    }

    return ok({
      facturas,
      totalFacturado,
      totalLecturas: lecturas.length,
      errores,
    });
  } catch (e) {
    return serverError("Error al facturar bloque", e);
  }
}
