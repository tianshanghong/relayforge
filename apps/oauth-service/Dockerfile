# Build stage
FROM node:20-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Layer 1: Package files (changes least frequently)
COPY pnpm-*.yaml ./
COPY package.json ./
COPY tsconfig.json ./
COPY turbo.json ./

# Layer 2: All package.json files for dependency installation
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/oauth-service/package.json ./apps/oauth-service/

# Layer 3: Install dependencies (cached when package.json files don't change)
RUN pnpm install --frozen-lockfile

# Layer 4: Copy source code
COPY packages ./packages
COPY apps/oauth-service ./apps/oauth-service

# Layer 5: Build everything in parallel using turbo
RUN pnpm turbo run build --filter=@relayforge/oauth-service...

# Production stage
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm for production
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files first
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-*.yaml ./
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/oauth-service/package.json ./apps/oauth-service/

# Copy built artifacts
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/oauth-service/dist ./apps/oauth-service/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Generate Prisma client
RUN cd /app/packages/database && pnpm prisma generate

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash -m nodejs

USER nodejs

EXPOSE 3002

WORKDIR /app/apps/oauth-service

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]