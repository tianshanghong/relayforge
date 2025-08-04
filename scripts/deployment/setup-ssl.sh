#!/bin/bash
set -e

# RelayForge SSL Setup Script
# Sets up Let's Encrypt SSL certificates

echo "🔒 RelayForge SSL Setup"
echo "======================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo ./setup-ssl.sh"
    exit 1
fi

# Get email for Let's Encrypt
read -p "Enter your email for Let's Encrypt notifications: " EMAIL

# Domains to get certificates for
DOMAINS="relayforge.xyz,api.relayforge.xyz,gateway.relayforge.xyz"

echo ""
echo "📋 Certificate will be requested for:"
echo "   - relayforge.xyz"
echo "   - api.relayforge.xyz"
echo "   - gateway.relayforge.xyz"
echo ""

# First, start nginx without SSL to handle ACME challenge
echo "🚀 Starting nginx for ACME challenge..."
cat > nginx/nginx-init.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name relayforge.xyz api.relayforge.xyz gateway.relayforge.xyz;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }
}
EOF

# Update docker-compose to use init config
docker-compose -f docker-compose.prod.yml stop nginx
docker run -d \
    --name nginx-init \
    -p 80:80 \
    -v $(pwd)/nginx/nginx-init.conf:/etc/nginx/nginx.conf:ro \
    -v certbot_www:/var/www/certbot:ro \
    nginx:alpine

echo "⏳ Waiting for nginx to start..."
sleep 5

# Get certificates
echo "📜 Requesting SSL certificates..."
docker-compose -f docker-compose.prod.yml run --rm certbot \
    certonly --webroot \
    --webroot-path /var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAINS

# Stop temporary nginx
docker stop nginx-init
docker rm nginx-init

# Start full stack with SSL
echo "🚀 Starting services with SSL..."
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo "✅ SSL setup complete!"
echo ""
echo "🔒 Your sites are now available with HTTPS:"
echo "   - https://relayforge.xyz"
echo "   - https://api.relayforge.xyz"
echo "   - https://gateway.relayforge.xyz"
echo ""
echo "📝 Certificates will auto-renew every 12 hours via certbot service"