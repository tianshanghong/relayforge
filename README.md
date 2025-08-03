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
- Node.js 20+
- PostgreSQL 14+
- pnpm 9+

### Development

#### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/tianshanghong/relayforge.git
cd relayforge

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
cp apps/oauth-service/.env.example apps/oauth-service/.env
cp apps/frontend/.env.example apps/frontend/.env

# 4. Generate secure keys
pnpm generate-keys

# 5. Update .env files with your values (database, OAuth credentials, etc.)

# 6. Start PostgreSQL (if using Docker)
pnpm db:start

# 7. Run database migrations
pnpm db:migrate

# 8. Seed the database (optional)
pnpm db:seed

# 9. Validate your environment
pnpm validate-env

# 10. Start development servers
pnpm dev
```

See [Environment Setup Guide](./docs/ENVIRONMENT_SETUP.md) for detailed configuration instructions.

### Production
```bash
# Build all services
pnpm build

# Run with production environment
NODE_ENV=production pnpm start
```

## Contributing

This is an open-source project. Check out the [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) list for servers we could add next.
