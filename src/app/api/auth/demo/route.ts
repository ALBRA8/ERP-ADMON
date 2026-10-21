import { ok, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { setSessionCookie, signToken } from "@/lib/auth";
import { logWarn } from "@/lib/logger";

// Helper para desarrollo: crea empresa + usuario demo y loguea.
// FIX-SEGURIDAD H-CRIT-001: bloqueado en producción a menos que
// ENABLE_DEMO_ENDPOINT=true se setee explícitamente.
export async function POST() {
  // Guard de entorno: bloquear en producción salvo opt-in explícito.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEMO_ENDPOINT !== "true"
  ) {
    return new Response(
      JSON.stringify({ error: "Demo endpoint disabled in production" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  try {
    logWarn("demo endpoint invocado", {
      env: process.env.NODE_ENV,
      flag: process.env.ENABLE_DEMO_ENDPOINT,
    });
    const existingEmpresa = await db.empresa.findUnique({
      where: { nit: "900.123.456-7" },
    });
    let empresa = existingEmpresa;
    if (!empresa) {
      empresa = await db.empresa.create({
        data: {
          nit: "900.123.456-7",
          razonSocial: "Marsella S.A.S. (Demo)",
          nombreComercial: "Marsella ERP",
          ciudad: "Medellín",
          direccion: "Calle 50 # 45-67",
          telefono: "+57 604 555-1234",
          email: "info@marsellasas.com",
          representanteLegal: "Johan Marsella",
        },
      });
      const existingUser = await db.usuario.findUnique({
        where: { email: "demo@marsella.com" },
      });
      if (!existingUser) {
        const { hashPassword } = await import("@/lib/crypto");
        await db.usuario.create({
          data: {
            empresaId: empresa.id,
            email: "demo@marsella.com",
            nombre: "Johan Marsella",
            passwordHash: await hashPassword("demo1234"),
            rol: "admin",
          },
        });
      }
    }
    const usuario = await db.usuario.findUnique({
      where: { email: "demo@marsella.com" },
    });
    if (!usuario) return serverError("Usuario demo no creado");
    const token = await signToken({
      userId: usuario.id,
      empresaId: empresa.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol as any,
    });
    await setSessionCookie(token);
    return ok({
      empresa: {
        id: empresa.id,
        nit: empresa.nit,
        razonSocial: empresa.razonSocial,
      },
      usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      message: "Sesión demo iniciada (demo@marsella.com / demo1234)",
    });
  } catch (e) {
    return serverError("Error al iniciar demo", e);
  }
}
