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

### Development
```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

### Production
```bash
# Build all services
pnpm build
```

## Contributing

This is an open-source project. Check out the [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) list for servers we could add next.
