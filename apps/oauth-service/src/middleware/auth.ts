import type { FastifyRequest, FastifyReply } from 'fastify';
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
 * Authenticate user via session cookie
 */
export async function authenticateUser(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const sessionId = request.cookies?.rf_session;
  
  if (!sessionId) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Session required. Please log in.'
    });
    return;
  }

  try {
    // Import here to avoid circular dependency
    const { SessionService } = await import('../services');
    const sessionService = new SessionService();
    
    const sessionInfo = await sessionService.validateSession(sessionId);
    
    if (!sessionInfo) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session. Please log in again.'
      });
      return;
    }
    
    // Add userId to request for use in route handlers
    request.userId = sessionInfo.userId;
  } catch (error) {
    request.log.error({ error }, 'Session validation error');
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to validate session'
    });
  }
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
  const validAdminKey = process.env.ADMIN_KEY;
  
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