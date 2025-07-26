# RelayForge - Claude Context

## What it is
Hosted remote MCP service platform. Provides MCP servers via simple URLs for AI agents (Claude Code, Cursor).

## Tech Stack
- **Monorepo**: Turbo + pnpm
- **Frontend**: React (port 5173)  
- **Gateway**: Fastify (port 3001)
- **Core**: MCP HTTP/WebSocket adapter

## Commands
```bash
pnpm install    # Install deps
pnpm dev        # Start all services
pnpm build      # Build all
```

## Structure
```
apps/frontend/      # Landing page
apps/mcp-gateway/   # API routing
packages/mcp-adapter/  # HTTP/WebSocket adapter
packages/shared/    # MCP types
```

## Status
✅ Hello world MCP server, HTTP adapter, frontend
🔄 Next: Google Calendar server, auth, Docker

## Hook Commands
- Build: `pnpm build`
- Test: `pnpm test` 
- Lint: `pnpm lint`