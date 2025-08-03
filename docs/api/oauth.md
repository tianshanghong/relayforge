# OAuth Flow Documentation

## Overview

RelayForge uses OAuth 2.0 for user authentication and to obtain access tokens for services like Google Calendar, GitHub, and Slack. This document describes the OAuth flow for user authentication.

## Supported Providers

Currently supported:
- ✅ Google

Coming soon:
- 🚧 GitHub
- 🚧 Slack
- 📋 Microsoft
- 📋 Discord

## OAuth Flow

### 1. Initiate OAuth

Redirect users to:
```
https://api.relayforge.xyz/oauth/{provider}/authorize
```

Example:
```
https://api.relayforge.xyz/oauth/google/authorize
```

Optional query parameters:
- `redirect_url`: URL to redirect to after completion (must be whitelisted)

### 2. User Authorization

Users are redirected to the OAuth provider (e.g., Google) to:
1. Authenticate with their account
2. Review requested permissions
3. Approve or deny access

### 3. Callback Handling

After authorization, users are redirected back to:
```
https://api.relayforge.xyz/oauth/{provider}/callback
```

The callback includes:
- `code`: Authorization code (on success)
- `state`: CSRF protection token
- `error`: Error code (on failure, e.g., "access_denied")

### 4. Token Exchange

RelayForge automatically:
1. Validates the CSRF state
2. Exchanges the code for access/refresh tokens
3. Stores encrypted tokens securely
4. Creates or finds the user account

### 5. Response

For new users, the response includes:
```json
{
  "mcpUrl": "https://relayforge.com/mcp/u/happy-dolphin-42",
  "mcpToken": "mcp_live_xxxxxxxxxxxxx",  // Only for new users!
  "sessionId": "session-for-web-ui",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "slug": "happy-dolphin-42",
    "credits": 500,
    "isNewUser": true
  }
}
```

For existing users:
```json
{
  "mcpUrl": "https://relayforge.com/mcp/u/happy-dolphin-42",
  "sessionId": "session-for-web-ui",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "slug": "happy-dolphin-42",
    "credits": 350,
    "isNewUser": false
  }
}
```

## Account Linking

When a user authenticates with a different email through another OAuth provider:
- The new email is automatically linked to their existing account
- No new credits are given
- All linked emails share the same balance and services

Example:
1. User signs up with alice@gmail.com (Google) → Gets $5 credits
2. User later adds alice@company.com (GitHub) → Same account, no new credits
3. Both emails can be used to sign in to the same account

## Token Refresh

OAuth tokens are automatically refreshed when:
- Token expires (checked 5 minutes before expiry)
- API call fails with 401 Unauthorized

The refresh process:
1. Uses exponential backoff for retries
2. Marks unhealthy connections after multiple failures
3. Maintains service availability during refresh

## Security Considerations

1. **CSRF Protection**: All OAuth flows use state parameters
2. **Token Encryption**: Access/refresh tokens are encrypted at rest
3. **Scope Validation**: Required scopes are enforced
4. **HTTPS Only**: All OAuth endpoints require HTTPS
5. **No Token Exposure**: Tokens are never sent to clients

## Error Handling

### User Denied Access
```json
{
  "error": "USER_DENIED",
  "message": "User denied access during OAuth flow"
}
```

### Invalid State
```json
{
  "error": "INVALID_STATE",
  "message": "Invalid state parameter - possible CSRF attack"
}
```

### Missing Authorization Code
```json
{
  "error": "MISSING_CODE",
  "message": "Authorization code is required"
}
```

### Insufficient Scope
```json
{
  "error": "INSUFFICIENT_SCOPE",
  "message": "The OAuth provider did not grant all required permissions",
  "requiredScopes": ["scope1", "scope2"]
}
```

## Required Scopes by Provider

### Google
- `email` - User's email address
- `profile` - Basic profile information
- `https://www.googleapis.com/auth/calendar` - Calendar access

### GitHub (Coming Soon)
- `user:email` - Email addresses
- `repo` - Repository access
- `gist` - Gist access

### Slack (Coming Soon)
- `identity.basic` - Basic identity
- `identity.email` - Email address
- `chat:write` - Send messages
- `channels:read` - List channels

## Testing OAuth Locally

For local development:
1. Set `OAUTH_REDIRECT_URI` in your `.env`
2. Configure OAuth app in provider's console
3. Use ngrok or similar for HTTPS tunnel
4. Update redirect URIs in provider settings

Example `.env`:
```bash
OAUTH_REDIRECT_URI=https://your-ngrok-url.ngrok.io/oauth/callback
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```