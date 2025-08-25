import { MCPRequest, MCPResponse } from '@relayforge/shared';
import { MCPServerHandler } from '@relayforge/mcp-adapter';
import { ServiceDefinition, MCPService, OAuthClient } from './types.js';

/**
 * Universal adapter that handles all service types with proper auth injection
 */
export class UniversalAdapter implements MCPServerHandler {
  private service: MCPService;
  private oauthClient?: OAuthClient;
  
  constructor(
    service: MCPService,
    private definition: ServiceDefinition,
    oauthClient?: OAuthClient
  ) {
    this.service = service;
    this.oauthClient = oauthClient;
    
    // Validate configuration
    this.validateConfiguration();
  }
  
  private validateConfiguration(): void {
    if (this.definition.auth === 'oauth' && !this.definition.provider) {
      throw new Error(`OAuth service ${this.definition.id} missing provider`);
    }
    
    if (this.definition.auth === 'api-key' && !this.definition.env_var) {
      throw new Error(`API key service ${this.definition.id} missing env_var`);
    }
    
    if (this.definition.auth === 'oauth' && !this.oauthClient) {
      throw new Error(`OAuth service ${this.definition.id} requires OAuth client`);
    }
  }
  
  /**
   * Handle MCP request with automatic auth injection
   */
  async handleRequest(request: MCPRequest, userId?: string): Promise<MCPResponse> {
    try {
      // Inject authentication if needed
      await this.injectAuth(userId);
      
      // Forward request to service
      return await this.service.handleRequest(request);
    } catch (error) {
      // Handle auth errors specifically
      if (error instanceof Error && error.message.includes('OAuth')) {
        return {
          jsonrpc: '2.0',
          id: request.id || 0,
          error: {
            code: -32001,
            message: 'Authentication failed',
            data: {
              service: this.definition.id,
              error: error.message
            }
          }
        };
      }
      
      // Generic error handling
      return {
        jsonrpc: '2.0',
        id: request.id || 0,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
  
  /**
   * Inject authentication based on service configuration
   */
  private async injectAuth(userId?: string): Promise<void> {
    switch (this.definition.auth) {
      case 'oauth':
        if (!userId) {
          throw new Error('User ID required for OAuth service');
        }
        if (!this.oauthClient) {
          throw new Error('OAuth client not configured');
        }
        if (this.service.setAccessToken) {
          const token = await this.oauthClient.getToken(
            userId,
            this.definition.provider!
          );
          this.service.setAccessToken(token);
        }
        break;
        
      case 'api-key':
        const apiKey = process.env[this.definition.env_var!];
        if (!apiKey) {
          throw new Error(`API key not found in ${this.definition.env_var}`);
        }
        if (this.service.setApiKey) {
          this.service.setApiKey(apiKey);
        }
        break;
        
      case 'none':
        // No auth needed
        break;
    }
  }
  
  /**
   * Get service tools/capabilities
   */
  async getTools(): Promise<any> {
    if (this.service.getTools) {
      return await this.service.getTools();
    }
    return {
      tools: [],
      description: `${this.definition.name} service`
    };
  }
  
  /**
   * Get service definition
   */
  getDefinition(): ServiceDefinition {
    return this.definition;
  }
  
  /**
   * Check if service requires authentication
   */
  requiresAuth(): boolean {
    return this.definition.auth !== 'none';
  }
  
  /**
   * Initialize service if needed
   */
  async initialize(): Promise<void> {
    if (this.service.initialize) {
      await this.service.initialize();
    }
  }
  
  /**
   * Cleanup service resources
   */
  async destroy(): Promise<void> {
    if (this.service.destroy) {
      await this.service.destroy();
    }
  }
}