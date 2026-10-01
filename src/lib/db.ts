import { PrismaClient } from "@prisma/client";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Force HMR refresh — touch marker for radian module loader.

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
    "banco",
    "cuentaBancaria",
    "movimientoBancario",
    "extractoBancario",
    "extractoMovimiento",
    "conciliacionBancaria",
    "cajaPOS",
    "arqueoCaja",
    "mesa",
    "comanda",
    "detalleComanda",
    "habitacion",
    "reservaHotel",
    "finca",
    "compraCafe",
    "controlCalidadCafe",
    "pruebaTaza",
    "usuarioServicio",
    "bloqueFacturacion",
    "lecturaMedidor",
    "tarifaServicio",
    "ordenServicioTecnico",
    "detalleServicioTecnico",
    "vehiculo",
    "mascota",
    "ordenProduccion",
    "detalleOrdenProduccion",
    "recetaProducto",
    "recetaIngrediente",
    "eventoRadian",
  ];
  return required.every((m) => (client as any)[m] !== undefined);
}

const currentHash = schemaHash();
const schemaChanged = global.__dbSchemaHash !== currentHash;
const missingModels = !hasAllModels(global.__db);

// Cuando se detecta schema cambiado o modelos faltantes, además de
// invalidar el singleton global.__db, forzamos la recarga del módulo
// @prisma/client desde disco (borrándolo del require.cache de Node.js).
// Sin este paso, `new PrismaClient(...)` instancia la clase cacheada en
// memoria (que NO incluye los modelos nuevos) y el ciclo se repite.
function bustPrismaClientCacheAndReload(): typeof PrismaClient {
  try {
    const pathsToDelete: string[] = [];
    for (const spec of [
      "@prisma/client",
      "@prisma/client/default",
      ".prisma/client",
      ".prisma/client/default",
    ]) {
      try {
        const resolved = require.resolve(spec);
        pathsToDelete.push(resolved);
      } catch {
        /* módulo no encontrado, ignorar */
      }
    }
    for (const p of pathsToDelete) {
      if (require.cache && require.cache[p]) {
        delete require.cache[p];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh = require("@prisma/client");
    return (fresh as any).PrismaClient ?? PrismaClient;
  } catch {
    return PrismaClient;
  }
}

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

// Requerir PrismaClient fresco desde disco si la caché estaba stale
const PrismaClientClass =
  schemaChanged || missingModels
    ? bustPrismaClientCacheAndReload()
    : PrismaClient;

export const db =
  global.__db ??
  new PrismaClientClass({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__db = db;
  global.__dbSchemaHash = currentHash;
}
