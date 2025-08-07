#!/bin/bash
set -e

# RelayForge Update Script
# Updates the deployment with latest images

echo "🔄 RelayForge Update Script"
echo "==========================="

# Function to handle errors
handle_error() {
    echo "❌ Error occurred during update: $1"
    echo "Please check the logs and try again."
    exit 1
}

# Function to check if service is healthy
check_service_health() {
    local service=$1
    local max_attempts=30
    local attempt=1
    
    echo "  Checking health of $service..."
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f docker-compose.prod.yml exec -T $service wget --no-verbose --tries=1 --spider http://localhost:${2:-3001}/health 2>/dev/null; then
            echo "  ✅ $service is healthy"
            return 0
        fi
        echo "  Waiting for $service to be healthy... ($attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "  ⚠️  Warning: $service health check timed out"
    return 1
}

# Pull latest images
echo "📦 Pulling latest Docker images..."
docker-compose -f docker-compose.prod.yml pull || handle_error "Failed to pull Docker images"

# Run database migrations
echo "🗄️  Running database migrations..."
docker-compose -f docker-compose.prod.yml run --rm oauth-service npx prisma migrate deploy || handle_error "Database migration failed"

# Restart services with zero downtime
echo "🔄 Updating services..."

# Update OAuth service
echo "  Updating oauth-service..."
docker-compose -f docker-compose.prod.yml up -d --no-deps --build oauth-service || handle_error "Failed to update oauth-service"
check_service_health oauth-service 3002 || echo "  ⚠️  oauth-service may not be fully ready"

# Update MCP Gateway
echo "  Updating mcp-gateway..."
docker-compose -f docker-compose.prod.yml up -d --no-deps --build mcp-gateway || handle_error "Failed to update mcp-gateway"
check_service_health mcp-gateway 3001 || echo "  ⚠️  mcp-gateway may not be fully ready"

# Update Frontend
echo "  Updating frontend..."
docker-compose -f docker-compose.prod.yml up -d --no-deps --build frontend || handle_error "Failed to update frontend"

# Reload nginx to pick up any config changes
echo "🔄 Reloading nginx configuration..."
if docker-compose -f docker-compose.prod.yml exec -T nginx nginx -t 2>/dev/null; then
    docker-compose -f docker-compose.prod.yml exec -T nginx nginx -s reload && echo "  ✅ Nginx reloaded successfully" || echo "  ⚠️  Warning: Nginx reload failed, but continuing..."
else
    echo "  ⚠️  Warning: Nginx config test failed, skipping reload"
fi

echo ""
echo "✅ Update complete!"
echo ""
echo "Check service status with:"
echo "   docker-compose -f docker-compose.prod.yml ps"