import type { FastifyInstance } from 'fastify';
import { oauthFlowService } from '../services/oauth.service.js';
import { validateInternalApiKey } from '../middleware/internal-auth.js';
import { z } from 'zod';

// Request schemas
const GetTokenParams = z.object({
  provider: z.string().min(1),
});

const GetTokenHeaders = z.object({
  'x-user-id': z.string().uuid(),
});

type GetTokenRequest = {
  Params: z.infer<typeof GetTokenParams>;
  Headers: z.infer<typeof GetTokenHeaders>;
};

export async function internalRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/internal/tokens/:provider
   * Internal endpoint for fetching OAuth tokens
   * Used by MCP Gateway for service-to-service communication
   */
  fastify.get<GetTokenRequest>('/api/internal/tokens/:provider', {
    preHandler: validateInternalApiKey,
    schema: {
      params: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
        },
        required: ['provider'],
      },
      headers: {
        type: 'object',
        properties: {
          'authorization': { type: 'string', pattern: '^Bearer .+' },
          'x-user-id': { type: 'string', format: 'uuid' },
        },
        required: ['authorization', 'x-user-id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            provider: { type: 'string' },
          },
          required: ['accessToken', 'provider'],
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { provider } = request.params;
    const userId = request.headers['x-user-id'] as string;

    try {
      // Use getValidToken which handles automatic refresh
      const accessToken = await oauthFlowService.getValidToken(userId, provider);
      
      // For now, we don't track exact expiry times, but we could enhance this
      return reply.send({
        accessToken,
        provider,
        expiresAt: null, // Could be enhanced to return actual expiry
      });
    } catch (error: any) {
      fastify.log.error({ error, userId, provider }, 'Failed to get OAuth token');
      
      // Handle specific error cases
      if (error.message?.includes('No OAuth connection found')) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `No OAuth connection found for provider: ${provider}`,
        });
      }
      
      if (error.message?.includes('Token refresh failed')) {
        return reply.status(401).send({
          error: 'Token Refresh Failed',
          message: 'Failed to refresh OAuth token. User may need to re-authenticate.',
        });
      }
      
      // Generic error
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve OAuth token',
      });
    }
  });

  /**
   * GET /api/internal/health
   * Health check for internal API
   */
  fastify.get('/api/internal/health', {
    preHandler: validateInternalApiKey,
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });
}