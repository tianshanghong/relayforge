# MCP Token API

## Overview

The MCP Token API provides secure bearer token authentication for accessing RelayForge MCP services. Each user can create multiple named tokens for different AI clients (Claude Desktop, Cursor, etc.).

## Token Format

MCP tokens follow this format:
```
mcp_live_{random-base64url-string}
```

Example: `mcp_live_Ab3Cd5Ef7Gh9Ij2Kl4Mn6Op8Qr0St2Uv4Wx6Yz8Ab0Cd2`

## Authentication

All MCP requests require a bearer token in the Authorization header:

```http
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
```

## How to Obtain Tokens

### For New Users

When you first authenticate via OAuth, a default MCP token is automatically created and returned **only once**:

```json
{
  "mcpUrl": "https://relayforge.com/mcp/u/happy-dolphin-42",
  "mcpToken": "mcp_live_xxxxxxxxxxxxx",  // Only shown on first login!
  "sessionId": "session-id-for-web-ui",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "slug": "happy-dolphin-42",
    "credits": 500,
    "isNewUser": true
  }
}
```

⚠️ **Important**: Save this token immediately! It cannot be retrieved later.

### For Existing Users

Existing users can create additional tokens through:
1. The web UI dashboard (coming soon)
2. Token management API endpoints (coming soon)

## Token Management

### Revoke a Token

Revoke a token to immediately invalidate it:

```http
POST /api/tokens/revoke
Authorization: Bearer mcp_live_current_token

{
  "tokenId": "token-uuid-to-revoke"
}
```

**Response:**
```json
{
  "success": true
}
```

**Notes:**
- You must be authenticated with a valid token to revoke tokens
- You can only revoke tokens belonging to your account
- Revoked tokens are immediately invalidated in the cache

### List Your Tokens (Coming Soon)

```http
GET /api/tokens
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
```

### Create New Token (Coming Soon)

```http
POST /api/tokens
Authorization: Bearer mcp_live_xxxxxxxxxxxxx

{
  "name": "Cursor IDE"
}
```

## Using Tokens with MCP

### Configuration Example

```json
// Claude Desktop configuration
{
  "mcpServers": {
    "relayforge": {
      "url": "https://relayforge.com/mcp/u/happy-dolphin-42",
      "headers": {
        "Authorization": "Bearer mcp_live_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### Making MCP Requests

```http
POST https://relayforge.com/mcp/u/happy-dolphin-42
Authorization: Bearer mcp_live_xxxxxxxxxxxxx
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "google-calendar.list_events",
  "params": {
    "maxResults": 10
  }
}
```

### WebSocket Connection

```javascript
const ws = new WebSocket('wss://relayforge.com/mcp/u/happy-dolphin-42/ws', {
  headers: {
    'Authorization': 'Bearer mcp_live_xxxxxxxxxxxxx'
  }
});
```

## Security Best Practices

1. **Treat tokens like passwords**: Never share or commit them to version control
2. **Use environment variables**: Store tokens in secure environment configurations
3. **Create separate tokens**: Use different tokens for different clients/environments
4. **Revoke unused tokens**: Regularly review and revoke tokens you no longer use
5. **Monitor usage**: Check your dashboard for unexpected token usage

## Token Properties

- **Stable URLs**: Your MCP URL (`/mcp/u/{slug}`) never changes
- **Revocable**: Tokens can be revoked without affecting your URL
- **Named**: Each token has a descriptive name for easy management
- **Tracked**: Token usage is tracked for billing and security
- **Cached**: Validated tokens are cached for 5 minutes for performance

## Error Responses

### Invalid or Missing Token
```json
{
  "error": "Invalid or missing authentication",
  "message": "Bearer token is required in Authorization header",
  "help": "Add Authorization: Bearer <token> header to your request",
  "code": "AUTH_REQUIRED"
}
```

### Revoked Token
```json
{
  "error": "Invalid or missing authentication",
  "message": "Bearer token is required in Authorization header",
  "help": "Add Authorization: Bearer <token> header to your request",
  "code": "AUTH_REQUIRED"
}
```

### Token Doesn't Match URL
```json
{
  "error": "Forbidden",
  "message": "Token does not belong to this user",
  "code": "FORBIDDEN"
}
```

## Rate Limiting

- Token validation is cached for 5 minutes to improve performance
- No hard rate limits currently, but this may change
- Excessive usage may trigger security reviews

## Future Enhancements

- Web UI for token management
- Token expiration dates
- Scoped tokens with limited permissions
- API for programmatic token creation
- Detailed usage analytics per token