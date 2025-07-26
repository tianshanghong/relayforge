# RelayForge

🚀 **One-stop shop for hosted remote MCP services**

RelayForge provides remote Model Context Protocol (MCP) servers as a service, eliminating the need to manually set up, configure, and maintain MCP servers locally. Simply connect your AI agents (Claude Code, Cursor) to our hosted services with a single URL.

## Problem

Setting up MCP servers requires:
- Pulling source code from various repositories
- Building and configuring each service
- Managing OAuth flows and authentication
- Maintaining local infrastructure

## Solution

RelayForge hosts popular MCP servers and provides them via simple URLs:
```
https://api.relayforge.xyz/mcp/google-calendar
https://api.relayforge.xyz/mcp/slack
https://api.relayforge.xyz/mcp/github
```

## Architecture

- **Frontend**: Service discovery and management dashboard
- **Backend**: API gateway and MCP server hosting infrastructure
- **Services**: Containerized MCP servers with HTTP/WebSocket adapters

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