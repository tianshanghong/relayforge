import * as dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { HelloWorldMCPServer } from './servers/hello-world.js';
import { GoogleCalendarService } from './services/google-calendar.service.js';
import { CoinbaseService } from './services/coinbase.service.js';
import { TokenValidator } from './auth/token-validator.js';
import { BillingService } from './services/billing.service.js';
import { ServiceRouter } from './routing/service-router.js';
import { OAuthClient } from './clients/oauth-client.js';
import { mcpTokenService } from '@relayforge/database';
import { registerServiceDiscoveryRoutes } from './routes/service-discovery.js';
import { AuthInjectableService } from './types/service.types.js';

const fastify = Fastify({
  logger: true
});

// Register WebSocket support BEFORE defining routes
fastify.register(fastifyWebsocket);

// Initialize components
const tokenValidator = new TokenValidator();
const billingService = new BillingService();
const serviceRouter = new ServiceRouter();

// Configure OAuth client if environment variables are set
let oauthClient: OAuthClient | undefined;
if (process.env.OAUTH_SERVICE_URL && process.env.INTERNAL_API_KEY) {
  oauthClient = new OAuthClient(
    process.env.OAUTH_SERVICE_URL,
    process.env.INTERNAL_API_KEY
  );
  serviceRouter.setOAuthClient(oauthClient);
  fastify.log.info('OAuth client configured for service-to-service communication');
} else {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OAuth configuration (OAUTH_SERVICE_URL and INTERNAL_API_KEY) is required in production');
  }
  fastify.log.warn('OAuth client not configured. Set OAUTH_SERVICE_URL and INTERNAL_API_KEY for OAuth support.');
}

// Register Google Calendar service
serviceRouter.registerService({
  name: 'Google Calendar', 
  prefix: 'google-calendar',
  requiresAuth: true,
  adapter: new MCPHttpAdapter(new GoogleCalendarService()),
  authConfig: {
    type: 'oauth',
    provider: 'google'
  }
});

// Register Coinbase service
serviceRouter.registerService({
  name: 'Coinbase',
  prefix: 'coinbase',
  requiresAuth: true,
  adapter: new MCPHttpAdapter(new CoinbaseService()),
  authConfig: {
    type: 'api-key'
  }
});

// Register hello-world for testing
serviceRouter.registerService({
  name: 'Hello World',
  prefix: 'hello-world',
  requiresAuth: false,
  adapter: new MCPHttpAdapter(new HelloWorldMCPServer()),
});

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register service discovery routes
registerServiceDiscoveryRoutes(fastify, serviceRouter);

