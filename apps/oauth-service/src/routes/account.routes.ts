import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserService, OAuthService as DatabaseOAuthService } from '@relayforge/database';
import { SessionManager } from '../utils/session';

// Request schemas
const AuthorizationHeaderSchema = z.string().regex(/^Bearer .+$/);

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  const userService = new UserService();
  const oauthService = new DatabaseOAuthService();

  /**
   * Middleware to extract and validate session
   */
  const authenticateSession = async (authHeader?: string) => {
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const headerValidation = AuthorizationHeaderSchema.safeParse(authHeader);
    if (!headerValidation.success) {
      throw new Error('Invalid authorization header format');
    }

    const sessionId = authHeader.split(' ')[1];
    const userId = await SessionManager.validateSession(sessionId);

    if (!userId) {
      throw new Error('Invalid or expired session');
    }

    return userId;
  };

  /**
   * GET /api/account/status
   * Get account status and linked services
   */
  fastify.get('/status', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            primaryEmail: { type: 'string' },
            credits: { type: 'number' },
            linkedAccounts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  email: { type: 'string' },
                  connectedAt: { type: 'string' },
                },
              },
            },
            connectedServices: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const userId = await authenticateSession(request.headers.authorization);

      // Get user details
      const user = await userService.findUserById(userId);
      if (!user) {
        return reply.status(401).send({
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // Get linked emails (not used in this endpoint, but available if needed)
      // const linkedEmails = await userService.getLinkedEmails(userId);

      // Get OAuth connections
      const oauthConnections = await oauthService.getUserConnections(userId);

      // Format response
      const linkedAccounts = oauthConnections.map(conn => ({
        provider: conn.provider,
        email: conn.email,
        connectedAt: conn.connectedAt.toISOString(),
      }));

      const connectedServices = Array.from(
        new Set(oauthConnections.map(conn => conn.provider))
      );

      return {
        primaryEmail: user.primaryEmail,
        credits: user.credits,
        linkedAccounts,
        connectedServices,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('authorization') || error.message.includes('session')) {
          return reply.status(401).send({
            error: 'INVALID_SESSION',
            message: error.message,
          });
        }
      }

      throw error;
    }
  });

  /**
   * POST /api/account/link
   * Link an additional email to existing account
   */
  fastify.post('/link', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          provider: { type: 'string' },
        },
        required: ['email', 'provider'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            existingUserId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const userId = await authenticateSession(request.headers.authorization);
      const { email, provider } = request.body as { email: string; provider: string };

      // Check if email is already linked to another account
      const existingUser = await userService.findUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return reply.status(409).send({
          error: 'EMAIL_ALREADY_LINKED',
          message: `Email ${email} is already linked to another account`,
          existingUserId: existingUser.id,
        });
      }

      // Link the email
      await userService.linkEmail({ userId, email, provider });

      return {
        success: true,
        message: `Email ${email} has been linked to your account`,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('authorization') || error.message.includes('session')) {
          return reply.status(401).send({
            error: 'INVALID_SESSION',
            message: error.message,
          });
        }
      }

      throw error;
    }
  });

  /**
   * GET /api/account/services
   * Get provider status for the user
   */
  fastify.get('/services', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            providers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  connected: { type: 'boolean' },
                  emails: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  lastUsed: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const userId = await authenticateSession(request.headers.authorization);
      const providers = await oauthService.getProvidersStatus(userId);

      return { providers };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('authorization') || error.message.includes('session')) {
          return reply.status(401).send({
            error: 'INVALID_SESSION',
            message: error.message,
          });
        }
      }

      throw error;
    }
  });
};