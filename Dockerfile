# Multi-stage build for india-bis-standards-mcp
# Stage 1: builder — compile TypeScript, install all deps, seed sample DB
# Stage 2: production — minimal image, non-root user, health check

# ---- Builder ----------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY sources.yml ./
COPY server.json ./

# Build TypeScript
RUN npm run build

# Copy the committed BIS catalog database (metadata only — full text is
# paid and is never fetched at build time). If the committed database is
# missing for any reason, fall back to the sample seed so the image still
# boots with something meaningful.
COPY data/ ./data/
RUN mkdir -p data && \
    if [ ! -s data/bis.db ]; then node dist/scripts/seed-sample.js; fi

# Remove dev dependencies
RUN npm prune --omit=dev

# ---- Production -------------------------------------------------------------
FROM node:20-slim AS production

WORKDIR /app

# Create non-root user
RUN groupadd -r mcpuser && useradd -r -g mcpuser -d /app -s /sbin/nologin mcpuser

# Runtime dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Copy built artefacts
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/sources.yml ./sources.yml
COPY --from=builder /app/server.json ./server.json

# Copy seeded database
COPY --from=builder /app/data/ ./data/

# Own everything by the non-root user
RUN chown -R mcpuser:mcpuser /app

USER mcpuser

ENV PORT=9196
ENV NODE_ENV=production
ENV BIS_DB_PATH=/app/data/bis.db

EXPOSE 9196

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:9196/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/http-server.js"]
