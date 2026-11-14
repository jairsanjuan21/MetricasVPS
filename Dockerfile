# Imagen del monitor. Node 24 ejecuta TypeScript directo (type stripping): el servidor no se compila.

FROM node:24-alpine AS base
WORKDIR /app

# 1) Dependencias completas para compilar el frontend
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# 2) Frontend React -> dist/web
FROM deps AS build
COPY . .
RUN npm run build

# 3) Solo dependencias de producción (hono, nodemailer)
FROM base AS deps-prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 4) Imagen final, mínima y sin root
FROM base AS runner
ENV NODE_ENV=production \
    PUERTO=4000 \
    HOST_PROC=/host/proc \
    DATOS_DIR=/datos
RUN addgroup -S -g 10001 monitor && adduser -S -u 10001 -G monitor monitor \
    && mkdir -p /datos && chown monitor:monitor /datos
COPY --from=deps-prod /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist/web ./dist/web
USER monitor
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/salud >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
