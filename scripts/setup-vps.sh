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
    
    # Update .env with generated keys (safer method to handle special characters)
    # Use awk for more robust replacement that handles special regex characters
    cp .env .env.bak
    
    awk -v key="$ENCRYPTION_KEY" '/^ENCRYPTION_KEY=/ {print "ENCRYPTION_KEY=" key; next} {print}' .env > .env.tmp && mv .env.tmp .env
    if [ $? -ne 0 ]; then
        echo "❌ Failed to update ENCRYPTION_KEY in .env"
        mv .env.bak .env
        exit 1
    fi
    
    awk -v key="$JWT_SECRET" '/^JWT_SECRET=/ {print "JWT_SECRET=" key; next} {print}' .env > .env.tmp && mv .env.tmp .env
    if [ $? -ne 0 ]; then
        echo "❌ Failed to update JWT_SECRET in .env"
        mv .env.bak .env
        exit 1
    fi
    
    awk -v key="$COOKIE_SECRET" '/^COOKIE_SECRET=/ {print "COOKIE_SECRET=" key; next} {print}' .env > .env.tmp && mv .env.tmp .env
    if [ $? -ne 0 ]; then
        echo "❌ Failed to update COOKIE_SECRET in .env"
        mv .env.bak .env
        exit 1
    fi
    
    awk -v key="$ADMIN_KEY" '/^ADMIN_KEY=/ {print "ADMIN_KEY=" key; next} {print}' .env > .env.tmp && mv .env.tmp .env
    if [ $? -ne 0 ]; then
        echo "❌ Failed to update ADMIN_KEY in .env"
        mv .env.bak .env
        exit 1
    fi
    
    awk -v key="$INTERNAL_API_KEY" '/^INTERNAL_API_KEY=/ {print "INTERNAL_API_KEY=" key; next} {print}' .env > .env.tmp && mv .env.tmp .env
    if [ $? -ne 0 ]; then
        echo "❌ Failed to update INTERNAL_API_KEY in .env"
        mv .env.bak .env
        exit 1
    fi
    
    rm -f .env.bak
    
    # Generate secure database password
    DB_PASSWORD=$(openssl rand -hex 16)
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${DB_PASSWORD}/" .env
    
    # Set environment and domain (staging uses production NODE_ENV)
    if [ "$ENVIRONMENT" == "staging" ]; then
        sed -i "s/NODE_ENV=.*/NODE_ENV=production/" .env
    else
        sed -i "s/NODE_ENV=.*/NODE_ENV=production/" .env
    fi
    sed -i "s|DOMAIN_NAME=.*|DOMAIN_NAME=${DOMAIN}|" .env
    sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" .env
    sed -i "s|MCP_BASE_URL=.*|MCP_BASE_URL=https://${DOMAIN}|" .env
    sed -i "s|OAUTH_SERVICE_URL=.*|OAUTH_SERVICE_URL=https://${DOMAIN}|" .env
    sed -i "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=https://${DOMAIN}|" .env
    sed -i "s|VITE_OAUTH_SERVICE_URL=.*|VITE_OAUTH_SERVICE_URL=https://${DOMAIN}|" .env
    sed -i "s|GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=https://api.${DOMAIN}/oauth/google/callback|" .env
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
echo "   - Ensure redirect URI is: https://api.${DOMAIN}/oauth/google/callback"
echo ""
echo "2️⃣  SSL Certificate Setup (Choose one):"
echo ""
echo "   Option A - Cloudflare Origin Certificate:"
echo "   ------------------------------------------"
echo "   1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
echo "   2. Create certificate for: *.${DOMAIN}, ${DOMAIN}"
echo "   3. Save certificates securely (avoid shell history):"
echo "      # For certificate:"
echo "      cat > /opt/relayforge/nginx/ssl/cloudflare-origin.pem"
echo "      # (Paste certificate content, then press Ctrl+D)"
echo "      "
echo "      # For private key:"
echo "      cat > /opt/relayforge/nginx/ssl/cloudflare-origin-key.pem"
echo "      # (Paste private key content, then press Ctrl+D)"
echo "      "
echo "      chmod 600 /opt/relayforge/nginx/ssl/*"
echo "   4. Set Cloudflare SSL/TLS to 'Full' or 'Full (strict)'"
echo ""
echo "   Option B - Let's Encrypt:"
echo "   -------------------------"
echo "   Will be configured after initial deployment"
echo ""
echo "3️⃣  DNS Configuration:"
# Get IP address with error handling and local fallback
SERVER_IP=$(curl -s --max-time 5 ifconfig.me || curl -s --max-time 5 ipinfo.io/ip || hostname -I | awk '{print $1}' || echo "your-server-ip")
echo "   - Point ${DOMAIN} to: ${SERVER_IP}"
echo "   - If using Cloudflare, enable proxy (orange cloud)"
echo ""
echo "🚀 Deployment Commands:"
echo "======================"
echo "cd /opt/relayforge"
echo ""

# Show appropriate docker-compose command
if [ "$ENVIRONMENT" == "staging" ]; then
    echo "# Build from source and start services (staging):"
    echo "# First, build frontend with correct API URL:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml build \\"
    echo "  --build-arg VITE_API_BASE_URL=https://api.${DOMAIN} \\"
    echo "  --build-arg VITE_OAUTH_SERVICE_URL=https://api.${DOMAIN} \\"
    echo "  frontend"
    echo ""
    echo "# Then build and start all services:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
    echo ""
    echo "# Run database migrations:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate up db-migrate"
    echo ""
    echo "# View logs:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
    echo ""
    echo "# Restart services:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart"
else
    echo "# Pull pre-built images and start services (production):"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
    echo ""
    echo "# Run database migrations:"
    echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate up db-migrate"
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

echo "🔄 Running database migrations..."
echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate up db-migrate"
echo ""
echo "Note: Run the migration command after starting services to set up the database."
echo ""
echo "🌐 Once deployed: https://${DOMAIN}"
echo ""
echo "🔍 After deployment, verify with:"
echo "===================================="
echo "# Check health endpoint:"
echo "curl -f https://api.${DOMAIN}/health || echo '⚠️ API health check failed'"
echo ""
echo "# Check frontend:"
echo "curl -f -I https://${DOMAIN} || echo '⚠️ Frontend check failed'"
echo ""
echo "# Check all services status:"
echo "docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps"