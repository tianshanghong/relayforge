# RelayForge Deployment Guide

This guide will help you deploy RelayForge on a VPS (Hetzner, DigitalOcean, etc.) in under 10 minutes.

## MVP Features Ready for Deployment

✅ **Core Platform**
- User authentication via OAuth (Google)
- Bearer token authentication for MCP clients
- Session management with secure cookies
- Credit system with $5 free credits for new users

✅ **Services**
- Google Calendar MCP server (full CRUD operations)
- Service discovery API
- Usage tracking and billing

✅ **Frontend**
- Landing page with OAuth login
- Token management UI
- Account dashboard

## Prerequisites

- A VPS (Hetzner, DigitalOcean, etc.) with at least 2GB RAM
- Domain name (relayforge.xyz) with DNS access
- Google OAuth credentials from Google Cloud Console

## Step 1: Server Setup (3 minutes)

SSH into your server and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login again for docker group to take effect
exit
```

## Step 2: DNS Configuration (2 minutes)

### Option A: Using Cloudflare (Recommended)
See [Cloudflare Setup Guide](./CLOUDFLARE_SETUP.md) for detailed instructions on:
- Setting up Cloudflare proxy with DDoS protection
- Configuring Origin Certificates for SSL
- Enabling Full SSL mode for end-to-end encryption

### Option B: Direct DNS
In your DNS provider, create these A records:

```
@        A    <your-server-ip>    # relayforge.xyz
api      A    <your-server-ip>    # api.relayforge.xyz
```

## Step 3: Google OAuth Setup (2 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials:
   - Authorized redirect URI: `https://api.relayforge.xyz/oauth/google/callback`
   - Copy Client ID and Client Secret

## Step 4: Deploy RelayForge (5 minutes)

### Automated Setup (Recommended)

```bash
# For staging environment (builds from source)
curl -sSL https://raw.githubusercontent.com/tianshanghong/relayforge/main/scripts/setup-vps.sh | bash -s staging yourdomain.com

# For production environment (uses pre-built images)
curl -sSL https://raw.githubusercontent.com/tianshanghong/relayforge/main/scripts/setup-vps.sh | bash -s production yourdomain.com
```

### Manual Setup

```bash
# Clone the repository
git clone https://github.com/tianshanghong/relayforge.git
cd relayforge

# Copy environment template
cp .env.production.example .env  # or .env.staging.example for staging

# Edit .env file and add your credentials
nano .env
```

Required environment variables:
```env
# Database
POSTGRES_PASSWORD=<generate-strong-password>

# Security Keys (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=<64-char-hex-string>
JWT_SECRET=<random-string>
COOKIE_SECRET=<random-string>
ADMIN_KEY=<random-string>
INTERNAL_API_KEY=<random-string>

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
```

Continue deployment:
```bash
# For STAGING (builds from source)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# For PRODUCTION (uses pre-built images)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run database migrations
docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm db-migrate

# For SSL setup, see Step 2 (Cloudflare) or use Let's Encrypt
```

## Step 5: Verify Deployment

1. Visit https://relayforge.xyz - you should see the landing page
2. Click "Login with Google" to test OAuth
3. Create an MCP token
4. Configure your Claude/Cursor with the MCP URL and token

## Common Commands

```bash
# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Update staging (rebuild from source)
git pull
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

## Troubleshooting

### Services not starting
- Check logs: `docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs`
- Verify environment variables in `.env`
- Ensure ports 80 and 443 are not in use
- Check INTERNAL_API_KEY is set for mcp-gateway

### SSL certificate issues
- **Using Cloudflare:** See [Cloudflare Setup Guide](./CLOUDFLARE_SETUP.md) troubleshooting section
- **Using Let's Encrypt:** 
  - Wait for DNS propagation (can take up to 48 hours)
  - Check DNS records: `dig relayforge.xyz`
  - Ensure port 80 is accessible for ACME challenge

### OAuth not working
- Verify redirect URI in Google Cloud Console matches exactly
- Check FRONTEND_URL in environment variables
- Look for errors in oauth-service logs

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