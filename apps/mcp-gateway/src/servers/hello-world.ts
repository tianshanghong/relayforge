import { MCPRequest, MCPResponse, ServerInfo, Tool } from '@relayforge/shared';

export class HelloWorldMCPServer {
  private serverInfo: ServerInfo = {
    name: "hello-world",
    version: "1.0.0",
    description: "A simple hello world MCP server for testing"
  };

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: "2.0",
          id: id!,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {
              tools: {}
            },
            serverInfo: this.serverInfo
          }
        };

      case 'tools/list':
        return {
          jsonrpc: "2.0",
          id: id!,
          result: {
            tools: this.getTools()
          }
        };

      case 'tools/call':
        return await this.handleToolCall(params, id!);

      default:
        return {
          jsonrpc: "2.0",
          id: id!,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  }

  private getTools(): Tool[] {
    return [
      {
        name: "say_hello",
        description: "Says hello to a person",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the person to greet"
            }
          },
          required: ["name"]
        }
      }
    ];
  }

  private async handleToolCall(params: any, id: string | number): Promise<MCPResponse> {
    const { name: toolName, arguments: args } = params;

    if (toolName === "say_hello") {
      const name = args?.name || "World";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `Hello, ${name}! This is from RelayForge's hosted MCP server.`
            }
          ]
        }
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: `Unknown tool: ${toolName}`
      }
    };
  }
}