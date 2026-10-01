// ============================================================
// MARSELLA ERP — API /api/usuarios
// GET  : lista usuarios de la empresa de la sesión
// POST : crea un usuario nuevo (sólo admin) con password hasheada
//        usando hashPassword de @/lib/crypto (bcryptjs 12 rounds)
// Valida sesión con getSession() y filtra SIEMPRE por empresaId.
// ============================================================
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ok,
  badRequest,
  serverError,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";

// ---------- GET ----------
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const usuarios = await db.usuario.findMany({
      where: { empresaId: session.empresaId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        telefono: true,
        cargo: true,
        ultimoLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return ok(usuarios);
  } catch (e) {
    return serverError("Error al listar usuarios", e);
  }
}

// ---------- POST ----------
const userCreateSchema = z.object({
  email: z.string().email(),
  nombre: z.string().min(2),
  rol: z.enum(["admin", "contador", "cajero", "vendedor", "bodeguero"]),
  password: z.string().min(6),
  telefono: z.string().optional(),
  cargo: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (session.rol !== "admin") {
      return forbidden("Sólo el administrador puede crear usuarios");
    }

    const body = await req.json();
    const parsed = userCreateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos inválidos", parsed.error.flatten());
    }
    const d = parsed.data;

    // Email único (global — Usuario @unique en schema)
    const existente = await db.usuario.findUnique({
      where: { email: d.email.toLowerCase() },
    });
    if (existente) {
      return badRequest("Ya existe un usuario con ese correo");
    }

    const passwordHash = await hashPassword(d.password);
    const nuevo = await db.usuario.create({
      data: {
        empresaId: session.empresaId,
        email: d.email.toLowerCase(),
        nombre: d.nombre,
        rol: d.rol,
        passwordHash,
        telefono: d.telefono ?? null,
        cargo: d.cargo ?? null,
        activo: true,
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        telefono: true,
        cargo: true,
        ultimoLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return ok(nuevo);
  } catch (e) {
    return serverError("Error al crear usuario", e);
  }
}