// Unified MCP request handler
async function handleMCPRequest(
  authInfo: { userId: string; credits: number; authType: 'session' | 'token'; tokenId: string },
  mcpRequest: any,
  request: any,
  reply: any
) {
  let method = mcpRequest.method;
  
  // Handle initialize request
  if (method === 'initialize') {
    reply.send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: 'RelayForge MCP Gateway',
          version: '1.0.0'
        }
      }
    });
    return;
  }
  
  // Handle notifications/initialized (sent after initialize)
  if (method === 'notifications/initialized') {
    // This is a notification, no response needed
    reply.code(200).send({
      jsonrpc: '2.0',
      result: {}
    });
    return;
  }
  
  // Special handling for tools/call - extract service from tool name
  if (method === 'tools/call' && mcpRequest.params?.name) {
    const toolName = mcpRequest.params.name;
    // Extract service name from tool name (e.g., google-calendar_list-events -> google-calendar)
    const serviceName = toolName.split('_')[0];
    // Rewrite method to include service prefix for routing (using underscore separator)
    method = `${serviceName}_tools/call`;
  }
  
  // Special handling for system methods
  if (method === 'tools/list') {
    const tools: any[] = [];
    
    for (const service of serviceRouter.getAllServices()) {
      try {
        const response = await service.adapter.handleHttpRequest(authInfo.tokenId, mcpRequest);
        if (response && response.result && response.result.tools) {
          tools.push(...response.result.tools);
        }
      } catch (error) {
        console.error(`Failed to get tools from ${service.name}:`, error);
      }
    }
    
    reply.send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      result: { tools },
    });
    return;
  }
  
  // Route to specific service based on method prefix
  const serviceConfig = await serviceRouter.getServiceWithAuth(method, authInfo.userId);
  if (!serviceConfig) {
    reply.code(404).send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    });
    return;
  }

  const { service, accessToken } = serviceConfig;
  
  // Get service pricing
  const pricing = await billingService.getServicePricing(service.prefix);
  if (!pricing) {
    reply.code(503).send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      error: {
        code: -32000,
        message: `Service ${service.name} is not available`,
      },
    });
    return;
  }

  // Check credits (without deducting)
  const hasCredits = await billingService.checkCredits(authInfo.userId, service.prefix);
  if (!hasCredits) {
    // Track failed attempt due to insufficient credits
    await billingService.trackUsage(authInfo.tokenId, authInfo.userId, service.prefix, 0, false, method);
    
    // Get current credits from database for accurate error message
    const currentCredits = await billingService.getCurrentCredits(authInfo.userId);
    
    reply.code(402).send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      error: {
        code: -32000,
        message: 'Insufficient credits',
        data: {
          service: service.name,
          userCredits: currentCredits,
          requiredCredits: pricing.pricePerCall,
          shortBy: pricing.pricePerCall - currentCredits,
        },
      },
    });
    return;
  }

  let success = false;
  try {
    // Generic auth injection for OAuth services
    if (accessToken && service.authConfig?.type === 'oauth') {
      const serverHandler = service.adapter.getServerHandler();
      if (serverHandler && 'setAccessToken' in serverHandler) {
        (serverHandler as AuthInjectableService).setAccessToken!(accessToken);
      }
    }
    
    // Generic environment variable injection for API key services
    if (service.authConfig?.type === 'api-key') {
      // Extract service-specific environment variables from headers
      // Format: X-Env-{SERVICE}-{VAR_NAME}
      // Example: X-Env-COINBASE-API-KEY-NAME → COINBASE_API_KEY_NAME
      const envVars: Record<string, string> = {};
      const servicePrefix = `x-env-${service.prefix}-`.toLowerCase();
      
      for (const [key, value] of Object.entries(request.headers)) {
        const lowerKey = key.toLowerCase();
        
        // Check if header is for this specific service
        if (lowerKey.startsWith(servicePrefix)) {
          // Extract the env var name after the service prefix
          const envName = key.substring(servicePrefix.length);
          // Convert to standard env var format (uppercase with underscores)
          const formattedEnvName = `${service.prefix.toUpperCase()}_${envName.toUpperCase().replace(/-/g, '_')}`;
          envVars[formattedEnvName] = value as string;
        }
      }
      
      // Inject environment variables if the service supports it
      if (Object.keys(envVars).length > 0) {
        const serverHandler = service.adapter.getServerHandler();
        if (serverHandler && 'setEnvironment' in serverHandler) {
          (serverHandler as AuthInjectableService).setEnvironment!(envVars);
        }
      }
    }
    
    // Strip service prefix for standard MCP methods
    const processedRequest = { ...mcpRequest };
    const methodParts = method.split('.');
    if (methodParts.length > 1) {
      const methodWithoutPrefix = methodParts.slice(1).join('.');
      // Check if this is a standard MCP method
      const standardMcpMethods = ['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read'];
      if (standardMcpMethods.includes(methodWithoutPrefix)) {
        processedRequest.method = methodWithoutPrefix;
      }
    }
    
    // Handle the request
    const response = await service.adapter.handleHttpRequest(authInfo.tokenId, processedRequest);
    
    if (response) {
      success = !response.error;
      reply.code(200).send(response);
    } else {
      success = true;
      reply.code(202).send();
    }

    // Charge credits only on successful execution
    if (success) {
      const charged = await billingService.chargeCredits(authInfo.userId, service.prefix);
      if (!charged) {
        request.log.error({
          msg: 'Failed to charge credits after successful execution',
          userId: authInfo.userId,
          service: service.prefix,
          identifier: authInfo.tokenId,
        });
      }
    }
  } catch (error) {
    success = false;
    reply.code(500).send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    // Track usage for billing and analytics
    await billingService.trackUsage(
      authInfo.tokenId,
      authInfo.userId,
      service.prefix,
      pricing.pricePerCall,
      success,
      method
    );
  }
}

