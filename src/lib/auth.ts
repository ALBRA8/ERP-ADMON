// ============================================================
// auth.ts — Autenticación y RBAC para Marsella ERP
// Mejora del informe Hermes §5.1: JWT en lugar de sesiones
// en memoria, RBAC granular, hash bcrypt.
// ============================================================
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { cookies } from "next/headers";

const APP_SECRET =
  process.env.APP_SECRET ||
  "marsella-erp-dev-secret-change-me-in-production-min-32-chars";

const SESSION_COOKIE = "marsella_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

// Roles y permisos (RBAC granular)
export const ROLES = {
  admin: {
    label: "Administrador",
    permissions: ["*"],
  },
  contador: {
    label: "Contador",
    permissions: [
      "terceros:read",
      "terceros:write",
      "contabilidad:*",
      "facturas:read",
      "compras:read",
      "compras:write",
      "cartera:read",
      "cartera:write",
      "reportes:read",
      "parametros:read",
    ],
  },
  cajero: {
    label: "Cajero / POS",
    permissions: [
      "facturas:write",
      "facturas:read",
      "terceros:read",
      "terceros:write",
      "productos:read",
      "cartera:read",
      "cartera:write",
      "recibos:write",
      "egresos:write",
    ],
  },
  vendedor: {
    label: "Vendedor",
    permissions: [
      "facturas:write",
      "facturas:read",
      "terceros:read",
      "terceros:write",
      "productos:read",
      "cartera:read",
    ],
  },
  bodeguero: {
    label: "Bodeguero",
    permissions: [
      "productos:read",
      "productos:write",
      "inventario:*",
      "compras:read",
    ],
  },
} as const;

export type RoleKey = keyof typeof ROLES;

export interface SessionPayload {
  userId: string;
  empresaId: string;
  email: string;
  nombre: string;
  rol: RoleKey;
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(APP_SECRET);
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ---------- Helpers HTTP ----------
export async function getSession(): Promise<SessionPayload | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  return verifyToken(cookie.value);
}

export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export function hasPermission(
  rol: RoleKey,
  permission: string,
): boolean {
  const role = ROLES[rol];
  if (!role) return false;
  if (role.permissions.includes("*")) return true;
  // wildcards tipo "contabilidad:*"
  const parts = permission.split(":");
  const moduleWildcard = `${parts[0]}:*`;
  if (role.permissions.includes(moduleWildcard)) return true;
  return role.permissions.includes(permission);
}

// ---------- Registro / Login ----------
export async function registerUser(params: {
  empresa: {
    nit: string;
    razonSocial: string;
    nombreComercial?: string;
    ciudad?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    representanteLegal?: string;
  };
  usuario: { nombre: string; email: string; password: string };
}) {
  const existing = await db.usuario.findUnique({
    where: { email: params.usuario.email.toLowerCase() },
  });
  if (existing) {
    return { error: "El correo ya está registrado" };
  }
  const existingEmpresa = await db.empresa.findUnique({
    where: { nit: params.empresa.nit },
  });
  if (existingEmpresa) {
    return { error: "El NIT ya está registrado" };
  }

  const passwordHash = await hashPassword(params.usuario.password);
  const empresa = await db.empresa.create({
    data: {
      nit: params.empresa.nit,
      razonSocial: params.empresa.razonSocial,
      nombreComercial: params.empresa.nombreComercial ?? null,
      ciudad: params.empresa.ciudad ?? null,
      direccion: params.empresa.direccion ?? null,
      telefono: params.empresa.telefono ?? null,
      email: params.empresa.email ?? null,
      representanteLegal: params.empresa.representanteLegal ?? null,
    },
  });
  const usuario = await db.usuario.create({
    data: {
      empresaId: empresa.id,
      email: params.usuario.email.toLowerCase(),
      nombre: params.usuario.nombre,
      passwordHash,
      rol: "admin",
    },
  });
  const token = await signToken({
    userId: usuario.id,
    empresaId: empresa.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: "admin",
  });
  await setSessionCookie(token);
  return { empresa, usuario, token };
}

export async function loginUser(email: string, password: string) {
  const usuario = await db.usuario.findUnique({
    where: { email: email.toLowerCase() },
    include: { empresa: true },
  });
  if (!usuario || !usuario.activo) {
    return { error: "Credenciales inválidas" };
  }
  const ok = await verifyPassword(password, usuario.passwordHash);
  if (!ok) {
    return { error: "Credenciales inválidas" };
  }
  await db.usuario.update({
    where: { id: usuario.id },
    data: { ultimoLogin: new Date() },
  });
  const token = await signToken({
    userId: usuario.id,
    empresaId: usuario.empresaId,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol as RoleKey,
  });
  await setSessionCookie(token);
  return { usuario, empresa: usuario.empresa, token };
}
