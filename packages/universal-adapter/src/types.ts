import { MCPRequest, MCPResponse } from '@relayforge/shared';

/**
 * Authentication type for services
 */
export type AuthType = 'oauth' | 'api-key' | 'none';

/**
 * Service definition configuration
 */
export interface ServiceDefinition {
  /** Unique identifier for the service */
  id: string;
  
  /** Display name for the service */
  name: string;
  
  /** URL prefix for routing (e.g., 'google-calendar') */
  prefix: string;
  
  /** Authentication type required */
  auth: AuthType;
  
  /** OAuth provider name (required if auth === 'oauth') */
  provider?: string;
  
  /** Environment variable name for API key (required if auth === 'api-key') */
  env_var?: string;
  
  /** Service implementation class name or path */
  handler: string;
  
  /** Additional service-specific configuration */
  config?: Record<string, any>;
}

/**
 * Interface that all MCP services must implement
 */
export interface MCPService {
  /** Initialize the service */
  initialize?(): Promise<void>;
  
  /** Handle an MCP request */
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
  
  /** Set OAuth access token for authenticated requests */
  setAccessToken?(token: string): void;
  
  /** Set API key for authenticated requests */
  setApiKey?(key: string): void;
  
  /** Get available tools/methods */
  getTools?(): Promise<any>;
  
  /** Cleanup resources */
  destroy?(): Promise<void>;
}

/**
 * OAuth client interface for token retrieval
 */
export interface OAuthClient {
  getToken(userId: string, provider: string): Promise<string>;
}