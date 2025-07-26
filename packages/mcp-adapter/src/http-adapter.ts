import { MCPMessage, MCPRequest, MCPResponse } from '@relayforge/shared';
import { EventEmitter } from 'events';

export interface MCPServerHandler {
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
}

export class MCPHttpAdapter extends EventEmitter {
  private sessions = new Map<string, MCPSession>();

  constructor(private serverHandler: MCPServerHandler) {
    super();
  }

  async handleHttpRequest(
    sessionId: string,
    message: MCPMessage
  ): Promise<MCPResponse | null> {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = new MCPSession(sessionId);
      this.sessions.set(sessionId, session);
    }

    if (this.isRequest(message)) {
      try {
        const response = await this.serverHandler.handleRequest(message);
        session.updateLastActivity();
        return response;
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: message.id!,
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }

    return null;
  }

  handleWebSocketMessage(
    sessionId: string,
    message: string
  ): Promise<MCPResponse | null> {
    try {
      const parsedMessage = JSON.parse(message) as MCPMessage;
      return this.handleHttpRequest(sessionId, parsedMessage);
    } catch (error) {
      return Promise.resolve({
        jsonrpc: "2.0",
        id: null as any,
        error: {
          code: -32700,
          message: "Parse error",
          data: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private isRequest(message: MCPMessage): message is MCPRequest {
    return message.method !== undefined && message.id !== undefined;
  }

  cleanupSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  cleanupExpiredSessions(maxAge: number = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

class MCPSession {
  public lastActivity: number;

  constructor(public id: string) {
    this.lastActivity = Date.now();
  }

  updateLastActivity() {
    this.lastActivity = Date.now();
  }
}