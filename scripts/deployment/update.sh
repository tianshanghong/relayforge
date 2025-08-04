#!/bin/bash
set -e

# RelayForge Update Script
# Updates the deployment with latest images

echo "🔄 RelayForge Update Script"
echo "==========================="

# Pull latest images
echo "📦 Pulling latest Docker images..."
docker-compose -f docker-compose.prod.yml pull

# Run database migrations
echo "🗄️  Running database migrations..."
docker-compose -f docker-compose.prod.yml run --rm oauth-service npx prisma migrate deploy

# Restart services with zero downtime
echo "🔄 Updating services..."
docker-compose -f docker-compose.prod.yml up -d --no-deps --build oauth-service
docker-compose -f docker-compose.prod.yml up -d --no-deps --build mcp-gateway
docker-compose -f docker-compose.prod.yml up -d --no-deps --build frontend

# Reload nginx to pick up any config changes
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo ""
echo "✅ Update complete!"
echo ""
echo "Check service status with:"
echo "   docker-compose -f docker-compose.prod.yml ps"