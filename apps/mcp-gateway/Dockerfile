# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-*.yaml ./
COPY package.json ./
COPY tsconfig.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/mcp-adapter/package.json ./packages/mcp-adapter/
COPY packages/shared/package.json ./packages/shared/
COPY apps/oauth-service/package.json ./apps/oauth-service/
COPY apps/mcp-gateway/package.json ./apps/mcp-gateway/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and configs
COPY packages/database ./packages/database
COPY packages/mcp-adapter ./packages/mcp-adapter
COPY packages/shared ./packages/shared
COPY apps/oauth-service ./apps/oauth-service
COPY apps/mcp-gateway ./apps/mcp-gateway
COPY turbo.json ./

# Build packages in dependency order
RUN pnpm --filter @relayforge/database build
RUN pnpm --filter @relayforge/shared build
RUN pnpm --filter @relayforge/mcp-adapter build
RUN pnpm --filter @relayforge/oauth-service build
RUN pnpm --filter mcp-gateway build

# Verify build output
RUN ls -la apps/mcp-gateway/

# Production stage
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy built application
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/packages/mcp-adapter ./packages/mcp-adapter
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/oauth-service ./apps/oauth-service
COPY --from=builder /app/apps/mcp-gateway/dist ./apps/mcp-gateway/dist
COPY --from=builder /app/apps/mcp-gateway/package.json ./apps/mcp-gateway/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/mcp-gateway/node_modules ./apps/mcp-gateway/node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3001

WORKDIR /app/apps/mcp-gateway

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]