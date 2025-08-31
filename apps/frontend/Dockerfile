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
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/

# Layer 3: Install dependencies (cached when package.json files don't change)
RUN pnpm install --frozen-lockfile

# Layer 4: Copy source code
COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

# Layer 5: Set environment variables for build
ARG NODE_ENV=production
ARG VITE_OAUTH_SERVICE_URL=https://api.relayforge.xyz
ARG VITE_API_BASE_URL=https://api.relayforge.xyz
ENV NODE_ENV=${NODE_ENV}
ENV VITE_OAUTH_SERVICE_URL=${VITE_OAUTH_SERVICE_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Layer 6: Build everything in parallel using turbo
RUN pnpm turbo run build --filter=relayforge-frontend...

# Production stage - nginx
FROM nginx:stable

# Copy built files
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]