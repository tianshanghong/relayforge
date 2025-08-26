import { MCPRequest, MCPResponse } from '@relayforge/shared';

/**
 * Standard interface for all MCP services
 */
export interface MCPService {
  /**
   * Handle an MCP request
   */
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
  
  /**
   * Set OAuth access token for authenticated requests
   */
  setAccessToken?(token: string): void;
  
  /**
   * Set API key for authenticated requests
   */
  setApiKey?(key: string): void;
}

/**
 * Authentication configuration for services
 */
export interface AuthConfig {
  type: 'oauth' | 'api-key' | 'none';
  provider?: string;  // Required for oauth (e.g., 'google', 'github')
  envVar?: string;    // Required for api-key (e.g., 'OPENAI_API_KEY')
}