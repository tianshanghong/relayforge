import { MCPRequest, MCPResponse } from '@relayforge/shared';
import { MCPService } from '../types/service.types.js';
import { CoinbaseMCPServer } from '../servers/coinbase.js';

/**
 * Coinbase service wrapper that implements MCPService interface
 */
export class CoinbaseService implements MCPService {
  private server: CoinbaseMCPServer;

  constructor() {
    this.server = new CoinbaseMCPServer();
  }

  /**
   * Set environment variables including API credentials
   */
  setEnvironment(env: Record<string, string>): void {
    this.server.setEnvironment(env);
  }
  

  /**
   * Handle MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    // Forward to the actual server - authentication is already set via environment
    return await this.server.handleRequest(request);
  }

  /**
   * Required by MCPService interface
   */
  requiresAuth(): boolean {
    return true;
  }

  /**
   * Required by MCPService interface
   */
  getAuthType(): 'oauth' | 'api-key' | 'none' {
    return 'api-key';
  }

  /**
   * Required by MCPService interface
   */
  getPrefix(): string {
    return 'coinbase';
  }
}