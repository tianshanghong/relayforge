# Session Management API

## Overview

The Session Management API provides endpoints for creating, managing, and validating user sessions in RelayForge. Sessions are used to authenticate users when accessing MCP services through the gateway.

### Current Status

⚠️ **Most endpoints are temporarily unavailable** while we implement JWT authentication. Currently available endpoints:
- `GET /api/sessions/:sessionId/validate` - Used by the MCP gateway (no auth required)
- `POST /api/sessions/cleanup` - Admin endpoint (requires `x-admin-key` header)

All other endpoints return `503 Service Unavailable` until JWT authentication is complete.

## Base URL

```
https://api.relayforge.xyz/api/sessions
```

## Authentication

**IMPORTANT**: The Session Management API is currently unavailable. JWT authentication is being implemented and will be available soon. All authenticated endpoints return `503 Service Unavailable` until the JWT implementation is complete.

## Endpoints

### Create Session

**Status: Currently Unavailable (503)**

Create a new session for an authenticated user.

```http
POST /api/sessions
```

**Headers:**
- `Authorization`: Bearer {JWT_TOKEN} (required) - Coming soon

**Request Body:**
```json
{
  "metadata": {
    "userAgent": "string",
    "ipAddress": "string",
    "origin": "string"
  },
  "expiresIn": 30  // Days until expiration (optional, default: 30)
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123xyz...",
    "sessionUrl": "https://relayforge.com/mcp/abc123xyz...",
    "expiresAt": "2024-02-29T12:00:00Z",
    "createdAt": "2024-01-30T12:00:00Z"
  }
}
```

### List Sessions

**Status: Currently Unavailable (503)**

Get all active sessions for the authenticated user.

```http
GET /api/sessions
```

**Headers:**
- `Authorization`: Bearer {JWT_TOKEN} (required) - Coming soon

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sessionId": "abc123xyz...",
      "createdAt": "2024-01-30T12:00:00Z",
      "expiresAt": "2024-02-29T12:00:00Z",
      "lastAccessedAt": "2024-01-30T14:30:00Z",
      "metadata": {
        "userAgent": "Mozilla/5.0...",
        "ipAddress": "192.168.1.1"
      }
    }
  ]
}
```

### Get Session Statistics

**Status: Currently Unavailable (503)**

Get statistics about user's sessions.

```http
GET /api/sessions/stats
```

**Headers:**
- `Authorization`: Bearer {JWT_TOKEN} (required) - Coming soon

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSessions": 5,
    "activeSessions": 2,
    "expiredSessions": 3,
    "lastActivity": "2024-01-30T14:30:00Z"
  }
}
```

### Validate Session

**Status: Available**

Validate if a session is active and return associated user information. This endpoint does not require authentication as it's used by the MCP gateway.

```http
GET /api/sessions/:sessionId/validate
```

**Parameters:**
- `sessionId`: string (required) - The session ID to validate

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "user": {
      "id": "uuid",
      "primaryEmail": "user@example.com",
      "credits": 350
    }
  }
}
```

### Refresh Session

**Status: Currently Unavailable (503)**

Extend the expiration time of an existing session.

```http
POST /api/sessions/:sessionId/refresh
```

**Headers:**
- `Authorization`: Bearer {JWT_TOKEN} (required) - Coming soon

**Parameters:**
- `sessionId`: string (required)

**Request Body:**
```json
{
  "expiresIn": 60  // Days to extend (optional, default: 30)
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "abc123xyz...",
    "sessionUrl": "https://relayforge.com/mcp/abc123xyz...",
    "expiresAt": "2024-03-31T12:00:00Z",
    "createdAt": "2024-01-30T12:00:00Z"
  }
}
```

### Revoke Session

**Status: Currently Unavailable (503)**

Revoke (delete) a specific session.

```http
DELETE /api/sessions/:sessionId
```

**Headers:**
- `Authorization`: Bearer {JWT_TOKEN} (required) - Coming soon

**Parameters:**
- `sessionId`: string (required)

**Response:**
```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

### Revoke All Sessions

**Status: Currently Unavailable (503)**

Revoke all sessions for the authenticated user.

```http
DELETE /api/sessions
```

**Headers:**
- `Authorization`: Bearer {JWT_TOKEN} (required) - Coming soon

**Response:**
```json
{
  "success": true,
  "message": "Revoked 3 sessions",
  "data": {
    "count": 3
  }
}
```

### Cleanup Expired Sessions (Admin)

**Status: Available**

Remove all expired sessions from the database. This endpoint requires admin authentication.

```http
POST /api/sessions/cleanup
```

**Headers:**
- `x-admin-key`: string (required) - Admin API key

**Response:**
```json
{
  "success": true,
  "message": "Cleaned up 42 expired sessions",
  "data": {
    "count": 42
  }
}
```

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "error": "Error message",
  "statusCode": 400
}
```

Common error codes:
- `400` - Bad Request (missing required parameters)
- `401` - Unauthorized (missing or invalid authentication)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (session or user not found)
- `500` - Internal Server Error
- `503` - Service Unavailable (endpoint not yet available)

## Session Security

- Sessions are identified by a 36-character cryptographically secure random string
- Sessions expire after 30 days by default (configurable)
- Session IDs should be treated as sensitive credentials
- The gateway validates sessions on every MCP request
- Session validation is cached for 5 minutes to improve performance

## Integration with MCP Gateway

Once a session is created, the `sessionUrl` can be used as the MCP server URL in Claude or other MCP clients:

```json
{
  "mcpServers": {
    "relayforge": {
      "url": "https://relayforge.xyz/mcp/abc123xyz..."
    }
  }
}
```

The gateway will validate the session and provide access to all configured MCP services based on the user's account status and available credits.

## Future JWT Authentication

When JWT authentication is implemented, the API will use standard Bearer token authentication:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

JWT tokens will be obtained through the OAuth flow and will include:
- User ID and email
- Permissions and roles
- Token expiration
- Refresh token for obtaining new access tokens

See the [Security Enhancement Plan](https://github.com/tianshanghong/relayforge/issues) for detailed implementation plans.