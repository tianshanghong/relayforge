import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { oauthFlowService } from '../services/oauth.service';
import { providerRegistry } from '../providers/registry';
import { config } from '../config';

// Request/Response schemas
const AuthorizeQuerySchema = z.object({
  redirect_url: z.string().url().optional(),
});

const CallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /oauth/:provider/authorize
   * Initiate OAuth flow
   */
  fastify.get<{
    Params: { provider: string };
    Querystring: z.infer<typeof AuthorizeQuerySchema>;
  }>('/:provider/authorize', {
    schema: {
      params: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
        },
        required: ['provider'],
      },
      querystring: AuthorizeQuerySchema,
      response: {
        302: {
          type: 'null',
          description: 'Redirect to OAuth provider',
        },
        400: {
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
    const { redirect_url } = request.query;

    // Validate provider
    if (!providerRegistry.has(provider)) {
      return reply.status(400).send({
        error: 'INVALID_PROVIDER',
        message: `OAuth provider '${provider}' is not supported`,
      });
    }

    try {
      const authUrl = await oauthFlowService.initiateOAuth(provider, redirect_url);
      return reply.redirect(302, authUrl);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'OAUTH_INIT_ERROR',
        message: 'Failed to initiate OAuth flow',
      });
    }
  });

  /**
   * GET /oauth/:provider/callback
   * Handle OAuth callback
   */
  fastify.get<{
    Params: { provider: string };
    Querystring: z.infer<typeof CallbackQuerySchema>;
  }>('/:provider/callback', {
    schema: {
      params: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
        },
        required: ['provider'],
      },
      querystring: CallbackQuerySchema,
      response: {
        302: {
          type: 'null',
          description: 'Redirect to frontend with session',
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            provider: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { provider } = request.params;
    const { code, state, error } = request.query;

    try {
      const result = await oauthFlowService.handleCallback(
        provider,
        code,
        state,
        error
      );

      // Build redirect URL with session info
      const redirectUrl = new URL(`${config.FRONTEND_URL}/auth/success`);
      redirectUrl.searchParams.set('session_url', result.sessionUrl);
      redirectUrl.searchParams.set('email', result.user.email);
      redirectUrl.searchParams.set('credits', result.user.credits.toString());
      redirectUrl.searchParams.set('is_new_user', result.user.isNewUser.toString());

      // Set secure session cookie
      reply.setCookie('rf_session', result.sessionUrl.split('/').pop()!, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: config.SESSION_DURATION_DAYS * 24 * 60 * 60,
        path: '/',
      });

      return reply.redirect(302, redirectUrl.toString());
    } catch (error: any) {
      fastify.log.error(error);

      // Redirect to frontend with error
      const redirectUrl = new URL(`${config.FRONTEND_URL}/auth/error`);
      redirectUrl.searchParams.set('error', error.code || 'OAUTH_ERROR');
      redirectUrl.searchParams.set('message', error.message);
      redirectUrl.searchParams.set('provider', provider);

      return reply.redirect(302, redirectUrl.toString());
    }
  });

  /**
   * GET /oauth/providers
   * List available OAuth providers
   */
  fastify.get('/providers', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            providers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  displayName: { type: 'string' },
                  icon: { type: 'string' },
                  authUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const providers = providerRegistry.list().map(name => ({
      name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      icon: `https://cdn.simpleicons.org/${name}/${name === 'google' ? '4285F4' : '181717'}`,
      authUrl: `/oauth/${name}/authorize`,
    }));

    return { providers };
  });
};