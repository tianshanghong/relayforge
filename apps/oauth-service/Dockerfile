# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-*.yaml ./
COPY package.json ./
COPY packages/database/package.json ./packages/database/
COPY apps/oauth-service/package.json ./apps/oauth-service/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/database ./packages/database
COPY apps/oauth-service ./apps/oauth-service

# Build packages
RUN pnpm --filter @relayforge/database build
RUN pnpm --filter @relayforge/oauth-service build

# Production stage
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy built application
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/oauth-service/dist ./apps/oauth-service/dist
COPY --from=builder /app/apps/oauth-service/package.json ./apps/oauth-service/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/oauth-service/node_modules ./apps/oauth-service/node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3002

WORKDIR /app/apps/oauth-service

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]