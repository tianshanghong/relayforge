import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Authentication middleware placeholder until JWT implementation
 * All authenticated endpoints are disabled until proper authentication is implemented
 */

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export interface AuthenticatedRequest extends FastifyRequest {
  userId?: string;
}

/**
 * Placeholder for user authentication
 * Returns 503 until JWT authentication is implemented
 */
export async function authenticateUser(
  _request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  reply.code(503).send({
    error: 'Service Unavailable',
    message: 'Session management API is not yet available. JWT authentication is coming soon.',
    docs: 'https://docs.relayforge.com/api/authentication'
  });
}

/**
 * Require admin authentication for sensitive operations
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const adminKey = request.headers['x-admin-key'] as string;
  
  if (!adminKey) {
    reply.code(401).send({
      error: 'Admin Authentication Required',
      message: 'Missing admin key'
    });
    return;
  }

  // Validate admin key
  const validAdminKey = process.env.ADMIN_KEY || process.env.ADMIN_SECRET;
  
  if (!validAdminKey) {
    request.log.error('ADMIN_KEY not configured in environment');
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Admin functionality not configured'
    });
    return;
  }

  // Timing-safe comparison
  if (!timingSafeEqual(adminKey, validAdminKey)) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid admin key'
    });
    return;
  }

  // Log admin action
  request.log.info({
    msg: 'Admin action authorized',
    action: request.routerPath,
    ip: request.ip,
    userAgent: request.headers['user-agent']
  });
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}