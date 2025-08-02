# ADR-001: Stable MCP URLs with Bearer Token Authentication

## Status
Proposed

## Context
Currently, RelayForge generates a new session-based MCP URL (`https://relayforge.com/mcp/{session-id}`) every time a user logs in. This creates two significant problems:

1. **Poor User Experience**: Users must update their AI client configuration (Claude Desktop, Cursor, etc.) after each login
2. **Security Vulnerability**: The session ID in the URL acts as a bearer token, which can be accidentally leaked through:
   - Server access logs
   - Browser history
   - Screenshots shared for support
   - Copy-paste mistakes
   - Proxy logs

## Decision
We will implement stable, user-specific MCP URLs with proper bearer token authentication:

```
URL: https://relayforge.com/mcp/u/{memorable-slug}
Header: Authorization: Bearer mcp_live_{token}
```

Examples:
- `https://relayforge.com/mcp/u/happy-dolphin-42`
- `https://relayforge.com/mcp/u/swift-canyon-17`
- `https://relayforge.com/mcp/u/brave-sunset-99`

### Key Changes:
1. **Stable URLs**: Each user gets a permanent memorable slug that never changes
2. **Memorable Format**: Adjective-noun-number combinations for easy recognition
3. **Bearer Token Auth**: Authentication moves from URL to standard Authorization header
4. **Multiple Tokens**: Users can create multiple tokens for different AI clients
5. **Token Management**: Tokens can be revoked, rotated, and tracked independently

## Consequences

### Positive
- **Better UX**: Configure once in AI client, works forever
- **Security**: No secrets in URLs, follows OAuth 2.0 best practices
- **Auditability**: Can track usage per token
- **Flexibility**: Easy token rotation without breaking integrations
- **Standards Compliance**: Uses standard HTTP authentication

### Negative
- **Additional UI**: Need token management interface (can be added later)

### Neutral
- **Database Changes**: New tables for slugs and tokens

## Implementation Plan

Since we have no existing users, we can implement the secure solution directly without migration concerns:

### Phase 1: Database & Core
- Add `slug` field to User model
- Create McpToken model
- Implement token generation/validation

### Phase 2: OAuth Updates
- Generate slug on user creation
- Create token on first login
- Return new secure format in OAuth response

### Phase 3: Gateway Auth
- Add `/mcp/u/{slug}` route
- Implement bearer token middleware
- Add rate limiting per token

### Phase 4: UI & Management (Later)
- Token management interface
- Usage statistics
- Security features

## Alternatives Considered

### 1. Extend Existing Sessions
- **Pros**: Less work, backwards compatible
- **Cons**: Still changes URL sometimes, doesn't fix security issue

### 2. Session ID in Cookie
- **Pros**: Removes from URL
- **Cons**: MCP clients don't support cookies

### 3. API Key in URL Parameter
- **Pros**: Works with all clients
- **Cons**: Still has security issues with URL logging

## References
- [OAuth 2.0 Bearer Token Usage](https://datatracker.ietf.org/doc/html/rfc6750)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- GitHub Issue #39

## Decision Makers
- Engineering Team
- Security Team
- Product Team

## Date
2024-08-02