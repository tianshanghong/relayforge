import Fastify from 'fastify';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { HelloWorldMCPServer } from './servers/hello-world';
import { v4 as uuidv4 } from 'uuid';

const fastify = Fastify({
  logger: true
});

async function setupServer() {
  await fastify.register(import('@fastify/websocket'));

const servers = new Map<string, MCPHttpAdapter>();

servers.set('hello-world', new MCPHttpAdapter(new HelloWorldMCPServer()));

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

fastify.get('/mcp/servers', async () => {
  return {
    servers: Array.from(servers.keys()).map(name => ({
      name,
      url: `/mcp/${name}`,
      websocket_url: `/mcp/${name}/ws`
    }))
  };
});

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

fastify.register(async function (fastify) {
  fastify.get('/mcp/:serverId/ws', { websocket: true }, (connection, req) => {
    const { serverId } = req.params as { serverId: string };
    const adapter = servers.get(serverId);
    
    if (!adapter) {
      connection.close(1000, 'Server not found');
      return;
    }

    const sessionId = uuidv4();
    
    connection.on('message', async (message: any) => {
      try {
        const response = await adapter.handleWebSocketMessage(
          sessionId,
          message.toString()
        );
        
        if (response) {
          connection.send(JSON.stringify(response));
        }
      } catch (error) {
        connection.send(JSON.stringify({
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

    connection.on('close', () => {
      adapter.cleanupSession(sessionId);
    });
  });
});

setInterval(() => {
  for (const adapter of servers.values()) {
    adapter.cleanupExpiredSessions();
  }
}, 5 * 60 * 1000);

  const start = async () => {
    try {
      const port = parseInt(process.env.PORT || '3001');
      const host = process.env.HOST || '0.0.0.0';
      
      await fastify.listen({ port, host });
      console.log(`🚀 MCP Gateway listening on http://${host}:${port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };

  await start();
}

setupServer();