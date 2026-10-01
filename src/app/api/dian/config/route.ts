import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ok, badRequest, serverError, unauthorized } from "@/lib/api";
import { saveDIANConfig } from "@/lib/dian-real";

// ============================================================
// GET /api/dian/config
// Devuelve la configuración DIAN de la empresa (sin secretos, solo
// metadatos para mostrar en el UI).
// ============================================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const records = await db.configuracionDIAN.findMany({
      where: { empresaId: session.empresaId },
      orderBy: { updatedAt: "desc" },
    });
    // No exponer el P12 ni el password ni el token. Solo metadatos.
    const safe = records.map((r) => ({
      id: r.id,
      ambiente: r.ambiente,
      activo: r.activo,
      tieneCertificado: Boolean(r.certificadoP12Enc),
      certificadoSubject: r.certificadoSubject,
      certificadoValidFrom: r.certificadoValidFrom,
      certificadoValidTo: r.certificadoValidTo,
      proveedorTecnologicoNit: r.proveedorTecnologicoNit,
      tieneTokenPAC: Boolean(r.proveedorTecnologicoTokenEnc),
      softwareId: r.softwareId,
      tieneSoftwarePin: Boolean(r.softwarePin),
      webhookUrl: r.webhookUrl,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }));
    return ok({ items: safe });
  } catch (e) {
    return serverError("Error al leer configuración DIAN", e);
  }
}

// ============================================================
// PUT /api/dian/config
// Recibe multipart/form-data con:
//   - certificadoP12 (file, .p12)
//   - password (string)
//   - ambiente (pruebas | produccion)
//   - softwareId, softwarePin, proveedorTecnologicoNit,
//     proveedorTecnologicoToken, webhookUrl
// Cifra P12 y password con AES-256-GCM antes de guardar.
// Valida que el certificado cargue correctamente y extrae subject/validFrom/validTo.
// ============================================================
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const form = await req.formData();
    const ambiente = (form.get("ambiente") as string) || "pruebas";
    if (!["pruebas", "produccion"].includes(ambiente)) {
      return badRequest("Ambiente inválido (debe ser 'pruebas' o 'produccion')");
    }

    const file = form.get("certificadoP12") as File | null;
    const password = (form.get("password") as string) || "";
    const proveedorTecnologicoNit =
      (form.get("proveedorTecnologicoNit") as string) || undefined;
    const proveedorTecnologicoToken =
      (form.get("proveedorTecnologicoToken") as string) || undefined;
    const softwareId = (form.get("softwareId") as string) || undefined;
    const softwarePin = (form.get("softwarePin") as string) || undefined;
    const webhookUrl = (form.get("webhookUrl") as string) || undefined;
    const activoStr = (form.get("activo") as string) || "true";
    const activo = activoStr === "true" || activoStr === "1";

    let p12B64: string | undefined;
    if (file && file.size > 0) {
      if (!password) {
        return badRequest("La contraseña del certificado es obligatoria");
      }
      const buf = Buffer.from(await file.arrayBuffer());
      p12B64 = buf.toString("base64");
    }

    const result = await saveDIANConfig({
      empresaId: session.empresaId,
      ambiente: ambiente as "pruebas" | "produccion",
      certificadoP12B64: p12B64,
      certificadoPassword: password || undefined,
      proveedorTecnologicoNit,
      proveedorTecnologicoToken,
      softwareId,
      softwarePin,
      webhookUrl,
      activo,
    });

    if (!result.ok) {
      return badRequest(result.mensaje);
    }
    return ok({ config: result.config, mensaje: result.mensaje });
  } catch (e: any) {
    // Errores comunes: password incorrecta, P12 corrupto
    const msg = e?.message ?? String(e);
    if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("p12") || msg.toLowerCase().includes("pkcs")) {
      return badRequest("No se pudo cargar el certificado: " + msg);
    }
    return serverError("Error al guardar configuración DIAN", e);
  }
}
