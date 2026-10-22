# ============================================================
# Dockerfile — Marsella ERP (Next.js 16 standalone + Prisma)
# ============================================================
# Imagen multi-stage:
#   1) builder  — instala deps, genera cliente Prisma y compila Next.js
#   2) runner   — imagen mínima de producción con el standalone
#
# El proyecto usa `bun.lock` y el script `next build` produce un
# servidor standalone (`output: "standalone"` en next.config.ts).
# En runtime usamos `node` (incluido en la imagen) para ejecutar
# `server.js`. El cliente Prisma se copia explícitamente porque el
# standalone de Next.js no lo empaqueta automáticamente.
# ============================================================

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

# Instala bun para respetar bun.lock y acelerar la instalación
RUN apk add --no-cache bash libc6-compat && \
    npm install -g bun

WORKDIR /app

# Copia manifiestos primero para aprovechar la cache de Docker
COPY package.json bun.lock* ./
COPY prisma ./prisma

# Instala dependencias (usa bun para respetar bun.lock)
RUN bun install --frozen-lockfile

# Copia el resto del código
COPY . .

# Genera el cliente Prisma (necesario antes del build)
RUN bunx prisma generate

# Compila Next.js (produce .next/standalone + .next/static)
# El script `build` del package.json copia static y public a standalone
RUN bun run build

# ---------- Stage 2: runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# SQLite embebido: el archivo .db se monta como volumen
ENV DATABASE_URL=file:/app/data/marsella.db
# Next.js standalone escucha en 0.0.0.0:3000 por defecto
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Crea usuario no-root para mayor seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Crea directorio de datos para SQLite
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app

# Copia el servidor standalone (incluye node_modules mínimos de prod)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copia assets estáticos (JS/CSS del cliente)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copia carpeta pública
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copia esquema Prisma (para `prisma db push` en arranque)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Copia binarios del cliente Prisma generados
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# Copia el CLI de Prisma para poder ejecutar migraciones/db push
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

USER nextjs

EXPOSE 3000

# Asegura que el esquema SQLite exista antes de arrancar el server
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss && node server.js"]
