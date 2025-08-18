#!/bin/bash
set -e

# RelayForge Complete Teardown and Redeploy Script
# WARNING: This will completely remove all containers, volumes, and data!

echo "⚠️  WARNING: Complete Teardown and Redeploy"
echo "==========================================="
echo "This will:"
echo "  - Pull latest code from git"
echo "  - Stop all containers"
echo "  - Remove all containers" 
echo "  - Remove all volumes (including database data)"
echo "  - Remove all images"
echo "  - Pull fresh images and redeploy"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env file from .env.production.example"
    exit 1
fi

echo ""
echo "📦 Pulling latest code from git..."
git pull origin main

echo ""
echo "🛑 Stopping all containers..."
docker-compose -f docker-compose.prod.yml down -v

echo "🗑️  Removing all RelayForge images..."
# Remove local images to force fresh pull
docker images | grep "ghcr.io/tianshanghong/relayforge" | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true

echo "🧹 Cleaning up Docker system..."
docker system prune -f

echo ""
echo "✅ Teardown complete. Ready for fresh deployment."
echo ""
echo "📦 Pulling latest Docker images (using :latest tag)..."
docker-compose -f docker-compose.prod.yml pull

echo "🚀 Starting fresh deployment..."
# Start database first
docker-compose -f docker-compose.prod.yml up -d postgres
echo "⏳ Waiting for database to be ready..."
sleep 10

# Run migrations (including our new pricing migration)
echo "🗄️  Running database migrations..."
docker-compose -f docker-compose.prod.yml run --rm oauth-service sh -c "cd /app/packages/database && npx prisma migrate deploy"

# Start all services
echo "🚀 Starting all services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services
echo "⏳ Waiting for services to be healthy..."
sleep 15

# Check service health
echo "🏥 Checking service health..."
services=("postgres" "oauth-service" "mcp-gateway" "frontend" "nginx")
all_healthy=true

for service in "${services[@]}"; do
    if docker-compose -f docker-compose.prod.yml ps | grep $service | grep -q "Up"; then
        echo "✅ $service is running"
    else
        echo "❌ $service is not running"
        all_healthy=false
    fi
done

# Verify pricing data was loaded
echo ""
echo "🔍 Verifying service pricing data..."
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d relayforge -c "SELECT service, \"pricePerCall\", active FROM service_pricing ORDER BY service;" || echo "⚠️  Could not verify pricing data"

if $all_healthy; then
    echo ""
    echo "✅ Fresh deployment complete!"
    echo ""
    echo "🌐 Your RelayForge instance is available at:"
    echo "   Main site: https://relayforge.xyz"
    echo "   API: https://api.relayforge.xyz"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Test OAuth login flow"
    echo "   2. Test MCP integration" 
    echo "   3. Verify service pricing is loaded (check output above)"
else
    echo ""
    echo "❌ Some services failed to start. Check logs with:"
    echo "   docker-compose -f docker-compose.prod.yml logs"
fi