# RelayForge

[![PR Validation](https://github.com/tianshanghong/relayforge/actions/workflows/pr-validation.yml/badge.svg)](https://github.com/tianshanghong/relayforge/actions/workflows/pr-validation.yml)
[![Performance Tests](https://github.com/tianshanghong/relayforge/actions/workflows/performance-tests.yml/badge.svg)](https://github.com/tianshanghong/relayforge/actions/workflows/performance-tests.yml)

🚀 **One URL. All MCP services. Pay per use.**

RelayForge is a hosted MCP server platform that provides access to multiple services through a single endpoint. Connect your AI agents (Claude Code, Cursor) once and access all available services.

## Problem

Setting up MCP servers requires:
- Pulling source code from various repositories
- Building and configuring each service
- Managing OAuth flows and authentication
- Maintaining local infrastructure
- Configuring multiple server URLs in your AI client

## Solution

RelayForge provides all MCP services through a single stable endpoint with bearer token authentication:
```
URL: https://relayforge.com/mcp/u/{your-slug}
Header: Authorization: Bearer mcp_live_{your-token}
```

**Key Benefits:**
- **One URL**: Access all MCP services through a single endpoint
- **Stable Configuration**: Your URL never changes, even after re-login
- **OAuth Handled**: We manage authentication for Google Calendar, GitHub, Slack, etc.
- **No Local Setup**: Use MCP servers without installing anything
- **Pay Per Use**: Only pay for what you use, transparent per-call pricing

### Example Configuration

```json
// Claude Desktop or Cursor configuration
{
  "mcpServers": {
    "relayforge": {
      "url": "https://relayforge.com/mcp/u/happy-dolphin-42",
      "headers": {
        "Authorization": "Bearer mcp_live_xxxxxxxxxxxxx"
      },
      "env": {
        // Optional: API keys for services you want to use
        "OPENAI_API_KEY": "sk-...",
        "ANTHROPIC_API_KEY": "..."
      }
    }
  }
}
```

## Architecture

- **Frontend**: React app for account management and service discovery
- **Gateway**: Fastify-based router that directs requests to appropriate MCP servers
- **OAuth Service**: Centralized authentication management for OAuth-based services
- **MCP Servers**: Containerized implementations of various MCP services

## Getting Started

### Prerequisites
- Docker and Docker Compose

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/tianshanghong/relayforge.git
cd relayforge

# 2. Copy environment configuration (optional - has development defaults)
cp .env.example .env
# Edit .env to add your Google OAuth credentials (required for OAuth features)

# 3. Start all services
docker-compose -f docker-compose.dev.yml up --build

# Services will be available at:
# - Frontend: http://localhost:5173
# - OAuth Service: http://localhost:3002  
# - MCP Gateway: http://localhost:3001
# - PostgreSQL: localhost:5432
```

To stop services:
```bash
docker-compose -f docker-compose.dev.yml down

# To reset everything (including database):
docker-compose -f docker-compose.dev.yml down -v
```

For detailed environment variable documentation and OAuth setup, see [Environment Setup Guide](./docs/ENVIRONMENT_SETUP.md).

### Production Deployment

Production uses the same Docker Compose setup with production configuration:

```bash
# 1. Copy production environment configuration
cp .env.production.example .env

# 2. Update .env with production values:
# - Set secure passwords and keys
# - Configure your domain
# - Add OAuth credentials for production

# 3. Start services in production mode
docker-compose -f docker-compose.prod.yml up -d

# Or build and run locally:
docker-compose -f docker-compose.dev.yml up --build -d
```

#### Environment Configuration

| Environment | Docker Compose File | Purpose |
|------------|-------------------|---------|
| Development | `docker-compose.dev.yml` | Local development with hot reload |
| Production | `docker-compose.prod.yml` | Production with pre-built images |
| Database Only | `docker-compose.local.yml` | Just PostgreSQL for hybrid development |

#### Custom Domain Setup

To host RelayForge with your own domain:

1. **Update environment variables** in `.env`:
```bash
DOMAIN_NAME=yourdomain.com
FRONTEND_URL=https://yourdomain.com
MCP_BASE_URL=https://api.yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/oauth/google/callback
```

2. **Configure DNS**:
   - Point `yourdomain.com` to your server
   - Point `api.yourdomain.com` to your server

3. **Update OAuth providers**:
   - Add your redirect URI to Google OAuth authorized callbacks

4. **Deploy with Docker Compose**:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Contributing

This is an open-source project. Check out the [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) list for servers we could add next.
