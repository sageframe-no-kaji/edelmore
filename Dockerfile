# syntax=docker/dockerfile:1
FROM node:20-slim

WORKDIR /app

# Build tools for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --production

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "build/index.js"]
