# RelayForge - Claude Context

## What it is
Hosted MCP server platform that provides access to multiple services through a single URL. Users bring their own API keys for non-OAuth services.

## Tech Stack
- **Monorepo**: Turbo + pnpm
- **Frontend**: React (port 5173)  
- **Gateway**: Fastify (port 3001)
- **OAuth Service**: Centralized token management (OAuth only)
- **MCP Servers**: Language-agnostic containers (Node.js, Python, Go, etc.)
- **Infrastructure**: Docker containers with HTTP-based communication

## Commands
```bash
pnpm install    # Install deps
pnpm dev        # Start all services
pnpm build      # Build all
pnpm lint       # Run linting
```

## Architecture Overview

### Core Philosophy
- **One URL, All Services**: Single MCP endpoint per user
- **We handle OAuth**: Google, GitHub, Slack authentication
- **Users provide API keys**: OpenAI, Anthropic, etc. via client config
- **Pay per use**: Different rates for different services

### How It Works

```
User configures ONE server:
relayforge.com/mcp/{session-id}
            ↓
    Provides access to:
    - Google Calendar ✓
    - Google Drive ✓
    - GitHub ✓
    - OpenAI ✓
    - Slack ✓
    - 50+ more services
```

## User Identity System

### Primary Account Structure
```
Primary Account: alice@gmail.com
├── OAuth Services (we manage):
│   ├── Google (alice@gmail.com)
│   ├── GitHub (alice@company.com) [linked]
│   └── Slack (alice@slack.com) [linked]
├── API Key Services (user provides):
│   ├── OpenAI (156 calls today)
│   ├── Anthropic (89 calls today)
│   └── Stripe (0 calls)
└── Balance: $3.50 (350 credits)
```

### Account Linking Flow

1. **First Service Connection**:
   - User connects Google with alice@gmail.com
   - System creates primary account
   - Assigns $5.00 free credits

2. **Adding Different Email Service**:
   - User connects GitHub (uses alice@company.com)
   - System detects new email
   - Prompts: "Link to existing account alice@gmail.com?"
   - User confirms → Same account, same balance

3. **Account Discovery**:
   - Checks if OAuth email exists in any linked account
   - Prevents duplicate accounts
   - Maintains single billing relationship

## Service Architecture

### 1. OAuth Service (OAuth Only)
```
packages/oauth-service/
├── providers/
│   ├── google.ts
│   ├── github.ts
│   └── slack.ts
├── token-manager.ts    # Encrypted OAuth token storage
├── account-linker.ts   # Email → Account mapping
└── token-refresh.ts    # Automatic token refresh with retry logic
```

#### OAuth Token Management
- **Automatic Refresh**: Tokens refreshed 5 minutes before expiry via `getValidToken()`
- **Retry Logic**: Exponential backoff with 3 attempts for transient failures
- **Concurrent Protection**: Prevents multiple simultaneous refresh attempts
- **Health Tracking**: Marks connections unhealthy after 3 consecutive failures
- **Token Rotation**: Supports providers that rotate refresh tokens

### 2. MCP Gateway
```typescript
// Single endpoint for all services
POST /mcp/{session-id}
{
  "method": "google_calendar.create_event",  // Service identified by prefix
  "params": { ... }
}

// Gateway routes internally with configurable provider mapping
Router: {
  "google_calendar.*" → Google Calendar MCP Server (OAuth: google)
  "github.*" → GitHub MCP Server (OAuth: github)
  "openai.*" → OpenAI MCP Server (API Key: client-provided)
}

// Provider mapping in config/service-providers.ts
// Extensible for new services without code changes
```

### 3. Service Discovery
```typescript
// Our custom API (not part of MCP protocol)
GET /mcp/{session-id}/services

Response: {
  "services": [
    {
      "id": "google-calendar",
      "methods": ["create_event", "list_events", "update_event"],
      "auth": "oauth",
      "status": "connected",
      "price_per_call": 0.02
    },
    {
      "id": "openai",
      "methods": ["complete", "embed", "image"],
      "auth": "client-key",
      "status": "active",  // Based on recent usage
      "price_per_call": 0.005,
      "setup": {
        "required_env": "OPENAI_API_KEY"
      }
    }
  ],
  "account": {
    "primary_email": "alice@gmail.com",
    "balance": 3.50,
    "linked_emails": ["alice@company.com", "alice@slack.com"]
  }
}
```

## Pricing Model

