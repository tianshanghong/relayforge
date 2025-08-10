import type { FastifyInstance } from 'fastify';
import { SessionService } from '../services/index.js';
import { authenticateUser, requireAdmin } from '../middleware/auth.js';

export interface SessionCreateBody {
  userId?: string; // Optional - can be extracted from auth token
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    origin?: string;
  };
  expiresIn?: number; // Days
}

export interface SessionRefreshBody {
  expiresIn?: number; // Days to extend
}

const sessionService = new SessionService();

export async function sessionRoutes(fastify: FastifyInstance) {
  // Create a new session
  fastify.post<{
    Body: SessionCreateBody;
  }>('/api/sessions', {
    preHandler: authenticateUser
  }, async (request, reply) => {
    try {
      const userId = request.userId!;

      const body = request.body as SessionCreateBody;
      const metadata = {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        origin: request.headers.origin as string,
        ...body.metadata,
      };

      const session = await sessionService.createSession({
        userId,
        metadata,
        expiresIn: body.expiresIn,
      });

      reply.code(201).send({
        success: true,
        data: session,
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  // Get all sessions for authenticated user
  fastify.get('/api/sessions', {
    preHandler: authenticateUser
  }, async (request, reply) => {
    try {
      const userId = request.userId!;

      const sessions = await sessionService.getUserSessions(userId);

      reply.send({
        success: true,
        data: sessions,
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  // Get session statistics
  fastify.get('/api/sessions/stats', {
    preHandler: authenticateUser
  }, async (request, reply) => {
    try {
      const userId = request.userId!;

      const stats = await sessionService.getSessionStats(userId);

      reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  // Validate a session
  fastify.get<{
    Params: { sessionId: string };
  }>('/api/sessions/:sessionId/validate', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const sessionInfo = await sessionService.validateSession(sessionId);

      if (!sessionInfo) {
        reply.code(404).send({
          success: false,
          error: 'Session not found or expired',
        });
        return;
      }

      reply.send({
        success: true,
        data: sessionInfo,
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  // Refresh/extend a session
  fastify.post<{
    Params: { sessionId: string };
    Body: SessionRefreshBody;
  }>('/api/sessions/:sessionId/refresh', {
    preHandler: authenticateUser
  }, async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const userId = request.userId!;

      const body = request.body as SessionRefreshBody;
      const session = await sessionService.refreshSession(
        userId,
        sessionId,
        body.expiresIn
      );

      reply.send({
        success: true,
        data: session,
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  // Revoke a specific session
  fastify.delete<{
    Params: { sessionId: string };
  }>('/api/sessions/:sessionId', {
    preHandler: authenticateUser
  }, async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const userId = request.userId!;

      await sessionService.revokeSession(userId, sessionId);

      reply.send({
        success: true,
        message: 'Session revoked successfully',
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  // Revoke all sessions for user
  fastify.delete('/api/sessions', {
    preHandler: authenticateUser
  }, async (request, reply) => {
    try {
      const userId = request.userId!;

      const count = await sessionService.revokeAllSessions(userId);

      reply.send({
        success: true,
        message: `Revoked ${count} sessions`,
        data: { count },
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });

  // Cleanup expired sessions (admin endpoint)
  fastify.post('/api/sessions/cleanup', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const count = await sessionService.cleanupExpiredSessions();

      reply.send({
        success: true,
        message: `Cleaned up ${count} expired sessions`,
        data: { count },
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });
}