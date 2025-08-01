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

### Account Creation & Session Flow

1. **Initial OAuth Authentication**:
   - User authenticates via OAuth (Google/GitHub/Slack)
   - System creates/finds user account based on email
   - User account MUST exist before session creation
   - System generates secure session ID linked to user
   - Returns MCP URL: `https://relayforge.com/mcp/{session-id}`

2. **Automatic Account Merging** (Prevents Credit Abuse):
   - When authenticated user adds new OAuth provider
   - Different email automatically linked to current account
   - NO user prompt (prevents creating multiple accounts for credits)
   - EmailUserMapping prevents that email from creating new accounts

3. **Account Structure**:
   - Each unique email can only create ONE account ever
   - Multiple emails can be linked to single account
   - Credits ($5) only given on first account creation
   - All linked emails share same balance and services

## Service Architecture

### 1. OAuth Service (OAuth Only)
```
packages/oauth-service/
├── providers/
│   ├── google.ts
│   ├── github.ts
│   └── slack.ts
├── token-manager.ts    # Encrypted OAuth token storage
└── account-linker.ts   # Email → Account mapping
```

### 2. MCP Gateway
```typescript
// Single endpoint for all services
POST /mcp/{session-id}
{
  "method": "google_calendar.create_event",  // Service identified by prefix
  "params": { ... }
}

// Gateway routes internally
Router: {
  "google_calendar.*" → Google Calendar MCP Server
  "github.*" → GitHub MCP Server  
  "openai.*" → OpenAI MCP Server
}
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

## Authentication & Session Flow

```typescript
// Complete user journey from OAuth to MCP usage
async function userAuthenticationFlow() {
  // 1. User initiates OAuth
  const oauthResult = await completeOAuth(provider, code);
  const email = oauthResult.email;
  
  // 2. User account creation/lookup
  const existingMapping = await findEmailUserMapping(email);
  
  let user;
  if (!existingMapping) {
    // First time this email has been seen
    user = await createUser({
      primaryEmail: email,
      credits: 500, // $5.00 free credits
      linkedEmails: [{ email, provider }],
      oauthServices: [{ provider, email, scopes }]
    });
    await createEmailUserMapping(email, user.id);
  } else {
    // Email already linked to an account
    user = await getUser(existingMapping.userId);
    // No new credits given
  }
  
  // 3. Session creation (AFTER user exists)
  const session = await createSession({
    userId: user.id,
    expiresIn: 30 // days
  });
  
  // 4. Return MCP URL to user
  return {
    sessionUrl: `https://relayforge.com/mcp/${session.id}`,
    message: existingMapping ? "Welcome back!" : "Account created!"
  };
}

// Adding new OAuth provider when already authenticated
async function addOAuthProvider(currentUserId: string, newProvider: string) {
  const oauthResult = await completeOAuth(newProvider, code);
  const newEmail = oauthResult.email;
  
  // Check if this email is already linked somewhere
  const existingMapping = await findEmailUserMapping(newEmail);
  
  if (existingMapping && existingMapping.userId !== currentUserId) {
    // This email belongs to a different account
    // For MVP: Block this to prevent confusion
    throw new Error("This email is already linked to another account");
  }
  
  if (!existingMapping) {
    // New email - automatically link to current user (no prompt)
    await createEmailUserMapping(newEmail, currentUserId);
    await addLinkedEmail(currentUserId, newEmail, newProvider);
  }
  
  // Add OAuth service to user
  await addOAuthService(currentUserId, newProvider, newEmail);
  
  return { message: `${newProvider} connected successfully!` };
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
      const token = await oauthService.getToken(user.id, service);
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