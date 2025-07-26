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

## Product Architecture Design

### User Experience Flow
1. User visits: `relayforge.com/google-calendar`
2. "Connect with Google" → OAuth flow
3. Gets personal URL: `relayforge.com/mcp/google-calendar/abc123xyz` (36+ char random)
4. Paste URL into Claude Code → immediate access
5. Usage tracked, pay-per-API-call model

### Authentication & Security
- **No user registration required** - identified by OAuth email
- **Long random URLs** (36+ characters) for security
- **Client fingerprinting** for basic security (IP + User-Agent)
- **OAuth-based user identity**: `user_id = hash(oauth_email)`

### User Identity System
```
Primary Account: alice@gmail.com (first OAuth connection)
├── Google Calendar (alice@gmail.com) 
├── GitHub (alice.work@company.com) [linked]
├── Slack (alice@outlook.com) [linked]
└── Credits: $3.50 remaining
```

### Account Linking & Management
- **Cross-service linking**: Different emails can link to same account
- **Primary email transfer**: User can change primary email while keeping services
- **Account merging**: "Link to existing account?" when connecting new services
- **Safety measures**: Email verification, 7-day grace period, audit logs

### Payment Model
- **Pay-per-usage**: $0.01 per API call (varies by service complexity)
- **Free credits**: $5 for new users
- **Billing**: Linked to primary email, credits shared across all services
- **Usage tracking**: Per-session monitoring with upgrade prompts

### Technical Implementation
- **Hosted MCP servers**: Fork popular open-source MCP servers for stability
- **Session URLs**: `relayforge.com/mcp/{service}/{encrypted-session-id}`
- **Database**: `user_id` (hash), `primary_email`, `linked_emails[]`, `credits`, `services[]`
- **Security**: Rate limiting, email verification, session binding

### Deployment Strategy
- **Tier 1** (We host): Google Calendar, Slack, GitHub - containers in our infra
- **Tier 2** (Community): Proxy to user-hosted servers with auth wrapping  
- **Tier 3** (Discovery): Catalog of available MCP servers

## Hook Commands
- Build: `pnpm build`
- Test: `pnpm test` 
- Lint: `pnpm lint`