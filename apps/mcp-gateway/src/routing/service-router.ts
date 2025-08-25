import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { OAuthClient } from '../clients/oauth-client.js';
import { 
  ServiceNotFoundError, 
  OAuthTokenError, 
  ProviderNotMappedError 
} from '../errors/gateway-errors.js';
import { getProviderForService } from '../config/service-providers.js';

export interface ServiceConfig {
  name: string;
  prefix: string;
  requiresAuth: boolean;
  adapter: MCPHttpAdapter;
}

export class ServiceRouter {
  private services: Map<string, ServiceConfig> = new Map();
  private oauthClient: OAuthClient | null = null;

  setOAuthClient(client: OAuthClient) {
    this.oauthClient = client;
  }

  registerService(config: ServiceConfig) {
    this.services.set(config.prefix, config);
  }

  getServiceByMethod(method: string): ServiceConfig | null {
    // Extract prefix from method using underscore separator
    // Claude Code format: "google-calendar_create-event" -> "google-calendar"
    const parts = method.split('_');
    const prefix = parts[0];
    
    // Try direct prefix match
    if (this.services.has(prefix)) {
      return this.services.get(prefix) || null;
    }
    
    // Special case: if method is exactly a tool name from hello-world (like "say-hello")
    // Only route to hello-world if it's specifically a hello-world method
    if (method === 'say-hello' && this.services.has('hello-world')) {
      return this.services.get('hello-world') || null;
    }
    
    return null;
  }

  async getServiceWithAuth(
    method: string,
    userId: string
  ): Promise<{ service: ServiceConfig; accessToken?: string }> {
    const service = this.getServiceByMethod(method);
    if (!service) {
      throw new ServiceNotFoundError(method.split('_')[0]);
    }

    if (!service.requiresAuth) {
      return { service };
    }

    // Get OAuth token for the service using configuration
    const provider = getProviderForService(service.prefix);
    if (!provider) {
      throw new ProviderNotMappedError(service.prefix);
    }

    // Ensure OAuth client is configured
    if (!this.oauthClient) {
      throw new Error('OAuth client not configured. Please set OAUTH_SERVICE_URL and INTERNAL_API_KEY.');
    }

    try {
      // Use OAuth client to get token via internal API
      const accessToken = await this.oauthClient.getToken(userId, provider);
      
      return { service, accessToken };
    } catch (error) {
      // Provide more context about the OAuth failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new OAuthTokenError(
        provider, 
        errorMessage,
        { 
          service: service.prefix,
          userId,
          originalError: error 
        }
      );
    }
  }

  getAllServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }

  getAvailableTools(): any[] {
    // This would aggregate tools from all services
    // For now, return empty array
    return [];
  }
}