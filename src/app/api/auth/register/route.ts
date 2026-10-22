import { NextRequest } from "next/server";
import { registerUser } from "@/lib/auth";
import { z } from "zod";
import { ok, badRequest, serverError } from "@/lib/api";
import { auditAction } from "@/lib/tenant";
import { logInfo } from "@/lib/logger";

const schema = z.object({
  empresa: z.object({
    nit: z.string().min(5),
    razonSocial: z.string().min(2),
    nombreComercial: z.string().optional(),
    ciudad: z.string().optional(),
    direccion: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().email().optional(),
    representanteLegal: z.string().optional(),
  }),
  usuario: z.object({
    nombre: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  }),
});

export async function POST(req: NextRequest) {
  try {
    let body; try { body = await req.json(); } catch { return badRequest("JSON inválido"); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const result = await registerUser(parsed.data);
    if ("error" in result) {
      return badRequest(result.error ?? "Error al registrar empresa");
    }

    // H-ALT-008: auditar registro de empresa nueva.
    await auditAction(
      {
        userId: result.usuario.id,
        empresaId: result.empresa.id,
        email: result.usuario.email,
        nombre: result.usuario.nombre,
        rol: result.usuario.rol as any,
      },
      "empresa_register",
      "empresa",
      result.empresa.id,
      { nit: result.empresa.nit, razonSocial: result.empresa.razonSocial },
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      req.headers.get("user-agent")?.slice(0, 200) ?? null,
    );
    logInfo("empresa registrada", {
      empresaId: result.empresa.id,
      nit: result.empresa.nit,
    });

    return ok({
      usuario: {
        id: result.usuario.id,
        email: result.usuario.email,
        nombre: result.usuario.nombre,
        rol: result.usuario.rol,
      },
      empresa: {
        id: result.empresa.id,
        nit: result.empresa.nit,
        razonSocial: result.empresa.razonSocial,
        nombreComercial: result.empresa.nombreComercial,
      },
    });
  } catch (e) {
    return serverError("Error al registrar empresa", e);
  }
}
