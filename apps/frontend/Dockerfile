# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Layer 1: Package files (changes least frequently)
COPY pnpm-*.yaml ./
COPY package.json ./
COPY tsconfig.json ./
COPY turbo.json ./

# Layer 2: All package.json files for dependency installation
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/

# Layer 3: Install dependencies (cached when package.json files don't change)
RUN pnpm install --frozen-lockfile

# Layer 4: Copy source code
COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

# Layer 5: Build everything in parallel using turbo
ENV NODE_ENV=production
RUN pnpm turbo run build --filter=relayforge-frontend...

# Production stage - nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY apps/frontend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]