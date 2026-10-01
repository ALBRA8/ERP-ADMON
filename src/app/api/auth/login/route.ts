import { NextRequest } from "next/server";
import { loginUser } from "@/lib/auth";
import { z } from "zod";
import { ok, badRequest, serverError } from "@/lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const result = await loginUser(parsed.data.email, parsed.data.password);
    if ("error" in result) {
      return badRequest(result.error);
    }
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
    return serverError("Error al iniciar sesión", e);
  }
}