// Token-based MCP endpoint (new stable URLs)
fastify.post('/mcp/u/:slug', async (request, reply) => {
  const { slug } = request.params as { slug: string };
  const authHeader = request.headers.authorization as string;

  // Validate bearer token
  const authInfo = await tokenValidator.validateBearerToken(authHeader);
  if (!authInfo) {
    reply.code(401).send({ 
      error: 'Invalid or missing authentication',
      message: 'Bearer token is required in Authorization header',
      help: 'Add Authorization: Bearer <token> header to your request',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  // Verify token belongs to user with this slug
  const isValid = await tokenValidator.validateTokenForSlug(authInfo, slug);
  if (!isValid) {
    reply.code(403).send({ 
      error: 'Forbidden',
      message: 'Token does not belong to this user',
      code: 'FORBIDDEN'
    });
    return;
  }

  return handleMCPRequest(authInfo, request.body as any, request, reply);
});


// WebSocket endpoints
fastify.register(async function (fastify) {
  // WebSocket handler function
  async function handleWebSocket(socket: any, authInfo: any) {
    socket.on('message', async (message: Buffer) => {
      try {
        const mcpRequest = JSON.parse(message.toString());
        let method = mcpRequest.method;
        
        // Handle initialize request
        if (method === 'initialize') {
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {}
              },
              serverInfo: {
                name: 'RelayForge MCP Gateway',
                version: '1.0.0'
              }
            }
          }));
          return;
        }
        
        // Handle notifications/initialized (sent after initialize)
        if (method === 'notifications/initialized') {
          // This is a notification, typically no response needed for WebSocket
          return;
        }
        
        // Special handling for tools/call - extract service from tool name
        if (method === 'tools/call' && mcpRequest.params?.name) {
          const toolName = mcpRequest.params.name;
          // Extract service name from tool name (e.g., google-calendar_list-events -> google-calendar)
          const serviceName = toolName.split('_')[0];
          // Rewrite method to include service prefix for routing (using underscore separator)
          method = `${serviceName}_tools/call`;
        }
        
        // Special handling for system methods
        if (method === 'tools/list') {
          const tools: any[] = [];
          
          for (const service of serviceRouter.getAllServices()) {
            try {
              const response = await service.adapter.handleWebSocketMessage(authInfo.tokenId, message.toString());
              if (response && response.result && response.result.tools) {
                tools.push(...response.result.tools);
              }
            } catch (error) {
              console.error(`Failed to get tools from ${service.name}:`, error);
            }
          }
          
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: { tools },
          }));
          return;
        }
        
        // Route to service
        const serviceConfig = await serviceRouter.getServiceWithAuth(method, authInfo.userId);
        if (!serviceConfig) {
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          }));
          return;
        }

        const { service, accessToken } = serviceConfig;
        
        // Get service pricing
        const pricing = await billingService.getServicePricing(service.prefix);
        if (!pricing) {
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32000,
              message: `Service ${service.name} is not available`,
            },
          }));
          return;
        }

        // Check credits (without deducting)
        const hasCredits = await billingService.checkCredits(authInfo.userId, service.prefix);
        if (!hasCredits) {
          // Track failed attempt due to insufficient credits
          await billingService.trackUsage(authInfo.tokenId, authInfo.userId, service.prefix, 0, false, method);
          
          // Get current credits from database for accurate error message
          const currentCredits = await billingService.getCurrentCredits(authInfo.userId);
          
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32000,
              message: 'Insufficient credits',
              data: {
                service: service.name,
                userCredits: currentCredits,
                requiredCredits: pricing.pricePerCall,
                shortBy: pricing.pricePerCall - currentCredits,
              },
            },
          }));
          return;
        }
        
        let success = false;
        try {
          // Generic auth injection for OAuth services
          if (accessToken && service.authConfig?.type === 'oauth') {
            const serverHandler = service.adapter.getServerHandler();
            if (serverHandler && 'setAccessToken' in serverHandler) {
              (serverHandler as AuthInjectableService).setAccessToken!(accessToken);
            }
          }
          
          // Strip service prefix for standard MCP methods
          const messageObj = JSON.parse(message.toString());
          const methodParts = method.split('.');
          if (methodParts.length > 1) {
            const methodWithoutPrefix = methodParts.slice(1).join('.');
            // Check if this is a standard MCP method
            const standardMcpMethods = ['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read'];
            if (standardMcpMethods.includes(methodWithoutPrefix)) {
              messageObj.method = methodWithoutPrefix;
            }
          }
          
          const response = await service.adapter.handleWebSocketMessage(
            authInfo.tokenId,
            JSON.stringify(messageObj)
          );
          
          if (response) {
            success = !response.error;
            socket.send(JSON.stringify(response));
          }

          // Charge credits only on successful execution
          if (success) {
            const charged = await billingService.chargeCredits(authInfo.userId, service.prefix);
            if (!charged) {
              console.error('Failed to charge credits after successful execution', {
                userId: authInfo.userId,
                service: service.prefix,
                identifier: authInfo.tokenId,
              });
            }
          }
        } catch (error) {
          success = false;
          socket.send(JSON.stringify({
            jsonrpc: "2.0",
            id: mcpRequest.id,
            error: {
              code: -32603,
              message: "Internal error",
              data: error instanceof Error ? error.message : String(error)
            }
          }));
        } finally {
          // Track usage for billing and analytics
          await billingService.trackUsage(
            authInfo.tokenId,
            authInfo.userId,
            service.prefix,
            pricing.pricePerCall,
            success,
            method
          );
        }
      } catch (error) {
        socket.send(JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error)
          }
        }));
      }
    });

    socket.on('close', () => {
      // Cleanup if needed
    });
  }

  // Token-based WebSocket endpoint
  fastify.get('/mcp/u/:slug/ws', { websocket: true }, async (socket, req) => {
    const { slug } = req.params as { slug: string };
    const authHeader = req.headers.authorization as string;

    // Validate bearer token
    const authInfo = await tokenValidator.validateBearerToken(authHeader);
    if (!authInfo) {
      socket.send(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32002,
          message: "Invalid or missing authentication",
          data: {
            help: "Bearer token is required in Authorization header",
            code: "AUTH_REQUIRED"
          }
        }
      }));
      socket.close(1008, 'Authentication required');
      return;
    }

    // Verify token belongs to user with this slug
    const isValid = await tokenValidator.validateTokenForSlug(authInfo, slug);
    if (!isValid) {
      socket.send(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32002,
          message: "Forbidden",
          data: {
            message: "Token does not belong to this user",
            code: "FORBIDDEN"
          }
        }
      }));
      socket.close(1008, 'Forbidden');
      return;
    }

    await handleWebSocket(socket, authInfo);
  });

});

