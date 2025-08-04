#!/bin/bash

# RelayForge Logs Viewer
# View logs from different services

echo "📋 RelayForge Logs Viewer"
echo "========================"
echo ""
echo "Select a service to view logs:"
echo "1) All services"
echo "2) OAuth Service"
echo "3) MCP Gateway"
echo "4) Frontend"
echo "5) Nginx"
echo "6) PostgreSQL"
echo ""

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo "Showing logs for all services..."
        docker-compose -f docker-compose.prod.yml logs -f --tail=100
        ;;
    2)
        echo "Showing OAuth Service logs..."
        docker-compose -f docker-compose.prod.yml logs -f --tail=100 oauth-service
        ;;
    3)
        echo "Showing MCP Gateway logs..."
        docker-compose -f docker-compose.prod.yml logs -f --tail=100 mcp-gateway
        ;;
    4)
        echo "Showing Frontend logs..."
        docker-compose -f docker-compose.prod.yml logs -f --tail=100 frontend
        ;;
    5)
        echo "Showing Nginx logs..."
        docker-compose -f docker-compose.prod.yml logs -f --tail=100 nginx
        ;;
    6)
        echo "Showing PostgreSQL logs..."
        docker-compose -f docker-compose.prod.yml logs -f --tail=100 postgres
        ;;
    *)
        echo "Invalid choice. Please run the script again."
        exit 1
        ;;
esac