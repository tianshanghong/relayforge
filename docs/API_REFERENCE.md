# RelayForge API Reference

## Overview

RelayForge provides a unified API gateway for accessing multiple MCP (Model Context Protocol) services through a single endpoint. All API endpoints are served over HTTPS with Cloudflare proxy protection.

## Base URLs

- **Production**: `https://api.relayforge.xyz`
- **Main Site**: `https://relayforge.xyz`

## Authentication

RelayForge uses two types of authentication:

### 1. Bearer Token (for MCP clients)
```http
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
```
Used for: MCP endpoints, service discovery, token revocation

### 2. Session Cookie (for web UI)
```http
Cookie: session=...
```
Used for: Dashboard, token management UI

## API Endpoints

### Public Endpoints (No Authentication)

#### Health Checks

##### GET `/health`
Returns combined health status of all services.

**Response**
```json
{
  "status": "ok",
  "services": ["oauth", "gateway"]
}
```

##### GET `/health/oauth`
Returns OAuth service health status.

**Response**
```json
{
  "status": "ok",
  "timestamp": "2024-08-15T10:30:00Z"
}
```

##### GET `/health/gateway`
Returns MCP Gateway health status.

**Response**
```json
{
  "status": "ok",
  "timestamp": "2024-08-15T10:30:00Z"
}
```

### OAuth Flow Endpoints

#### GET `/oauth/google`
Initiates Google OAuth authentication flow.

**Query Parameters**
- `redirect_uri` (optional): Where to redirect after authentication

**Response**
- Redirects to Google OAuth consent page

#### GET `/oauth/google/callback`
Handles Google OAuth callback.

**Query Parameters**
- `code`: OAuth authorization code from Google
- `state`: State parameter for security

**Response**
- Redirects to dashboard with session cookie set

#### GET `/oauth/github` (Planned)
Initiates GitHub OAuth authentication flow.

#### GET `/oauth/github/callback` (Planned)
Handles GitHub OAuth callback.

### MCP Endpoints (Bearer Token Required)

#### POST `/mcp/u/{slug}`
Main MCP request endpoint for all service calls.

**Parameters**
- `slug`: User's unique identifier (e.g., `happy-dolphin-42`)

**Headers**
```http
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
Content-Type: application/json
```

**Request Body**
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "google-calendar.create_event",
  "params": {
    "title": "Team Meeting",
    "start": "2024-08-15T10:00:00Z",
    "end": "2024-08-15T11:00:00Z"
  }
}
```

**Response**
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "eventId": "abc123",
    "htmlLink": "https://calendar.google.com/event?id=abc123"
  }
}
```

