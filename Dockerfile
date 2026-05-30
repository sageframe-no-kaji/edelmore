# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
# Compiles better-sqlite3's native addon and bundles the SvelteKit app, then
# prunes to production dependencies. The build toolchain stays in this stage.
FROM node:20-slim AS builder
WORKDIR /app

# Build tools for better-sqlite3 native compilation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
# `npm run build` emits the adapter-node server into ./build; the prune drops
# devDependencies while keeping better-sqlite3's compiled binary.
RUN npm run build && npm prune --production

# ── Runtime stage ────────────────────────────────────────────────────────────
# Slim image with no compiler toolchain — only the built server, its production
# node_modules, and a writable data dir owned by the non-root `node` user.
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# SQLite lives on a mounted volume at /data; make it writable by `node` so the
# container needn't run as root. On the homelab the ZFS dataset is chowned to
# match by the deploy tooling.
RUN mkdir -p /data && chown node:node /data

COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000

# adapter-node listens on 0.0.0.0:3000. /login always returns 200 (no auth
# needed), so it doubles as a liveness probe without an extra dependency.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]
