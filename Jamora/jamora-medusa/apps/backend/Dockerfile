# syntax=docker/dockerfile:1
# --- Jamora backend / CMS (Medusa v2) ---

FROM node:20-slim
# Native toolchain for modules that compile on install
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Source deps (used for migrations/seed via the CLI)
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Build the production server + admin dashboard, then install the built
# server's own runtime dependencies.
COPY . .
RUN npx medusa build \
  && cd .medusa/server \
  && npm install --legacy-peer-deps --no-audit --no-fund

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 9000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=10 \
  CMD curl -fsS http://localhost:9000/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
