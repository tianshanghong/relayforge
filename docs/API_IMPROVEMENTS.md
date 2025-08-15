# API Improvements Recommendations

Based on the API review, here are recommended improvements for consistency and usability:

## 1. Unify Token Management Endpoints

### Current State (Inconsistent)
- `/api/tokens` (GET, POST, DELETE) - Session auth
- `/tokens/revoke` (POST) - Bearer auth

### Recommended Structure
Move all token operations under `/tokens` with dual auth support:
```
GET    /tokens         - List tokens (session or bearer auth)
POST   /tokens         - Create token (session or bearer auth)
DELETE /tokens/{id}    - Delete token (session or bearer auth)
POST   /tokens/revoke  - Revoke token (bearer auth only)
```

## 2. Standardize API Prefixes

### Option A: Remove all `/api` prefixes
```
/services           (instead of /api/services) ✅ Already done
/tokens             (instead of /api/tokens)
/user               (instead of /api/user)
```

### Option B: Add `/api` to all non-protocol endpoints
```
/api/services       (service discovery)
/api/tokens         (token management)
/api/user           (user info)
/mcp/*              (keep as-is, it's a protocol)
/oauth/*            (keep as-is, it's a protocol)
```

**Recommendation**: Option A (remove `/api`) for cleaner URLs since we're already on `api.` subdomain.

## 3. Add Missing User Endpoint

### GET `/user`
Returns current user information.

**Headers**
```http
Authorization: Bearer mcp_live_xxxxx
# OR
Cookie: session=...
```

**Response**
```json
{
  "userId": "uuid",
  "primaryEmail": "alice@gmail.com",
  "slug": "happy-dolphin-42",
  "credits": 350,
  "balance": 3.50,
  "linkedEmails": [
    {
      "email": "alice@gmail.com",
      "provider": "google",
      "isPrimary": true
    },
    {
      "email": "alice@company.com",
      "provider": "github",
      "isPrimary": false
    }
  ],
  "connectedServices": ["google", "github"],
  "createdAt": "2024-08-01T10:00:00Z"
}
```

## 4. Add Billing Endpoints

### GET `/billing/usage`
Returns usage history and statistics.

### POST `/billing/credits`
Purchase additional credits (integrate with payment provider).

### GET `/billing/pricing`
Returns current pricing for all services.

## 5. Improve Error Responses

Standardize all error responses:
```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Not enough credits to complete this request",
    "details": {
      "required": 0.02,
      "available": 0.01,
      "service": "google-calendar"
    },
    "help": "https://docs.relayforge.xyz/errors/insufficient-credits"
  }
}
```

## 6. Add API Versioning

Consider adding version to URLs or headers:
- URL versioning: `/v1/services`, `/v1/tokens`
- Header versioning: `API-Version: 1.0`

**Recommendation**: Start with no versioning, add `/v2` when breaking changes needed.

## 7. WebSocket Improvements

### Add WebSocket-specific endpoints:
- `/mcp/u/{slug}/ws/status` - Connection status
- `/mcp/u/{slug}/ws/ping` - Keep-alive endpoint

## 8. Add OpenAPI/Swagger Documentation

Create an OpenAPI spec and serve it at:
- `/openapi.json` - OpenAPI specification
- `/docs` - Swagger UI interface

## 9. Batch Operations

For efficiency, consider batch endpoints:
```
POST /batch
{
  "requests": [
    {"method": "GET", "path": "/services"},
    {"method": "GET", "path": "/user"}
  ]
}
```

## 10. Monitoring Endpoints

### GET `/metrics`
Prometheus-compatible metrics endpoint.

### GET `/status`
Detailed system status (admin only).

## Priority Order

1. **High Priority** (Breaking changes, do now):
   - Unify token endpoints
   - Standardize API prefixes
   - Add user endpoint

2. **Medium Priority** (Improvements):
   - Add billing endpoints
   - Improve error responses
   - Add OpenAPI documentation

3. **Low Priority** (Nice to have):
   - API versioning
   - Batch operations
   - Monitoring endpoints

## Migration Path

1. Add new endpoints alongside old ones
2. Update documentation to prefer new endpoints
3. Add deprecation headers to old endpoints
4. Remove old endpoints in next major version

## Implementation Checklist

- [ ] Move `/api/tokens` to `/tokens`
- [ ] Add `/user` endpoint
- [ ] Update nginx configuration
- [ ] Update all tests
- [ ] Update documentation
- [ ] Add deprecation warnings
- [ ] Update frontend to use new endpoints
- [ ] Create OpenAPI specification
- [ ] Add billing endpoints
- [ ] Implement batch operations