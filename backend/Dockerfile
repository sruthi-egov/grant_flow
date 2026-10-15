# GrantOS backend image.
#
# Multi-stage: dependencies and TypeScript build happen in `builder`, and only
# the compiled output plus production dependencies reach the runtime layer.

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies, keeping the generated Prisma client.
RUN npm prune --omit=dev && npx prisma generate

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache openssl tini

ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/app/storage/uploads

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
# Needed because migrations and the seed run via ts-node at container start.
COPY tsconfig.json ./

# The uploads volume is mounted here; create it so a first run without a
# volume still works.
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3001

# tini reaps zombies and forwards signals so the container stops promptly.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
