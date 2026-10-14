# Imagem de produção do Gestão de Obras (Cloud Run). Dois alvos:
#   runner   — o app (Next.js standalone), usuário sem privilégios, porta 8080
#   migrator — `prisma migrate deploy` (Cloud Run Job executado antes de cada deploy)

FROM node:26-bookworm-slim@sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567 AS base
# openssl: exigido pelo engine do Prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
ARG DEPLOYMENT_VERSION=""
ENV DEPLOYMENT_VERSION=${DEPLOYMENT_VERSION}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS migrator
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node prisma ./prisma
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]
