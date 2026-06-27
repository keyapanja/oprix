# syntax=docker/dockerfile:1

# Oprix — production image (Coolify / Hostinger KVM).
# Debian + full node_modules (not "standalone") for Prisma reliability: the query
# engine just works, and `prisma db push` + the one-time seed can run inside the
# container for first setup. `next start` serves the production build.

FROM node:22-slim AS base
WORKDIR /app
# OpenSSL is required by Prisma's query engine on Debian.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# ---- build ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder URLs so `prisma generate` and `next build` never need the real DB
# (Prisma connects lazily; no page queries run at build time). Real values are
# injected by Coolify at runtime.
ENV DATABASE_URL="postgresql://u:p@localhost:5432/db"
ENV DIRECT_URL="postgresql://u:p@localhost:5432/db"
ENV AUTH_SECRET="build-placeholder"
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
# Attachments / avatars / logos are written here. Mount a Coolify persistent
# volume at /app/uploads so they survive every redeploy.
RUN mkdir -p /app/uploads
EXPOSE 3000
# On boot, sync the schema (additive `db push`) then serve. The DIRECT_URL
# fallback makes the push work even when only DATABASE_URL is set (Coolify
# Postgres has no separate pooler). A failed push is non-fatal — the app still
# starts on the existing schema — and `db push` never drops data without
# `--accept-data-loss`, which we deliberately omit. This means schema changes
# apply automatically on each redeploy; no manual `prisma db push` needed.
CMD ["sh", "-c", "export DIRECT_URL=\"${DIRECT_URL:-$DATABASE_URL}\"; echo 'Syncing DB schema (prisma db push)…'; node_modules/.bin/prisma db push --skip-generate || echo 'WARN: prisma db push failed — starting on existing schema'; node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
