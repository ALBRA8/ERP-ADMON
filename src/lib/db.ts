import { PrismaClient } from "@prisma/client";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

declare global {
  var __db: PrismaClient | undefined;
  var __dbSchemaHash: string | undefined;
}

// Hash simple del schema.prisma en node_modules/.prisma/client/ para
// detectar cuándo `prisma generate` regeneró el Prisma Client. Si el
// hash cambia o faltan modelos esperados, invalidamos el singleton
// global.__db para que se cree una nueva instancia con la definición
// actualizada. Sin esto, tras `prisma db push` el dev server sigue
// usando la clase PrismaClient cacheada por Turbopack y los modelos
// nuevos no son accesibles.
function schemaHash(): string {
  try {
    const p = join(
      process.cwd(),
      "node_modules/.prisma/client/schema.prisma",
    );
    if (!existsSync(p)) return "no-schema";
    const stat = statSync(p);
    return `${stat.size}-${stat.mtime.getTime()}`;
  } catch {
    return "err";
  }
}

function hasAllModels(client: PrismaClient | undefined): boolean {
  if (!client) return false;
  const required = [
    "empresa",
    "usuario",
    "facturaVenta",
    "configuracionDIAN",
    "dIANEnvio",
    "mCPConexion",
    "mCPLog",
    "nomina",
    "nominaConcepto",
    "detalleNomina",
    "retencionFuenteTabla",
  ];
  return required.every((m) => (client as any)[m] !== undefined);
}

const currentHash = schemaHash();
const schemaChanged = global.__dbSchemaHash !== currentHash;
const missingModels = !hasAllModels(global.__db);

if (global.__db && (schemaChanged || missingModels)) {
  console.log(
    "[db] Invalidando cached prisma client - schemaChanged=",
    schemaChanged,
    "missingModels=",
    missingModels,
  );
  try {
    void global.__db.$disconnect();
  } catch {
    /* ignore */
  }
  global.__db = undefined;
}

export const db =
  global.__db ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__db = db;
  global.__dbSchemaHash = currentHash;
}
