# Pre-built base image with common dependencies
# Build this weekly and push to registry to speed up all builds
FROM node:20-slim AS base

# Install system dependencies that all services need
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm with specific version for consistency
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Pre-create directories
WORKDIR /app

# Pre-install common global packages
RUN pnpm add -g turbo@1.13.4

# Add non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash -m nodejs

# This base image can be built weekly and pushed to:
# ghcr.io/tianshanghong/relayforge/base:latest