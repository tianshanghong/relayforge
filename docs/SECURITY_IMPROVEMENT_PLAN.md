# Security Enhancement Plan for RelayForge Authentication System

## Executive Summary

This document outlines a comprehensive plan to enhance the authentication and authorization system for RelayForge, transitioning from the current development-focused implementation to a production-ready security architecture.

## Current State

### What We Have
- **MCP Session System**: 36-character secure session IDs for MCP client access
- **Basic Protection**: Header-based user ID (`x-user-id`) - development only
- **Admin Endpoint**: Protected with simple admin key
- **OAuth Integration**: Working Google OAuth flow that creates sessions

### Security Gaps
1. No proper authentication for API endpoints
2. Header-based user identification (easily spoofed)
3. No rate limiting per user
4. No session limits per user
5. Basic admin authentication
6. No audit logging

## Proposed Architecture

### 1. Dual Authentication System

```
┌─────────────────────┐
│   Authentication    │
│      Layer          │
├─────────────────────┤
│  JWT Tokens (APIs)  │ ← For REST API calls
├─────────────────────┤
│ MCP Sessions (URLs) │ ← For MCP client access
└─────────────────────┘
```

#### JWT Tokens
- **Purpose**: Authenticate REST API calls
- **Lifetime**: 1 hour (access), 7 days (refresh)
- **Storage**: Client-side (localStorage/memory)
- **Usage**: Authorization header

#### MCP Sessions
- **Purpose**: Authenticate MCP client connections
- **Lifetime**: 30 days (configurable)
- **Storage**: Database with usage tracking
- **Usage**: Embedded in MCP URL

### 2. Implementation Phases

## Phase 1: JWT Authentication (Week 1)

### 2.1 Token Generation
```typescript
interface JWTPayload {
  sub: string;          // User ID
  email: string;        // User email
  type: 'access' | 'refresh';
  permissions: string[];
  iat: number;          // Issued at
  exp: number;          // Expiry
}
```

### 2.2 New Endpoints
- `POST /api/auth/token` - Exchange OAuth code for JWT
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/revoke` - Revoke refresh token
- `GET /api/auth/verify` - Verify token validity

### 2.3 Middleware Implementation
```typescript
// JWT validation middleware
export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  const payload = await verifyJWT(token);
  request.user = payload;
}
```

### 2.4 Development Token Generation
```typescript
// Dev-only endpoint for quick token generation
if (process.env.NODE_ENV === 'development') {
  fastify.post('/api/auth/dev-token', async (request, reply) => {
    const { email, role = 'user' } = request.body;
    const user = await findOrCreateDevUser(email);
    const tokens = await generateTokenPair(user, role);
    reply.send(tokens);
  });
}
```

## Phase 2: Permission System (Week 2)

### 3.1 Role-Based Access Control (RBAC)
```typescript
enum Role {
  USER = 'user',
  PREMIUM = 'premium',
  ADMIN = 'admin'
}

enum Permission {
  // Session permissions
  SESSIONS_READ = 'sessions:read',
  SESSIONS_WRITE = 'sessions:write',
  SESSIONS_DELETE = 'sessions:delete',
  
  // Admin permissions
  ADMIN_USERS = 'admin:users',
  ADMIN_SESSIONS = 'admin:sessions',
  ADMIN_BILLING = 'admin:billing',
  
