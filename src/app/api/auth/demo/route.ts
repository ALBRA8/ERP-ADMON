import { ok, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { setSessionCookie, signToken } from "@/lib/auth";

// Helper para desarrollo: crea empresa + usuario demo y loguea.
export async function POST() {
  try {
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
