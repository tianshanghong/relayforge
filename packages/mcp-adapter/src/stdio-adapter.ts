import { spawn, ChildProcess } from 'child_process';
import { MCPMessage, MCPRequest, MCPResponse } from '@relayforge/shared';
import { EventEmitter } from 'events';

export class StdioMCPAdapter extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageQueue: string[] = [];
  private pendingRequests = new Map<string | number, {
    resolve: (value: MCPResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(
    private command: string,
    private args: string[] = [],
    private cwd?: string
  ) {
    super();
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(this.command, this.args, {
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.on('error', (error) => {
        reject(new Error(`Failed to start MCP server: ${error.message}`));
      });

      this.process.on('spawn', () => {
        this.setupMessageHandling();
        resolve();
      });

      this.process.on('exit', (code) => {
        this.emit('exit', code);
        this.cleanup();
      });
    });
  }

  async sendRequest(request: MCPRequest, timeoutMs: number = 30000): Promise<MCPResponse> {
    if (!this.process) {
      throw new Error('MCP server not started');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id!);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(request.id!, {
        resolve,
        reject,
        timeout
      });

      const message = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(message);
    });
  }

  private setupMessageHandling() {
    if (!this.process) return;

    let buffer = '';

    this.process.stdout!.on('data', (data) => {
      buffer += data.toString();
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line);
        }
      }
    });

    this.process.stderr!.on('data', (data) => {
      console.error('MCP Server stderr:', data.toString());
    });
  }

  private handleMessage(messageStr: string) {
    try {
      const message = JSON.parse(messageStr) as MCPMessage;
      
      if (message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);
          pending.resolve(message as MCPResponse);
        }
      } else {
        this.emit('notification', message);
      }
    } catch (error) {
      console.error('Failed to parse MCP message:', error, messageStr);
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.cleanup();
  }

  private cleanup() {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP server stopped'));
    }
    this.pendingRequests.clear();
  }
}