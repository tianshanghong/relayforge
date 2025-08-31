# RelayForge Deployment Guide

This comprehensive guide will help you deploy RelayForge from scratch on a VPS. Follow each step carefully to ensure a successful deployment.

## Quick Start (Experienced Users)

If you're familiar with Docker and VPS deployment:

```bash
# 1. Point your domain to VPS IP
# 2. SSH to VPS and run:
cd /opt && git clone https://github.com/tianshanghong/relayforge.git && cd relayforge
./scripts/setup-vps.sh staging yourdomain.com

# 3. Add Google OAuth credentials to .env
nano .env  # Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

# 4. Set up SSL certificates (see Step 4)
mkdir -p nginx/ssl && cd nginx/ssl
# Add your SSL certificates here

# 5. Deploy (for staging)
# Build frontend with correct API URL
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com \
  --build-arg VITE_OAUTH_SERVICE_URL=https://api.yourdomain.com \
  frontend
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate up db-migrate

# Done! Visit https://yourdomain.com
```

For detailed instructions, continue reading below.

## Prerequisites

Before starting, ensure you have:

1. **VPS Server**
   - Ubuntu 22.04 or 24.04 LTS
   - Minimum 2GB RAM (4GB recommended)
   - 20GB storage
   - Root or sudo access

2. **Domain Name**
   - A registered domain (e.g., yourdomain.com)
   - Access to DNS management

3. **Google Cloud Account**
   - For OAuth authentication setup
   - Access to Google Cloud Console

4. **Cloudflare Account (Recommended)**
   - For SSL certificates and DDoS protection
   - Free plan is sufficient

## Step 1: DNS Configuration

First, configure your domain to point to your VPS.

### Option A: Using Cloudflare (Recommended)

1. Add your domain to Cloudflare
2. Update your domain's nameservers to Cloudflare's
3. In Cloudflare DNS, add:
   ```
   Type  Name    Content           Proxy Status
   A     @       your-server-ip    Proxied (orange cloud)
   A     www     your-server-ip    Proxied (orange cloud)
   ```
4. Wait for DNS propagation (5-30 minutes)

### Option B: Direct DNS

In your DNS provider, add:
```
Type  Name    Value
A     @       your-server-ip
A     www     your-server-ip
```

## Step 2: Server Initial Setup

SSH into your VPS as root:

```bash
ssh root@your-server-ip
```

Install required software:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose (latest version)
apt install -y jq
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name)
curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

## Step 3: Google OAuth Credentials Setup

This is required for user authentication and Google Calendar access.