  // Service permissions
  SERVICE_GOOGLE = 'service:google',
  SERVICE_GITHUB = 'service:github',
  SERVICE_OPENAI = 'service:openai',
}
```

### 3.2 Permission Middleware
```typescript
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!hasPermission(request.user, permission)) {
      reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
```

## Phase 3: Enhanced Security Features (Week 3)

### 4.1 Session Security
- **Concurrent Session Limits**: Max 10 sessions per user
- **Device Fingerprinting**: Track device/browser fingerprints
- **Anomaly Detection**: Alert on suspicious activity
- **Geographic Restrictions**: Optional IP-based restrictions

### 4.2 Rate Limiting
```typescript
// Per-user rate limiting
const rateLimitConfig = {
  free: { max: 100, window: '15 minutes' },
  premium: { max: 1000, window: '15 minutes' },
  admin: { max: 10000, window: '15 minutes' }
};
```

### 4.3 Audit Logging
```typescript
interface AuditLog {
  userId: string;
  action: string;
  resource: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  metadata?: Record<string, unknown>;
}
```

## Phase 4: Production Hardening (Week 4)

### 5.1 Security Headers
```typescript
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
};
```

### 5.2 CORS Configuration
```typescript
const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
```

### 5.3 Input Validation
- Implement request schema validation
- Sanitize all user inputs
- Add request size limits
- Validate all parameters

## Implementation Timeline

### Week 1: JWT Foundation
- [ ] Implement JWT generation and validation
- [ ] Create token endpoints
- [ ] Update frontend to use JWT
- [ ] Add refresh token flow

### Week 2: Permissions & Roles
- [ ] Implement RBAC system
- [ ] Add permission middleware
- [ ] Create role management endpoints
- [ ] Update all routes with permissions

### Week 3: Security Features
- [ ] Add session limits
- [ ] Implement device fingerprinting
- [ ] Add anomaly detection
- [ ] Enhance rate limiting

### Week 4: Production Hardening
- [ ] Add security headers
- [ ] Configure CORS properly
- [ ] Implement audit logging
- [ ] Security testing

## Migration Strategy

### 1. Clean Implementation
- No backward compatibility with insecure methods
- All endpoints require JWT from day one
- Development uses same auth as production
- Provide tooling for easy token generation in dev

### 2. Database Migrations
```sql
-- Add tables for refresh tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add audit log table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(255),
  resource VARCHAR(255),
  ip INET,
  user_agent TEXT,
  success BOOLEAN,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Environment Variables
```env
# JWT Configuration
JWT_ACCESS_SECRET=<random-32-char-string>
JWT_REFRESH_SECRET=<different-random-32-char-string>
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

# Security Configuration
MAX_SESSIONS_PER_USER=10
ENABLE_DEVICE_FINGERPRINT=true
ENABLE_AUDIT_LOG=true
ENABLE_ANOMALY_DETECTION=true
```

## Security Best Practices

### 1. Token Security
- Never log tokens
- Use secure random generation
- Implement token rotation
- Store only token hashes

### 2. Session Security
- Regular session cleanup
- Secure session ID generation
- Activity-based expiry
- Geographic validation

### 3. API Security
- Request signing for sensitive operations
- Webhook signature validation
- API versioning
- Deprecation notices

### 4. Monitoring & Alerts
- Failed authentication attempts
- Unusual access patterns
- Rate limit violations
- Permission denials

## Testing Strategy

### 1. Security Testing
- Penetration testing
- OWASP Top 10 validation
- Authentication bypass attempts
- Session hijacking tests

### 2. Performance Testing
- JWT validation overhead
- Cache performance
- Database query optimization
- Rate limiting accuracy

### 3. Integration Testing
- OAuth flow with JWT
- Session creation and validation
- Permission enforcement
- Audit logging

## Documentation Requirements

### 1. API Documentation
- Authentication methods
- Required headers
- Error responses
- Rate limits

### 2. Migration Guide
- Step-by-step migration
- Code examples
- Common issues
- Rollback procedures

### 3. Security Guidelines
- Best practices
- Common pitfalls
- Security checklist
- Incident response

## Success Metrics

### 1. Security Metrics
- Authentication success rate > 99%
- Token validation time < 10ms
- Zero security breaches
- 100% audit coverage

### 2. Performance Metrics
- API response time < 100ms
- Cache hit rate > 90%
- Database query time < 50ms
- Concurrent users > 10,000

### 3. User Experience
- Seamless authentication
- No false positives
- Clear error messages
- Smooth migration

## Risk Assessment

### 1. Technical Risks
- **Risk**: Performance degradation
- **Mitigation**: Extensive load testing

### 2. Security Risks
- **Risk**: Token theft
- **Mitigation**: Short expiry, refresh rotation

### 3. Operational Risks
- **Risk**: Migration failures
- **Mitigation**: Gradual rollout, feature flags

## Conclusion

This comprehensive security enhancement plan will transform RelayForge's authentication system from a development-focused implementation to a production-ready, secure architecture. The phased approach ensures minimal disruption while maximizing security improvements.

The implementation will provide:
- Industry-standard JWT authentication
- Granular permission control
- Enhanced session security
- Comprehensive audit logging
- Production-ready hardening

With these improvements, RelayForge will be ready to scale securely while maintaining excellent user experience.