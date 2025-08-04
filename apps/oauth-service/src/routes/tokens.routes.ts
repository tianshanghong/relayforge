import { FastifyInstance } from 'fastify';
import { McpTokenService } from '@relayforge/database';
import { authenticateUser } from '../middleware/auth';
import { z } from 'zod';

// Request/Response schemas
const CreateTokenBody = z.object({
  name: z.string().min(1).max(100).trim(),
});

const TokenIdParams = z.object({
  id: z.string().uuid(),
});

type CreateTokenRequest = {
  Body: z.infer<typeof CreateTokenBody>;
};

type DeleteTokenRequest = {
  Params: z.infer<typeof TokenIdParams>;
};

export async function tokensRoutes(fastify: FastifyInstance) {
  const mcpTokenService = new McpTokenService();

  // List all tokens for the authenticated user
  fastify.get('/api/tokens', {
    preHandler: authenticateUser,
  }, async (request, reply) => {
    try {
      const userId = request.userId!;
      const tokens = await mcpTokenService.getUserTokens(userId);
      
      // Transform to safe format
      const safeTokens = tokens.map(token => ({
        id: token.id,
        name: token.name,
        prefix: token.prefix,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
      }));

      return reply.send({
        success: true,
        tokens: safeTokens,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Failed to list tokens');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve tokens',
      });
    }
  });

  // Create a new token
  fastify.post<CreateTokenRequest>('/api/tokens', {
    preHandler: authenticateUser,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const userId = request.userId!;
      const { name } = request.body;
      const trimmedName = name.trim();

      const newToken = await mcpTokenService.createToken({
        userId,
        name: trimmedName,
      });

      // Return the full token including plaintext (only time it's available!)
      return reply.send({
        success: true,
        token: {
          id: newToken.id,
          name: newToken.name,
          prefix: newToken.prefix,
          createdAt: newToken.createdAt,
          plainToken: newToken.plainToken, // Critical: only returned on creation
        },
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to create token');
      
      // Check if it's a unique constraint violation
      if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
        return reply.status(409).send({
          success: false,
          error: 'A token with this name already exists',
        });
      }
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to create token',
      });
    }
  });

  // Revoke a token
  fastify.delete<DeleteTokenRequest>('/api/tokens/:id', {
    preHandler: authenticateUser,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const userId = request.userId!;
      const { id: tokenId } = request.params;

      const success = await mcpTokenService.revokeToken(userId, tokenId);
      
      if (!success) {
        return reply.status(404).send({
          success: false,
          error: 'Token not found or already revoked',
        });
      }

      return reply.send({
        success: true,
        message: 'Token revoked successfully',
      });
    } catch (error) {
      fastify.log.error({ error }, 'Failed to revoke token');
      return reply.status(500).send({
        success: false,
        error: 'Failed to revoke token',
      });
    }
  });
}