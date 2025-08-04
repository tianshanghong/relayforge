#!/bin/bash
set -e

# RelayForge Production Deployment Script
# This script should be run on your production server

echo "🚀 RelayForge Deployment Script"
echo "==============================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env file from .env.production.example"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check required environment variables
required_vars=("POSTGRES_PASSWORD" "ENCRYPTION_KEY" "JWT_SECRET" "COOKIE_SECRET" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "ADMIN_KEY")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: $var is not set in .env file"
        exit 1
    fi
done

echo "✅ Environment variables loaded"

# Pull latest changes
echo "📦 Pulling latest Docker images..."
docker-compose -f docker-compose.prod.yml pull

# Run database migrations
echo "🗄️  Running database migrations..."
docker-compose -f docker-compose.prod.yml run --rm oauth-service npx prisma migrate deploy

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

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

if $all_healthy; then
    echo ""
    echo "✅ All services are running!"
    echo ""
    echo "🌐 Your RelayForge instance is available at:"
    echo "   Main site: https://relayforge.xyz"
    echo "   API: https://api.relayforge.xyz"
    echo "   Gateway: https://gateway.relayforge.xyz"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Set up SSL certificates (run setup-ssl.sh)"
    echo "   2. Configure DNS records for your domain"
    echo "   3. Test OAuth login flow"
else
    echo ""
    echo "❌ Some services failed to start. Check logs with:"
    echo "   docker-compose -f docker-compose.prod.yml logs"
fi