### Per-Call Pricing
```typescript
const servicePricing = {
  // OAuth services (we pay for API + compute)
  'google-calendar': 0.02,    // 2¢ per call
  'google-drive': 0.03,       // 3¢ per call
  'github': 0.01,             // 1¢ per call
  'slack': 0.02,              // 2¢ per call
  
  // Client-key services (compute only)
  'openai': 0.005,            // 0.5¢ per call
  'anthropic': 0.005,         // 0.5¢ per call
  'stripe': 0.01,             // 1¢ per call
};
```

## Client Configuration

### Single Server Setup
```json
// User's Claude/Cursor config
{
  "mcpServers": {
    "relayforge": {
      "url": "https://relayforge.com/mcp/abc123xyz",
      "env": {
        // API keys never touch our servers
        "OPENAI_API_KEY": "sk-...",
        "ANTHROPIC_API_KEY": "...",
        "STRIPE_API_KEY": "..."
      }
    }
  }
}
```

### MCP Protocol Response
```typescript
// When Claude connects, we expose ALL services
{
  "capabilities": {
    "tools": {
      // Google Calendar tools
      "google_calendar.create_event": { ... },
      "google_calendar.list_events": { ... },
      
      // GitHub tools
      "github.create_issue": { ... },
      "github.list_repos": { ... },
      
      // OpenAI tools (if configured)
      "openai.complete": { ... },
      "openai.generate_image": { ... },
      
      // ... all other services
    }
  }
}
```

## Database Schema

```typescript
interface User {
  userId: string;           // UUID
  primaryEmail: string;     // Changeable
  credits: number;          // $1 = 100 credits
  createdAt: Date;
  
  // All linked emails
  linkedEmails: Array<{
    email: string;
    provider: string;       // Which OAuth provider
    linkedAt: Date;
    isPrimary: boolean;
  }>;
  
  // OAuth connections
  oauthServices: Array<{
    provider: string;       // 'google', 'github', 'slack'
    email: string;
    scopes: string[];
    connectedAt: Date;
  }>;
  
  // No API key configuration tracking needed
}

interface Usage {
  userId: string;
  service: string;          // Which service was called
  timestamp: Date;
  credits: number;          // Cost in credits
  success: boolean;         // For basic troubleshooting
  // Minimal tracking - no detailed errors or methods
}
```

## Request Flow

```typescript
class MCPGateway {
  async handleRequest(sessionId: string, request: MCPRequest) {
    const user = await getUserBySession(sessionId);
    const [service, method] = request.method.split('.');
    
    // Check balance
    const cost = servicePricing[service];
    if (user.credits < cost) {
      return { error: "Insufficient credits" };
    }
    
    // Handle auth
    if (isOAuthService(service)) {
      const token = await oauthService.getValidToken(user.id, service);
      request.headers['Authorization'] = `Bearer ${token}`;
    } else if (isApiKeyService(service)) {
      if (!request.headers[`X-${service}-Key`]) {
        return {
          error: `Missing API key`,
          help: `Add ${service.toUpperCase()}_API_KEY to your MCP client config`
        };
      }
    }
    
    // Route to appropriate MCP server
    try {
      const response = await routeToMCPServer(service, request);
      
      // Track usage for billing
      await trackUsage(user.id, service, cost, true);
      
      return response;
    } catch (error) {
      // Still track failed attempts for billing transparency
      await trackUsage(user.id, service, cost, false);
      throw error;
    }
  }
}
```

## Implementation Phases

### Phase 1: Core Platform
- User accounts with email linking
- OAuth service (Google only)
- Basic gateway routing
- Credit system
- Service discovery API

### Phase 2: First Services
- Google Calendar MCP (OAuth)
- OpenAI MCP (client-key)
- GitHub MCP (OAuth)
- Usage tracking

### Phase 3: Service Expansion
- 10+ OAuth services
- 20+ API key services
- Bulk credit packages
- Dashboard improvements

## Usage Tracking

**We track minimal data for billing and support:**
- Service name and timestamp for each call
- Credits charged
- Success/failure status (helps with troubleshooting)
- No detailed error messages or sensitive data

**This enables:**
- Transparent billing ("You made 156 OpenAI calls today")
- Basic support ("Your Stripe calls are failing - check your API key")
- Usage analytics to improve popular services

## Security Benefits

1. **No API Key Storage**: Zero liability
2. **OAuth Token Encryption**: Secure token storage
3. **Account Isolation**: Each user isolated
4. **Audit Trail**: Complete usage history
5. **Rate Limiting**: Prevent abuse

## Hook Commands
- Build: `pnpm build`
- Test: `pnpm test` 
- Lint: `pnpm lint`