// Token management endpoints
fastify.post<{
  Body: { tokenId: string };
  Headers: { authorization: string };
}>('/api/tokens/revoke', async (request, reply) => {
  const authHeader = request.headers.authorization;
  const authInfo = await tokenValidator.validateBearerToken(authHeader);
  
  if (!authInfo) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing bearer token'
    });
  }

  try {
    // Get the token to be revoked
    const tokenToRevoke = await mcpTokenService.getTokenById(request.body.tokenId);
    
    if (!tokenToRevoke || tokenToRevoke.userId !== authInfo.userId) {
      return reply.status(404).send({
        error: 'Token not found',
        message: 'Token not found or you do not have permission to revoke it'
      });
    }

    // Revoke the token
    const revoked = await mcpTokenService.revokeToken(authInfo.userId, request.body.tokenId);
    
    if (revoked && tokenToRevoke.hashedToken) {
      // Immediately invalidate the cache for this token
      tokenValidator.invalidateToken(tokenToRevoke.hashedToken);
    }

    return reply.send({ success: revoked });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({
      error: 'Internal server error',
      message: 'Failed to revoke token'
    });
  }
});

// Cleanup token cache every 5 minutes (as a safety net)
setInterval(() => {
  tokenValidator.clearCache();
}, 5 * 60 * 1000);

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || 'localhost';
    
    await fastify.listen({ port, host });
    console.log(`🚀 MCP Gateway listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();