import * as dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { HelloWorldMCPServer } from './servers/hello-world';
import { GoogleCalendarSimpleServer } from './servers/google-calendar-simple';
import { SessionValidator } from './auth/session-validator';
import { ServiceRouter } from './routing/service-router';
// import { prisma } from '@relayforge/database';  // Now using sessionValidator methods
import { v4 as uuidv4 } from 'uuid';

const fastify = Fastify({
  logger: true
});

// Initialize components
const sessionValidator = new SessionValidator();
const serviceRouter = new ServiceRouter();

// Register services
const googleCalendarServer = new GoogleCalendarSimpleServer();
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

// Session-based MCP endpoint
fastify.post('/mcp/:sessionId', async (request, reply) => {
  const { sessionId } = request.params as { sessionId: string };
  
  // Validate session
  const sessionInfo = await sessionValidator.validateSession(sessionId);
  if (!sessionInfo) {
    reply.code(401).send({ error: 'Invalid or expired session' });
    return;
  }

  const mcpRequest = request.body as any;
  
  // Route based on method prefix
  const method = mcpRequest.method;
  
  // Special handling for system methods
  if (method === 'tools/list') {
    // Aggregate tools from all available services
    const tools: any[] = [];
    
    for (const service of serviceRouter.getAllServices()) {
      try {
        const response = await service.adapter.handleHttpRequest(sessionId, mcpRequest);
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
  const serviceConfig = await serviceRouter.getServiceWithAuth(method, sessionInfo.userId);
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
  const pricing = await sessionValidator.getServicePricing(service.prefix);
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
  const hasCredits = await sessionValidator.checkCredits(sessionInfo.userId, service.prefix);
  if (!hasCredits) {
    // Track failed attempt due to insufficient credits
    await sessionValidator.trackUsage(sessionId, sessionInfo.userId, service.prefix, 0, false);
    
    reply.code(402).send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      error: {
        code: -32000,
        message: 'Insufficient credits',
        data: {
          service: service.name,
          userCredits: sessionInfo.credits,
          requiredCredits: pricing.pricePerCall,
          shortBy: pricing.pricePerCall - sessionInfo.credits,
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
    const response = await service.adapter.handleHttpRequest(sessionId, mcpRequest);
    
    if (response) {
      success = !response.error;
      reply.code(200).send(response);
    } else {
      success = true;
      reply.code(202).send();
    }

    // Charge credits only on successful execution
    if (success) {
      const charged = await sessionValidator.chargeCredits(sessionInfo.userId, service.prefix);
      if (!charged) {
        // This shouldn't happen since we checked credits earlier,
        // but log it if it does
        request.log.error({
          msg: 'Failed to charge credits after successful execution',
          userId: sessionInfo.userId,
          service: service.prefix,
          sessionId,
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
    await sessionValidator.trackUsage(
      sessionId,
      sessionInfo.userId,
      service.prefix,
      pricing.pricePerCall,
      success
    );
  }
});

// Keep the old endpoint for backward compatibility
fastify.post('/mcp/hello-world', async (request, reply) => {
  const service = serviceRouter.getServiceByMethod('hello_world.test');
  if (!service) {
    reply.code(404).send({ error: 'Server not found' });
    return;
  }

  const sessionId = request.headers['mcp-session-id'] as string || uuidv4();
  
  try {
    const response = await service.adapter.handleHttpRequest(sessionId, request.body as any);
    
    if (response) {
      reply.header('mcp-session-id', sessionId);
      reply.code(200).send(response);
    } else {
      reply.code(202).send();
    }
  } catch (error) {
    reply.code(500).send({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: "Internal error",
        data: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

// WebSocket endpoint for session-based MCP requests
fastify.register(async function (fastify) {
  fastify.get('/mcp/:sessionId/ws', { websocket: true }, async (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };
    
    // Validate session
    const sessionInfo = await sessionValidator.validateSession(sessionId);
    if (!sessionInfo) {
      socket.close(1008, 'Invalid or expired session');
      return;
    }

    socket.on('message', async (message: Buffer) => {
      try {
        const mcpRequest = JSON.parse(message.toString());
        const method = mcpRequest.method;
        
        // Route to service
        const serviceConfig = await serviceRouter.getServiceWithAuth(method, sessionInfo.userId);
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
        
        // Set access token if needed
        if (accessToken && service.prefix === 'google-calendar') {
          googleCalendarServer.setAccessToken(accessToken);
        }
        
        const response = await service.adapter.handleWebSocketMessage(
          sessionId,
          message.toString()
        );
        
        if (response) {
          socket.send(JSON.stringify(response));
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
  });
});

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  sessionValidator.clearCache();
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