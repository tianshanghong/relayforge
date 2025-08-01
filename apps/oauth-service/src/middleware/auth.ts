import { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';

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
    docs: 'https://docs.relayforge.xyz/api/authentication'
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

  // Timing-safe comparison using Node.js built-in
  const keyBuffer = Buffer.from(adminKey);
  const validKeyBuffer = Buffer.from(validAdminKey);
  
  // Keys must be same length for timingSafeEqual
  if (keyBuffer.length !== validKeyBuffer.length) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid admin key'
    });
    return;
  }
  
  if (!timingSafeEqual(keyBuffer, validKeyBuffer)) {
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