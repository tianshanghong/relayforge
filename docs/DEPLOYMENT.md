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

In your DNS provider, create these A records:

```
@        A    <your-server-ip>    # relayforge.xyz
api      A    <your-server-ip>    # api.relayforge.xyz
gateway  A    <your-server-ip>    # gateway.relayforge.xyz
```

## Step 3: Google OAuth Setup (2 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials:
   - Authorized redirect URI: `https://api.relayforge.xyz/oauth/google/callback`
   - Copy Client ID and Client Secret

## Step 4: Deploy RelayForge (5 minutes)

```bash
# Clone the repository
git clone https://github.com/tianshanghong/relayforge.git
cd relayforge

# Copy environment template
cp .env.production.example .env

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

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
```

Continue deployment:
```bash
# Deploy services
./scripts/deployment/deploy.sh

# Set up SSL certificates
sudo ./scripts/deployment/setup-ssl.sh
```

## Step 5: Verify Deployment

1. Visit https://relayforge.xyz - you should see the landing page
2. Click "Login with Google" to test OAuth
3. Create an MCP token
4. Configure your Claude/Cursor with the MCP URL and token

## Common Commands

```bash
# View logs
./scripts/deployment/logs.sh

# Update to latest version
./scripts/deployment/update.sh

# Check service status
docker-compose -f docker-compose.prod.yml ps

# Restart a service
docker-compose -f docker-compose.prod.yml restart oauth-service

# Stop all services
docker-compose -f docker-compose.prod.yml down

# Start all services
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Services not starting
- Check logs: `docker-compose -f docker-compose.prod.yml logs`
- Verify environment variables in `.env`
- Ensure ports 80 and 443 are not in use

### SSL certificate issues
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