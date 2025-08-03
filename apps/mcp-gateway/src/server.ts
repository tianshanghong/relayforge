import * as dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { HelloWorldMCPServer } from './servers/hello-world';
import { GoogleCalendarCompleteServer } from './servers/google-calendar-complete';
import { TokenValidator } from './auth/token-validator';
import { BillingService } from './services/billing.service';
import { ServiceRouter } from './routing/service-router';
import { mcpTokenService } from '@relayforge/database';
import { registerServiceDiscoveryRoutes } from './routes/service-discovery';

const fastify = Fastify({
  logger: true
});

// Initialize components
const tokenValidator = new TokenValidator();
const billingService = new BillingService();
const serviceRouter = new ServiceRouter();

// Register services
const googleCalendarServer = new GoogleCalendarCompleteServer();
serviceRouter.registerService({
  name: 'Google Calendar',
  prefix: 'google-calendar',
  requiresAuth: true,
  adapter: new MCPHttpAdapter(googleCalendarServer),
});

// Register hello-world for testing
serviceRouter.registerService({
  name: 'Hello World',
  prefix: 'hello_world',
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
  const method = mcpRequest.method;
  
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
    
    reply.code(402).send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      error: {
        code: -32000,
        message: 'Insufficient credits',
        data: {
          service: service.name,
          userCredits: authInfo.credits,
          requiredCredits: pricing.pricePerCall,
          shortBy: pricing.pricePerCall - authInfo.credits,
        },
      },
    });
    return;
  }

  let success = false;
  try {
    // Set access token if needed
    if (accessToken && service.prefix === 'google-calendar') {
      googleCalendarServer.setAccessToken(accessToken);
    }
    
    // Handle the request
    const response = await service.adapter.handleHttpRequest(authInfo.tokenId, mcpRequest);
    
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
        const method = mcpRequest.method;
        
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
          
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32000,
              message: 'Insufficient credits',
              data: {
                service: service.name,
                userCredits: authInfo.credits,
                requiredCredits: pricing.pricePerCall,
                shortBy: pricing.pricePerCall - authInfo.credits,
              },
            },
          }));
          return;
        }
        
        let success = false;
        try {
          // Set access token if needed
          if (accessToken && service.prefix === 'google-calendar') {
            googleCalendarServer.setAccessToken(accessToken);
          }
          
          const response = await service.adapter.handleWebSocketMessage(
            authInfo.tokenId,
            message.toString()
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
    // Register WebSocket support
    await fastify.register(fastifyWebsocket);

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