#!/bin/bash
set -e

# Default values
ENVIRONMENT="${1:-staging}"
DOMAIN="${2:-}"

echo "=== RelayForge VPS Setup Script ==="
echo "Usage: ./setup-vps.sh [environment] [domain]"
echo "  environment: staging|production (default: staging)"
echo "  domain: your domain name (required)"
echo ""
echo "Setting up: $ENVIRONMENT environment"
echo "Domain: $DOMAIN"
echo ""

# Validate inputs
if [ -z "$DOMAIN" ]; then
    echo "❌ Error: Domain is required"
    echo "Example: ./setup-vps.sh staging relayforge.dev"
    echo "Example: ./setup-vps.sh production relayforge.xyz"
    exit 1
fi

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❌ Error: Environment must be 'staging' or 'production'"
    exit 1
fi

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "🔧 Installing required packages..."
apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo "Docker already installed: $(docker --version)"
fi

# Install Docker Compose (latest version)
echo "🐳 Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name)
    echo "Installing Docker Compose ${COMPOSE_VERSION}..."
    curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
else
    echo "Docker Compose already installed: $(docker-compose --version)"
fi

# Create app directory
echo "📁 Creating application directory..."
mkdir -p /opt/relayforge
cd /opt/relayforge

# Clone repository
echo "📥 Cloning repository..."
if [ ! -d ".git" ]; then
    git clone https://github.com/tianshanghong/relayforge.git .
else
    echo "Repository already exists, pulling latest..."
    git pull
fi

# Create SSL directory
echo "🔐 Creating SSL certificate directory..."
mkdir -p nginx/ssl

# Create .env file
echo "⚙️ Creating environment file..."
if [ ! -f ".env" ]; then
    # Copy appropriate example file
    if [ "$ENVIRONMENT" == "production" ]; then
        cp .env.production.example .env
    elif [ -f ".env.staging.example" ]; then
        cp .env.staging.example .env
    else
        cp .env.example .env
    fi
    
    # Generate secure keys
    echo "🔐 Generating secure keys..."
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    JWT_SECRET=$(openssl rand -hex 32)
    COOKIE_SECRET=$(openssl rand -hex 32)
    ADMIN_KEY=$(openssl rand -hex 32)
    INTERNAL_API_KEY=$(openssl rand -hex 32)
    
    # Update .env with generated keys
    sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${ENCRYPTION_KEY}/" .env
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
    sed -i "s/COOKIE_SECRET=.*/COOKIE_SECRET=${COOKIE_SECRET}/" .env
    sed -i "s/ADMIN_KEY=.*/ADMIN_KEY=${ADMIN_KEY}/" .env
    sed -i "s/INTERNAL_API_KEY=.*/INTERNAL_API_KEY=${INTERNAL_API_KEY}/" .env
    
    # Generate secure database password
    DB_PASSWORD=$(openssl rand -hex 16)
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${DB_PASSWORD}/" .env
    
    # Set environment and domain
    sed -i "s/NODE_ENV=.*/NODE_ENV=${ENVIRONMENT}/" .env
    sed -i "s|DOMAIN_NAME=.*|DOMAIN_NAME=${DOMAIN}|" .env
    sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" .env
    sed -i "s|MCP_BASE_URL=.*|MCP_BASE_URL=https://${DOMAIN}|" .env
    sed -i "s|OAUTH_SERVICE_URL=.*|OAUTH_SERVICE_URL=https://${DOMAIN}|" .env
    sed -i "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=https://${DOMAIN}|" .env
    sed -i "s|VITE_OAUTH_SERVICE_URL=.*|VITE_OAUTH_SERVICE_URL=https://${DOMAIN}|" .env
    sed -i "s|GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=https://${DOMAIN}/oauth/google/callback|" .env
    sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" .env
    
    echo "✅ Generated secure keys and configured for ${DOMAIN}"
else
    echo "⚠️  .env file already exists - skipping creation"
fi

# Set proper permissions
chmod 600 .env
chmod 700 nginx/ssl
chmod 600 nginx/ssl/* 2>/dev/null || true

# Display next steps
echo ""
echo "✅ VPS setup complete!"
echo ""
echo "📋 Required Manual Configuration:"
echo "================================"
echo ""
echo "1️⃣  Google OAuth Setup:"
echo "   - Edit /opt/relayforge/.env"
echo "   - Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
echo "   - Ensure redirect URI is: https://${DOMAIN}/oauth/google/callback"
echo ""
echo "2️⃣  SSL Certificate Setup (Choose one):"
echo ""
echo "   Option A - Cloudflare Origin Certificate:"
echo "   ------------------------------------------"
echo "   1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
echo "   2. Create certificate for: *.${DOMAIN}, ${DOMAIN}"
echo "   3. Save certificates:"
echo "      echo 'PASTE_CERTIFICATE' > /opt/relayforge/nginx/ssl/cloudflare-origin.pem"
echo "      echo 'PASTE_KEY' > /opt/relayforge/nginx/ssl/cloudflare-origin-key.pem"
echo "      chmod 600 /opt/relayforge/nginx/ssl/*"
echo "   4. Set Cloudflare SSL/TLS to 'Full' or 'Full (strict)'"
echo ""
echo "   Option B - Let's Encrypt:"
echo "   -------------------------"
echo "   Will be configured after initial deployment"
echo ""
echo "3️⃣  DNS Configuration:"
echo "   - Point ${DOMAIN} to: $(curl -s ifconfig.me)"
echo "   - If using Cloudflare, enable proxy (orange cloud)"
echo ""
echo "🚀 Deployment Commands:"
echo "======================"
echo "cd /opt/relayforge"
echo ""

# Show appropriate docker-compose command
if [ "$ENVIRONMENT" == "staging" ]; then
    echo "# Build and start services:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build"
    echo ""
    echo "# Run database migrations:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.staging.yml run --rm db-migrate"
    echo ""
    echo "# View logs:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.staging.yml logs -f"
    echo ""
    echo "# Restart services:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.staging.yml restart"
else
    echo "# Pull images and start services:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
    echo ""
    echo "# Run database migrations:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm db-migrate"
    echo ""
    echo "# View logs:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
    echo ""
    echo "# Restart services:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart"
fi

echo ""
echo "📌 Note: Docker publishes ports directly, bypassing host firewall rules."
echo "   Ports 80 and 443 will be accessible when nginx container starts."
echo ""
echo "🌐 Once deployed: https://${DOMAIN}"