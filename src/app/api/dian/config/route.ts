import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession, requirePermission } from "@/lib/auth";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
} from "@/lib/api";
import { saveDIANConfig } from "@/lib/dian-real";
import { requireCsrf } from "@/lib/csrf";
import { auditAction } from "@/lib/tenant";
import { logInfo, logWarn } from "@/lib/logger";

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
    // FIX-SEGURIDAD H-CRIT-003: RBAC — solo admin puede configurar DIAN.
    const denied = await requirePermission(session, "dian:write");
    if (denied) return denied;
    // FIX-SEGURIDAD H-CRIT-006: CSRF protection.
    const csrfDenied = await requireCsrf(req);
    if (csrfDenied) return csrfDenied;

    const form = await req.formData();
    const ambiente = (form.get("ambiente") as string) || "pruebas";
    if (!["pruebas", "produccion"].includes(ambiente)) {
      return badRequest("Ambiente inválido (debe ser 'pruebas' o 'produccion')");
    }

    // FIX-SEGURIDAD H-MED-001: validar tamaño máximo del P12 (50KB)
    // para mitigar DoS por memoria.
    const file = form.get("certificadoP12") as File | null;
    if (file && file.size > 50 * 1024) {
      return badRequest("El certificado P12 es demasiado grande (máx 50KB)");
    }
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

    // FIX-SEGURIDAD H-ALT-008: auditar cambio de config DIAN.
    await auditAction(
      session,
      "dian_config_update",
      "configuracionDIAN",
      result.config?.id,
      { ambiente, tieneCertificado: !!p12B64 },
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      req.headers.get("user-agent")?.slice(0, 200) ?? null,
    );
    logInfo("dian config actualizada", {
      empresaId: session.empresaId,
      ambiente,
    });

    return ok({ config: result.config, mensaje: result.mensaje });
  } catch (e: any) {
    // Errores comunes: password incorrecta, P12 corrupto
    const msg = e?.message ?? String(e);
    logWarn("dian config error", { msg });
    if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("p12") || msg.toLowerCase().includes("pkcs")) {
      return badRequest("No se pudo cargar el certificado: " + msg);
    }
    return serverError("Error al guardar configuración DIAN", e);
  }
}
