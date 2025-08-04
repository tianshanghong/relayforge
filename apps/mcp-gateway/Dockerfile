# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-*.yaml ./
COPY package.json ./
COPY packages/database/package.json ./packages/database/
COPY apps/mcp-gateway/package.json ./apps/mcp-gateway/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/database ./packages/database
COPY apps/mcp-gateway ./apps/mcp-gateway

# Build packages
RUN pnpm --filter @relayforge/database build
RUN pnpm --filter mcp-gateway build

# Production stage
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy built application
COPY --from=builder /app/packages/database ./packages/database
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