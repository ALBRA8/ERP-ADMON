import { PrismaClient } from "@prisma/client";

declare global {
  var __db: PrismaClient | undefined;
}

export const db =
  global.__db ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__db = db;
}
