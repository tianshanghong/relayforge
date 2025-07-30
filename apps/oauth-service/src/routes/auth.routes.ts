import { FastifyPluginAsync } from 'fastify';
import { oauthFlowService } from '../services/oauth.service';
import { providerRegistry } from '../providers/registry';
import { config } from '../config';
import { OAuthError } from '../utils/errors';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /oauth/:provider/authorize
   * Initiate OAuth flow
   */
  fastify.get<{
    Params: { provider: string };
    Querystring: { redirect_url?: string };
  }>('/:provider/authorize', {
    schema: {
      params: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
        },
        required: ['provider'],
      },
      querystring: {
        type: 'object',
        properties: {
          redirect_url: { type: 'string', format: 'uri' },
        },
      },
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
    Querystring: { code?: string; state: string; error?: string; error_description?: string };
  }>('/:provider/callback', {
    schema: {
      params: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
        },
        required: ['provider'],
      },
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
          error_description: { type: 'string' },
        },
        required: ['state'],
      },
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
      const sessionUrl = new URL(result.sessionUrl);
      const sessionId = sessionUrl.pathname.split('/').pop();
      
      if (!sessionId) {
        throw new OAuthError('INVALID_SESSION_URL', 'Invalid session URL format');
      }
      
      reply.setCookie('rf_session', sessionId, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: config.SESSION_DURATION_DAYS * 24 * 60 * 60,
        path: '/',
      });

      return reply.redirect(302, redirectUrl.toString());
    } catch (error: any) {
      fastify.log.error(error);

      // Redirect to frontend with error (sanitize error messages)
      const redirectUrl = new URL(`${config.FRONTEND_URL}/auth/error`);
      const errorCode = error.code || 'OAUTH_ERROR';
      redirectUrl.searchParams.set('error', errorCode);
      
      // Sanitize error messages to avoid exposing sensitive information
      let safeMessage = 'An error occurred during authentication';
      if (error instanceof OAuthError) {
        safeMessage = error.message; // OAuth errors are already safe
      } else if (error.message && !error.message.includes('password') && !error.message.includes('secret')) {
        safeMessage = error.message.substring(0, 100); // Truncate long messages
      }
      
      redirectUrl.searchParams.set('message', safeMessage);
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