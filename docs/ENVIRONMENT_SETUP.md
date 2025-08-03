# Environment Variables Setup Guide

This guide covers all environment variables used in RelayForge and how to properly configure them for development and production.

## Overview

RelayForge uses a hierarchical environment configuration:
1. **Root `.env`** - Shared variables used by multiple services
2. **Service-specific `.env`** - Variables specific to each service

## Quick Start

1. Copy the example files:
```bash
cp .env.example .env
cp apps/oauth-service/.env.example apps/oauth-service/.env
cp apps/frontend/.env.example apps/frontend/.env
```

2. Generate secure keys:
```bash
# Generate encryption key
openssl rand -hex 32

# Generate JWT and cookie secrets
openssl rand -hex 32
openssl rand -hex 32
```

3. Update the `.env` files with your values

## Root Environment Variables

Located in `/.env`:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `development`, `production`, `test` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/relayforge` |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for OAuth token encryption | Generate with `openssl rand -hex 32` |

## OAuth Service Variables

Located in `/apps/oauth-service/.env`:

### Server Configuration
| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NODE_ENV` | No | Environment mode | Inherits from root |
| `PORT` | No | Server port | `3002` |
| `LOG_LEVEL` | No | Logging level | `info` |

### Security
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `COOKIE_SECRET` | Yes | 32-character secret for cookie signing | Generate with `openssl rand -hex 32` |
| `JWT_SECRET` | Yes | 32-character secret for JWT signing | Generate with `openssl rand -hex 32` |
| `ADMIN_KEY` | No | Admin API key for protected endpoints | Generate with `openssl rand -hex 32` |

### OAuth Providers
At least one OAuth provider must be configured:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Yes* | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes* | Google OAuth client secret | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | Yes* | Google OAuth callback URL | `http://localhost:3002/oauth/google/callback` |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID | From GitHub Developer Settings |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth client secret | From GitHub Developer Settings |
| `GITHUB_REDIRECT_URI` | No | GitHub OAuth callback URL | `http://localhost:3002/oauth/github/callback` |
| `SLACK_CLIENT_ID` | No | Slack OAuth client ID | From Slack App Management |
| `SLACK_CLIENT_SECRET` | No | Slack OAuth client secret | From Slack App Management |
| `SLACK_REDIRECT_URI` | No | Slack OAuth callback URL | `http://localhost:3002/oauth/slack/callback` |

### Other Configuration
| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Yes | CORS allowed origins (comma-separated) | `http://localhost:5173,http://localhost:3000` |
| `FRONTEND_URL` | Yes | Frontend application URL | `http://localhost:5173` |
| `MCP_BASE_URL` | Yes | MCP Gateway URL | `http://localhost:3001` |
| `SESSION_DURATION_DAYS` | No | Session duration in days | `30` |

## MCP Gateway Variables

Located in `/apps/mcp-gateway/.env`:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NODE_ENV` | No | Environment mode | Inherits from root |
| `PORT` | No | Server port | `3001` |
| `HOST` | No | Server host | `localhost` |

Note: Database URL and encryption key are inherited from root `.env`.

## Frontend Variables

Located in `/apps/frontend/.env`:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `VITE_OAUTH_SERVICE_URL` | Yes | OAuth service URL | `http://localhost:3002` |
| `VITE_MCP_GATEWAY_URL` | Yes | MCP Gateway URL | `http://localhost:3001` |

Note: Vite requires the `VITE_` prefix for environment variables to be accessible in the browser.

## Production Configuration

### Security Considerations

1. **Never commit `.env` files** - Ensure they're in `.gitignore`
2. **Use strong keys** - Always generate cryptographically secure keys
3. **Rotate keys regularly** - Especially after any potential exposure
4. **Use environment-specific values** - Don't reuse development keys in production

### Production Database

For production PostgreSQL with SSL:
```
DATABASE_URL=postgresql://user:password@host:5432/relayforge?schema=public&sslmode=require
```

### Production URLs

Update all service URLs to use HTTPS:
- `FRONTEND_URL=https://app.relayforge.com`
- `MCP_BASE_URL=https://api.relayforge.com`
- `VITE_OAUTH_SERVICE_URL=https://auth.relayforge.com`
- OAuth redirect URIs must match your production domains

## Docker Configuration

When using Docker, pass environment variables through:
- Docker Compose `.env` file
- `docker run -e` flags
- Kubernetes ConfigMaps/Secrets

Example `docker-compose.yml`:
```yaml
services:
  oauth-service:
    env_file:
      - .env
      - apps/oauth-service/.env
```

## Troubleshooting

### Missing Environment Variables
If a service fails to start with "missing required environment variable":
1. Check you've copied the `.env.example` file
2. Ensure all required variables are set
3. Check for typos in variable names

### Invalid Encryption Key
Error: "ENCRYPTION_KEY must be 64 hex characters"
- Generate a new key: `openssl rand -hex 32`
- Ensure the key is exactly 64 characters

### OAuth Provider Issues
- Ensure redirect URIs match exactly (including protocol and port)
- Check client ID and secret are correct
- Verify the OAuth app is properly configured in the provider's console

### CORS Errors
- Add your frontend URL to `ALLOWED_ORIGINS`
- Include the protocol (http/https)
- Separate multiple origins with commas

## Validation Script

Run the environment validation script:
```bash
pnpm validate-env
```

This will check:
- All required variables are set
- Keys are the correct length
- URLs are valid
- Database connection works