1. **Go to [Google Cloud Console](https://console.cloud.google.com)**

2. **Create a new project** (or select existing):
   - Click "Select a project" → "New Project"
   - Name it (e.g., "RelayForge")
   - Click "Create"

3. **Enable required APIs**:
   - Go to "APIs & Services" → "Library"
   - Search and enable:
     - Google Calendar API
     - Google+ API (for user profile)

4. **Configure OAuth consent screen**:
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" user type
   - Fill in required fields:
     - App name: RelayForge
     - User support email: your-email@domain.com
     - Authorized domains: yourdomain.com
     - Developer contact: your-email@domain.com
   - Add scopes:
     - `../auth/userinfo.email`
     - `../auth/userinfo.profile`
     - `../auth/calendar`
   - Add test users if in testing mode

5. **Create OAuth 2.0 credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "RelayForge Web Client"
   - Authorized redirect URIs (replace with your domain):
     - For staging: `https://api.yourdomain.com/oauth/google/callback`
     - For production: `https://api.yourdomain.com/oauth/google/callback`
   - Click "Create"

6. **Save your credentials**:
   ```
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
   ```
   Keep these safe - you'll need them in Step 5

## Step 4: SSL Certificate Setup

SSL is required for HTTPS. Choose one option:

### Option A: Cloudflare Origin Certificate (Recommended)

1. **Generate Origin Certificate**:
   - Go to Cloudflare Dashboard → SSL/TLS → Origin Server
   - Click "Create Certificate"
   - Keep RSA selected
   - Hostnames: `*.yourdomain.com, yourdomain.com`
   - Certificate validity: 15 years
   - Click "Create"

2. **Save certificates on your VPS**:
   ```bash
   # On your VPS, create SSL directory
   mkdir -p /opt/relayforge/nginx/ssl
   cd /opt/relayforge/nginx/ssl
   
   # Create certificate file
   cat > cloudflare-origin.pem << 'EOF'
   -----BEGIN CERTIFICATE-----
   [Paste your certificate content here]
   -----END CERTIFICATE-----
   EOF
   
   # Create private key file
   cat > cloudflare-origin-key.pem << 'EOF'
   -----BEGIN PRIVATE KEY-----
   [Paste your private key content here]
   -----END PRIVATE KEY-----
   EOF
   
   # Set proper permissions
   chmod 600 *
   ```

3. **Configure Cloudflare SSL mode**:
   - Go to SSL/TLS → Overview
   - Set encryption mode to "Full" or "Full (strict)"

### Option B: Let's Encrypt (Free SSL)

```bash
# Install certbot
apt install certbot -y

# Stop any services using port 80
docker-compose down

# Generate certificate
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Create symlinks for nginx
mkdir -p /opt/relayforge/nginx/ssl
ln -s /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/relayforge/nginx/ssl/cloudflare-origin.pem
ln -s /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/relayforge/nginx/ssl/cloudflare-origin-key.pem
```

### Option C: Self-Signed (Development Only)

```bash
mkdir -p /opt/relayforge/nginx/ssl
cd /opt/relayforge/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout cloudflare-origin-key.pem \
  -out cloudflare-origin.pem \
  -subj "/CN=yourdomain.com"
chmod 600 *
```

## Step 5: Deploy RelayForge

### Option A: Automated Setup (Easiest)

```bash
# Clone repository first
cd /opt
git clone https://github.com/tianshanghong/relayforge.git
cd relayforge

# Run setup script
# For staging (builds from source code):
./scripts/setup-vps.sh staging yourdomain.com

# For production (uses pre-built images):
./scripts/setup-vps.sh production yourdomain.com
```

The script will:
- Generate all security keys automatically
- Create .env file with proper configuration
- Set up directory structure
- Display deployment commands

### Option B: Manual Setup (More Control)

```bash
# Clone repository
cd /opt
git clone https://github.com/tianshanghong/relayforge.git
cd relayforge

# Copy environment template
cp .env.staging.example .env
```

#### Configure Environment Variables

Edit the `.env` file with your settings:

```bash
nano .env
```

**Required variables to configure:**

```env
# Environment (use 'production' for both staging and production)
NODE_ENV=production

# Database - Generate strong password
POSTGRES_PASSWORD=your-secure-database-password-here
POSTGRES_DB=relayforge_staging  # or relayforge for production

# Security Keys - MUST generate unique keys for each!
# Generate each with: openssl rand -hex 32
ENCRYPTION_KEY=  # 64 characters hex (use: openssl rand -hex 32)
JWT_SECRET=      # 32+ characters (use: openssl rand -hex 32)
COOKIE_SECRET=   # 32+ characters (use: openssl rand -hex 32)
ADMIN_KEY=       # 32+ characters (use: openssl rand -hex 32)
INTERNAL_API_KEY=# 32+ characters (use: openssl rand -hex 32)

# Google OAuth - From Step 3
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret-here

# Domain Configuration - Update with your domain
DOMAIN_NAME=yourdomain.com
FRONTEND_URL=https://yourdomain.com
OAUTH_SERVICE_URL=https://yourdomain.com
MCP_BASE_URL=https://yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/oauth/google/callback
ALLOWED_ORIGINS=https://yourdomain.com

# Frontend Configuration
VITE_API_BASE_URL=https://yourdomain.com
VITE_OAUTH_SERVICE_URL=https://yourdomain.com
```

**Generate security keys quickly:**

```bash
# Generate all keys at once
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "COOKIE_SECRET=$(openssl rand -hex 32)"
echo "ADMIN_KEY=$(openssl rand -hex 32)"
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
```

Copy the output and update your .env file.

## Step 6: Start Services

```bash
# For STAGING (builds from source code)
# First, build frontend with correct API URL
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com \
  --build-arg VITE_OAUTH_SERVICE_URL=https://api.yourdomain.com \
  frontend

# Then build and start all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# For PRODUCTION (uses pre-built Docker images)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

All services should show as "Up" and healthy.

## Step 7: Run Database Migrations

```bash
# Run migrations to set up database schema
docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate up db-migrate

# You should see:
# "All migrations have been successfully applied."
```

## Step 8: Verify Deployment

1. **Check services are running:**
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
   ```
   All should show "healthy" status.

2. **Check logs for errors:**
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
   ```

3. **Test website access:**
   - Open browser to: https://yourdomain.com
   - You should see the RelayForge landing page
   - Click "Login with Google" to test OAuth

4. **Test API health:**
   ```bash
   curl https://yourdomain.com/health
   ```


## Common Commands

```bash
# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Update staging (rebuild from source)
git pull
# Build frontend with correct API URL
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com \
  --build-arg VITE_OAUTH_SERVICE_URL=https://api.yourdomain.com \
  frontend
# Build and restart all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Update production (pull new images)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Restart a service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart oauth-service

# Stop all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# Start all services (staging)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Start all services (production)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Staging vs Production

| Aspect | Staging | Production |
|--------|---------|------------|
| **Docker Images** | Built from source with `--build` | Pre-built from GitHub registry |
| **Purpose** | Test latest code changes | Stable, tested releases |
| **Deployment** | `up -d --build` | `pull` then `up -d` |
| **Domain** | staging.yourdomain.com | yourdomain.com |
| **Database** | relayforge_staging | relayforge |

Both environments use the same `docker-compose.prod.yml` configuration file.

## Troubleshooting Guide

### Service Won't Start

**oauth-service fails with "Invalid enum value":**
```bash
# Check NODE_ENV value
grep NODE_ENV .env
# Must be 'production', not 'staging'
sed -i 's/NODE_ENV=.*/NODE_ENV=production/' .env
docker-compose restart oauth-service
```

**mcp-gateway fails with "OAuth configuration required":**
```bash
# Check required variables
grep -E "INTERNAL_API_KEY|OAUTH_SERVICE_URL" .env
# Both must be set, generate if missing:
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)" >> .env
docker-compose restart mcp-gateway
```

**nginx fails with SSL certificate error:**
```bash
# Check certificates exist
ls -la nginx/ssl/
# If missing, see Step 4 for SSL setup
# For quick testing, use self-signed:
cd nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout cloudflare-origin-key.pem \
  -out cloudflare-origin.pem \
  -subj "/CN=yourdomain.com"
chmod 600 *
docker-compose restart nginx
```

### Database Issues

**"relation does not exist" errors:**
```bash
# Run migrations
docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate up db-migrate
```

**Cannot connect to database:**
```bash
# Check postgres is healthy
docker-compose ps postgres
# Check DATABASE_URL in .env
grep DATABASE_URL .env
```

### OAuth Login Issues

**"Redirect URI mismatch" error:**
1. Check Google Cloud Console redirect URI matches exactly
2. Common mistake: missing/extra trailing slash
3. Verify in .env:
   ```bash
   grep GOOGLE_REDIRECT_URI .env
   # Should match Google Console exactly
   ```

**"Invalid client" error:**
```bash
# Verify credentials
grep -E "GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET" .env
# Must match Google Cloud Console values exactly
```

### SSL/HTTPS Issues

**Cloudflare "SSL handshake failed":**
1. Check SSL mode is "Full" or "Full (strict)" in Cloudflare
2. Verify certificates are properly formatted
3. Check nginx logs:
   ```bash
   docker-compose logs nginx
   ```

**Let's Encrypt rate limits:**
- Use staging environment for testing
- Wait 1 hour if rate limited
- Consider using Cloudflare instead

### General Debugging

**View all logs:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
```

**View specific service logs:**
```bash
docker-compose logs oauth-service -f
docker-compose logs mcp-gateway -f
docker-compose logs nginx -f
```

**Check container health:**
```bash
docker-compose ps
# All should show "healthy" or "Up"
```

**Restart everything:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Support

- GitHub Issues: https://github.com/tianshanghong/relayforge/issues
- Logs: `./scripts/deployment/logs.sh`

## Production Checklist

### Security
- [ ] All environment variables are set with secure values
- [ ] Database has strong password
- [ ] SSL certificates are configured
- [ ] CORS settings are restricted to your domains

### Post-Deployment
- [ ] Test the full user flow (login → create token → use with Claude)
- [ ] Monitor resource usage: `docker stats`
- [ ] Set up PostgreSQL backups
- [ ] Configure monitoring (optional)

## Alternative Deployment Options

### Cloud Platforms (Vercel + Railway)
For managed infrastructure with auto-scaling:
- Frontend: Deploy to Vercel/Netlify
- Backend: Deploy to Railway/Render
- Database: Use managed PostgreSQL

### Enterprise (AWS/GCP)
For full control and scalability:
- Use ECS/Cloud Run for containers
- RDS/Cloud SQL for database
- CloudFront/Cloud CDN for frontend
- Terraform for infrastructure as code

## Next Steps

After successful deployment:
1. Add more OAuth providers (GitHub, Slack)
2. Implement API key services (OpenAI, Anthropic)
3. Add payment processing for credit purchases
4. Build usage analytics dashboard

Congratulations! Your RelayForge instance is now live! 🎉