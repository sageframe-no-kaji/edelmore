# syntax=docker/dockerfile:1

# Build context is the workspace root (the repo root), not apps/diary/. This
# lets npm see the workspace's package-lock.json and resolve hoisted deps.

# ── Build stage ──────────────────────────────────────────────────────────────
# Compiles better-sqlite3's native addon and bundles the SvelteKit diary app,
# then prunes to production dependencies. The build toolchain stays in this stage.
FROM node:20-slim AS builder
WORKDIR /app

# Build tools for better-sqlite3 native compilation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*

# Manifests first, for cache-friendly layering. Root manifest + lockfile drive
# the install; apps/diary/package.json declares the diary app's deps.
COPY package.json package-lock.json ./
COPY apps/diary/package.json apps/diary/package.json
RUN npm ci

# Then source — changes here don't bust the install cache above.
COPY apps/diary apps/diary

# SvelteKit's adapter-node emits to apps/diary/build. Prune devDeps from the
# hoisted node_modules while keeping better-sqlite3's compiled binary.
RUN npm run build -w apps/diary && npm prune --omit=dev

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

# Flatten apps/diary/build → /app/build so the CMD doesn't need workspace paths.
COPY --from=builder --chown=node:node /app/apps/diary/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/diary/package.json ./package.json

USER node
EXPOSE 3000

# adapter-node listens on 0.0.0.0:3000. /login always returns 200 (no auth
# needed), so it doubles as a liveness probe without an extra dependency.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]