**Error Response**
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32000,
    "message": "Insufficient credits",
    "data": {
      "service": "Google Calendar",
      "userCredits": 0.15,
      "requiredCredits": 0.02,
      "shortBy": 0.00
    }
  }
}
```

#### WebSocket `/mcp/u/{slug}/ws`
WebSocket endpoint for streaming MCP connections.

**Parameters**
- `slug`: User's unique identifier

**Headers**
```http
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
Upgrade: websocket
Connection: Upgrade
```

**Message Format**
Same as POST endpoint but over WebSocket frames.

### Service Discovery (Bearer Token Required)

#### GET `/services`
Returns available services and account information.

**Headers**
```http
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
```

**Response**
```json
{
  "services": [
    {
      "id": "google-calendar",
      "name": "Google Calendar",
      "methods": [
        "google-calendar.create_event",
        "google-calendar.list_events",
        "google-calendar.update_event",
        "google-calendar.delete_event"
      ],
      "auth": "oauth",
      "connected": true,
      "price_per_call": 0.02,
      "last_used": "2024-08-15T09:30:00Z"
    },
    {
      "id": "openai",
      "name": "OpenAI",
      "methods": [
        "openai.complete",
        "openai.embed",
        "openai.generate_image"
      ],
      "auth": "client-key",
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

### Token Management (Session Cookie Required)

#### GET `/api/tokens`
List user's MCP tokens (Web UI endpoint).

**Headers**
```http
Cookie: session=...
```

**Response**
```json
{
  "tokens": [
    {
      "id": "token_123",
      "name": "Claude Desktop",
      "prefix": "mcp_live_a7b9",
      "createdAt": "2024-08-10T10:00:00Z",
      "lastUsedAt": "2024-08-15T09:30:00Z"
    }
  ]
}
```

#### POST `/api/tokens`
Create a new MCP token.

**Headers**
```http
Cookie: session=...
Content-Type: application/json
```

**Request Body**
```json
{
  "name": "Claude Desktop"
}
```

**Response**
```json
{
  "id": "token_456",
  "name": "Claude Desktop",
  "token": "mcp_live_xxxxxxxxxxxxx",
  "message": "Save this token securely. You won't be able to see it again."
}
```

#### DELETE `/api/tokens/{tokenId}`
Delete (revoke) an MCP token.

**Parameters**
- `tokenId`: Token ID to delete

**Headers**
```http
Cookie: session=...
```

**Response**
```json
{
  "success": true
}
```

### Token Revocation (Bearer Token Required)

#### POST `/tokens/revoke`
Revoke an MCP token using another valid token.

**Headers**
```http
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
Content-Type: application/json
```

**Request Body**
```json
{
  "tokenId": "token_123"
}
```

**Response**
```json
{
  "success": true
}
```

## Rate Limits

- OAuth endpoints: 5 requests/second per IP
- MCP endpoints: 10 requests/second per IP
- Burst allowance: 20 requests for MCP, 10 for OAuth

## Error Codes

### HTTP Status Codes
- `200` - Success
- `401` - Unauthorized (missing/invalid token)
- `402` - Payment Required (insufficient credits)
- `403` - Forbidden (token doesn't match user)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error
- `502` - Bad Gateway (service unavailable)
- `521` - Web Server Is Down (Cloudflare error)

### MCP Error Codes (JSON-RPC)
- `-32600` - Invalid Request
- `-32601` - Method not found
- `-32602` - Invalid params
- `-32603` - Internal error
- `-32000` - Server error (custom errors like insufficient credits)

## Service Method Naming Convention

All service methods follow the pattern: `{service}.{method}`

Examples:
- `google-calendar.create_event`
- `google-calendar.list_events`
- `github.create_issue`
- `openai.complete`
- `hello_world.greet`

## WebSocket Protocol

The WebSocket endpoint (`/mcp/u/{slug}/ws`) uses the same JSON-RPC format as the HTTP endpoint but maintains a persistent connection for:
- Reduced latency
- Streaming responses
- Real-time updates

### Connection Flow
1. Client connects with Bearer token in headers
2. Server validates token
3. Client sends JSON-RPC requests as text frames
4. Server responds with JSON-RPC responses
5. Connection remains open for multiple requests

### Disconnection
- Client can close connection anytime
- Server closes on invalid token or system shutdown
- Automatic reconnection should be handled by client

## Security Headers

All responses include:
- `X-Frame-Options: SAMEORIGIN` (DENY for API)
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## CORS Policy

- Frontend domain (`relayforge.xyz`) is allowed
- Credentials are supported for session cookies
- Custom headers allowed: `Authorization`, `Content-Type`

## Client Configuration Example

### Claude Desktop / Cursor
```json
{
  "mcpServers": {
    "relayforge": {
      "type": "http",
      "url": "https://api.relayforge.xyz/mcp/u/happy-dolphin-42",
      "headers": {
        "Authorization": "Bearer mcp_live_xxxxxxxxxxxxx"
      },
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "ANTHROPIC_API_KEY": "..."
      }
    }
  }
}
```

## Testing Endpoints

### Using curl

#### Test health
```bash
curl https://api.relayforge.xyz/health
```

#### Test service discovery
```bash
curl -H "Authorization: Bearer mcp_live_xxxxx" \
  https://api.relayforge.xyz/services
```

#### Make an MCP call
```bash
curl -X POST \
  -H "Authorization: Bearer mcp_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"hello_world.greet","params":{"name":"Alice"}}' \
  https://api.relayforge.xyz/mcp/u/happy-dolphin-42
```

## Monitoring

- Health endpoints should return within 1 second
- WebSocket connections timeout after 86400 seconds (24 hours) of inactivity
- All requests are logged with response times and status codes

## Future Endpoints (Planned)

- `/oauth/slack` - Slack OAuth flow
- `/billing/credits` - Purchase additional credits
- `/billing/history` - View usage history
- `/admin/*` - Admin dashboard (separate auth)