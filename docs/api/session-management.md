# Session Management API

## Overview

The Session Management API provides endpoints for creating, managing, and validating user sessions in RelayForge. Sessions are used to authenticate users when accessing MCP services through the gateway.

## Base URL

```
https://api.relayforge.com/api/sessions
```

## Authentication

Most endpoints require a user ID to be provided via the `x-user-id` header. In production, this will be replaced with proper JWT authentication.

## Endpoints

### Create Session

Create a new session for an authenticated user.

```http
POST /api/sessions
```

**Headers:**
- `x-user-id`: string (required) - The ID of the authenticated user

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

Get all active sessions for the authenticated user.

```http
GET /api/sessions
```

**Headers:**
- `x-user-id`: string (required)

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

Get statistics about user's sessions.

```http
GET /api/sessions/stats
```

**Headers:**
- `x-user-id`: string (required)

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

Validate if a session is active and return associated user information.

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

Extend the expiration time of an existing session.

```http
POST /api/sessions/:sessionId/refresh
```

**Headers:**
- `x-user-id`: string (required)

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

Revoke (delete) a specific session.

```http
DELETE /api/sessions/:sessionId
```

**Headers:**
- `x-user-id`: string (required)

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

Revoke all sessions for the authenticated user.

```http
DELETE /api/sessions
```

**Headers:**
- `x-user-id`: string (required)

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

Remove all expired sessions from the database. This endpoint should be protected by admin authentication in production.

```http
POST /api/sessions/cleanup
```

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
- `401` - Unauthorized (expired session)
- `403` - Forbidden (trying to access another user's session)
- `404` - Not Found (session or user not found)
- `500` - Internal Server Error

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
      "url": "https://relayforge.com/mcp/abc123xyz..."
    }
  }
}
```

The gateway will validate the session and provide access to all configured MCP services based on the user's account status and available credits.