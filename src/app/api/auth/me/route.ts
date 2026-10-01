import { ok, unauthorized, serverError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    const empresa = await db.empresa.findUnique({
      where: { id: session.empresaId },
    });
    return ok({
      usuario: {
        id: session.userId,
        email: session.email,
        nombre: session.nombre,
        rol: session.rol,
      },
      empresa: empresa
        ? {
            id: empresa.id,
            nit: empresa.nit,
            razonSocial: empresa.razonSocial,
            nombreComercial: empresa.nombreComercial,
            ciudad: empresa.ciudad,
            moneda: empresa.moneda,
            decimales: empresa.decimales,
            regimenTributario: empresa.regimenTributario,
            responsabilidad: empresa.responsabilidad,
            representanteLegal: empresa.representanteLegal,
            direccion: empresa.direccion,
            telefono: empresa.telefono,
            email: empresa.email,
            logo: empresa.logo,
          }
        : null,
    });
  } catch (e) {
    return serverError("Error al obtener sesión", e);
  }
}
