import { NextRequest } from "next/server";
import { registerUser } from "@/lib/auth";
import { z } from "zod";
import { ok, badRequest, serverError } from "@/lib/api";

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
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const result = await registerUser(parsed.data);
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
    return serverError("Error al registrar empresa", e);
  }
}
