// ============================================================
// auth.ts — Autenticación y RBAC para Marsella ERP
// Mejora del informe Hermes §5.1: JWT en lugar de sesiones
// en memoria, RBAC granular, hash bcrypt.
//
// FIX-SEGURIDAD:
//   - H-CRIT-002: APP_SECRET fail-closed en producción.
//   - H-CRIT-003: requirePermission() helper para endpoints.
//   - H-CRIT-004: registerUser asigna plan "free" (no enterprise).
//   - H-CRIT-006: sameSite=strict en cookie de sesión.
//   - H-ALT-004: JWT incluye jti y se valida contra token-revocation.
//   - H-ALT-008: auditAction en login/register/logout (vía route handlers).
// ============================================================
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { isTokenRevoked, revokeToken } from "@/lib/token-revocation";

// ---------- H-CRIT-002: APP_SECRET fail-closed ----------
// Lazy validation: solo valida en runtime, no durante el build de Next.js.
const APP_SECRET_DEFAULT = "marsella-erp-dev-secret-change-me-in-production-min-32-chars";

function getAppSecret(): string {
  const env = process.env.APP_SECRET;
  const ok = !!env && env.length >= 32 && env !== APP_SECRET_DEFAULT;
  if (!ok) {
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE?.includes("build")) {
      throw new Error(
        "APP_SECRET debe estar configurada con al menos 32 caracteres en producción.",
      );
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("[auth] APP_SECRET no configurada, usando dev fallback.");
    }
    return APP_SECRET_DEFAULT;
  }
  return env!;
}

const APP_SECRET = getAppSecret();

const SESSION_COOKIE = "marsella_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

// Roles y permisos (RBAC granular).
// FIX-SEGURIDAD H-CRIT-003: se agregaron permisos granulares por módulo
// para que cajero/vendedor/bodeguero no puedan hacer operaciones
// administrativas (crear usuarios, configurar DIAN, gestionar MCP, etc.).
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
      "contabilidad:read",
      "contabilidad:write",
      "facturas:read",
      "compras:read",
      "compras:write",
      "cartera:read",
      "cartera:write",
      "nomina:read",
      "nomina:write",
      "reportes:read",
      "parametros:read",
      "parametros:write",
      "medios_magneticos:read",
      "medios_magneticos:write",
      "presupuesto:read",
      "presupuesto:write",
      "importaciones:write",
      "creditos:read",
      "creditos:write",
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
      "creditos:read",
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
      "creditos:read",
    ],
  },
  bodeguero: {
    label: "Bodeguero",
    permissions: [
      "productos:read",
      "productos:write",
      "inventario:read",
      "inventario:write",
      "compras:read",
      "compras:write",
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
  jti?: string;
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(APP_SECRET);
}

// ---------- H-ALT-004: JWT con jti para revocación ----------
export async function signToken(payload: SessionPayload): Promise<string> {
  const jti = payload.jti ?? randomUUID();
  return new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(jti)
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
    const session = payload as unknown as SessionPayload;
    // H-ALT-004: chequear revocación server-side.
    if (isTokenRevoked(session.jti ?? (payload as any).jti)) {
      return null;
    }
    return session;
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

// H-CRIT-006: sameSite=strict
export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

/**
 * revokeCurrentSession — Revoca el JWT actual (extrae el jti de la
 * cookie) y limpia la cookie. Usado en /api/auth/logout.
 * Retorna true si se revocó, false si no había sesión.
 */
export async function revokeCurrentSession(): Promise<boolean> {
  const c = await cookies();
  const cookie = c.get(SESSION_COOKIE);
  if (!cookie?.value) return false;
  // Decodificar el JWT sin verificar (ya vamos a borrar la cookie)
  // para extraer el jti y la expiración.
  try {
    const parts = cookie.value.split(".");
    if (parts.length === 3) {
      const payloadJson = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      );
      const jti = payloadJson.jti;
      const exp = payloadJson.exp; // segundos
      if (jti && exp) {
        revokeToken(jti, exp * 1000);
      }
    }
  } catch {
    // ignore — el token posiblemente esté corrupto
  }
  c.delete(SESSION_COOKIE);
  return true;
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

// ---------- H-CRIT-003: RBAC helper ----------
export function hasPermission(
  rol: RoleKey,
  permission: string,
): boolean {
  const role = ROLES[rol];
  if (!role) return false;
  // Cast a readonly string[]: al ser `as const`, `permissions` es una
  // unión de tuplas literales y .includes() queda tipado como `never`.
  const permissions = role.permissions as readonly string[];
  if (permissions.includes("*")) return true;
  // wildcards tipo "contabilidad:*"
  const parts = permission.split(":");
  const moduleWildcard = `${parts[0]}:*`;
  if (permissions.includes(moduleWildcard)) return true;
  return permissions.includes(permission);
}

/**
 * requirePermission — Helper para usar al inicio de handlers de API.
 * Retorna `null` si el usuario tiene el permiso, o `Response 403` si no.
 *
 * Uso:
 *   const session = await getSession();
 *   if (!session) return unauthorized();
 *   const denied = await requirePermission(session, "contabilidad:write");
 *   if (denied) return denied;
 */
export async function requirePermission(
  session: SessionPayload,
  permission: string,
): Promise<Response | null> {
  if (!hasPermission(session.rol, permission)) {
    return NextResponse.json(
      { error: `No tiene permisos para esta acción (requiere: ${permission})` },
      { status: 403 },
    );
  }
  return null;
}

// ---------- Registro / Login ----------
// H-CRIT-004: el primer usuario de una empresa es admin (founder),
// PERO el plan inicial es siempre "free" — no se autoasigna "enterprise".
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

  // H-CRIT-004: crear PlanSuscripcion inicial con plan="free".
  // Esto evita que el founder auto-asigne enterprise en el futuro
  // (ver /api/empresa/plan PUT que ahora valida SUPER_ADMIN_SECRET).
  try {
    await db.planSuscripcion.create({
      data: {
        empresaId: empresa.id,
        plan: "free",
        modulos: JSON.stringify(["facturacion", "terceros"]),
        limiteUsuarios: 3,
        limiteTerceros: 50,
        limiteProductos: 50,
        limiteFacturasMes: 50,
        estado: "activo",
      },
    });
  } catch {
    // Si ya existe (race o retry), ignorar.
  }

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
