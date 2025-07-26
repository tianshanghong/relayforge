import Fastify from 'fastify';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { HelloWorldMCPServer } from './servers/hello-world';
import { v4 as uuidv4 } from 'uuid';

const fastify = Fastify({
  logger: true
});

// Initialize servers
const servers = new Map<string, MCPHttpAdapter>();
servers.set('hello-world', new MCPHttpAdapter(new HelloWorldMCPServer()));

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// List available MCP servers
fastify.get('/mcp/servers', async (request, reply) => {
  return {
    servers: Array.from(servers.keys()).map(name => ({
      name,
      url: `/mcp/${name}`,
      websocket_url: `/mcp/${name}/ws`
    }))
  };
});

// HTTP endpoint for MCP requests
fastify.post('/mcp/:serverId', async (request, reply) => {
  const { serverId } = request.params as { serverId: string };
  const adapter = servers.get(serverId);
  
  if (!adapter) {
    reply.code(404).send({ error: 'Server not found' });
    return;
  }

  const sessionId = request.headers['mcp-session-id'] as string || uuidv4();
  
  try {
    const response = await adapter.handleHttpRequest(sessionId, request.body as any);
    
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

// WebSocket endpoint for MCP requests
fastify.register(async function (fastify) {
  fastify.get('/mcp/:serverId/ws', { websocket: true }, (connection, req) => {
    const { serverId } = req.params as { serverId: string };
    const adapter = servers.get(serverId);
    
    if (!adapter) {
      connection.socket.close(1000, 'Server not found');
      return;
    }

    const sessionId = uuidv4();
    
    connection.socket.on('message', async (message) => {
      try {
        const response = await adapter.handleWebSocketMessage(
          sessionId,
          message.toString()
        );
        
        if (response) {
          connection.socket.send(JSON.stringify(response));
        }
      } catch (error) {
        connection.socket.send(JSON.stringify({
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

    connection.socket.on('close', () => {
      adapter.cleanupSession(sessionId);
    });
  });
});

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  for (const adapter of servers.values()) {
    adapter.cleanupExpiredSessions();
  }
}, 5 * 60 * 1000);

// Start the server
const start = async () => {
  try {
    // Register WebSocket support
    await fastify.register(import('@fastify/websocket'));

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