# syntax=docker/dockerfile:1

FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

FROM node:20-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV APP_KEYS=build_key_1,build_key_2
ENV API_TOKEN_SALT=build_api_token_salt
ENV ADMIN_JWT_SECRET=build_admin_jwt_secret
ENV TRANSFER_TOKEN_SALT=build_transfer_token_salt
ENV JWT_SECRET=build_jwt_secret
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 1337
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=20 \
  CMD node -e "const net=require('net'); const socket=net.connect(1337, '127.0.0.1'); socket.on('connect', () => process.exit(0)); socket.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 3000)"
CMD ["npm", "run", "start"]
