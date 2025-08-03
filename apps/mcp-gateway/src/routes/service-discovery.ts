import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TokenValidator } from '../auth/token-validator';
import { ServiceRouter } from '../routing/service-router';
import { UserService } from '@relayforge/database';
import { OAuthService } from '@relayforge/database';


export async function registerServiceDiscoveryRoutes(
  fastify: FastifyInstance,
  serviceRouter: ServiceRouter
) {
  const tokenValidator = new TokenValidator();
  const userService = new UserService();
  const oauthService = new OAuthService();

  fastify.get('/api/services', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    // Validate bearer token
    const authHeader = request.headers.authorization as string;
    const authInfo = await tokenValidator.validateBearerToken(authHeader);
    
    if (!authInfo) {
      reply.code(401).send({ 
        error: 'Unauthorized',
        message: 'Invalid or missing bearer token',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    // Get user info
    const user = await userService.findUserById(authInfo.userId);
    if (!user) {
      reply.code(404).send({ 
        error: 'Not Found',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Get all services
    const allServices = serviceRouter.getAllServices();
    const services = [];

    for (const service of allServices) {
      // Get methods for this service
      const methods = await getServiceMethods(service);
      
      // Determine auth type and status
      let authType: 'oauth' | 'client-key' | 'none' = 'none';
      let status: 'connected' | 'disconnected' | 'active' | 'inactive' = 'inactive';
      
      if (service.requiresAuth) {
        // Check if it's an OAuth service
        const provider = getProviderForService(service.prefix);
        if (provider) {
          authType = 'oauth';
          // Check if user has connected this OAuth provider
          const tokens = await oauthService.getTokens(authInfo.userId, provider);
          const isConnected = tokens !== null && tokens.expiresAt > new Date();
          status = isConnected ? 'connected' : 'disconnected';
        } else {
          // It's a client-key service
          authType = 'client-key';
          // Check recent usage to determine if active
          const recentUsage = await userService.getRecentUsage(authInfo.userId, service.prefix, 24);
          status = recentUsage > 0 ? 'active' : 'inactive';
        }
      } else {
        status = 'active'; // No auth required services are always active
      }

      // Get pricing
      const pricing = await userService.getServicePricing(service.prefix);

      services.push({
        id: service.prefix,
        name: service.name,
        methods,
        auth: authType,
        status,
        price_per_call: pricing?.pricePerCall || 0,
        ...(authType === 'client-key' && {
          setup: {
            required_env: `${service.prefix.toUpperCase().replace(/-/g, '_')}_API_KEY`
          }
        })
      });
    }

    // Get linked emails
    const linkedEmailsData = await userService.getLinkedEmails(authInfo.userId);
    const linkedEmails = linkedEmailsData.map((le: any) => le.email);

    return {
      services,
      account: {
        primary_email: user.primaryEmail,
        balance: user.credits / 100, // Convert credits to dollars
        linked_emails: linkedEmails
      }
    };
  });
}

// Helper function to get methods from a service
async function getServiceMethods(service: any): Promise<string[]> {
  try {
    // Create a mock request to get tools list
    const mockRequest = {
      jsonrpc: '2.0',
      id: 'mock',
      method: 'tools/list',
      params: {}
    };

    const response = await service.adapter.handleHttpRequest('mock', mockRequest);
    if (response?.result?.tools) {
      return response.result.tools.map((tool: any) => tool.name);
    }
  } catch (error) {
    console.error(`Failed to get methods for ${service.name}:`, error);
  }
  return [];
}

// Import provider mapping
import { getProviderForService } from '../config/service-providers';