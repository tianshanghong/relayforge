import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { oauthFlowService } from '@relayforge/oauth-service/dist/services';
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

  registerService(config: ServiceConfig) {
    this.services.set(config.prefix, config);
  }

  getServiceByMethod(method: string): ServiceConfig | null {
    // Extract prefix from method (e.g., "google_calendar.create_event" -> "google_calendar")
    const parts = method.split('.');
    const prefix = parts[0];
    
    // First try direct prefix match
    if (this.services.has(prefix)) {
      return this.services.get(prefix) || null;
    }
    
    // For methods without prefix (like "say_hello"), check if it belongs to hello_world
    if (!method.includes('.') && this.services.has('hello_world')) {
      // Check if hello_world service has this method
      const helloWorldService = this.services.get('hello_world');
      if (helloWorldService) {
        // For now, assume unprefixed methods belong to hello_world
        // In production, you'd want to check the actual tool list
        return helloWorldService;
      }
    }
    
    return null;
  }

  async getServiceWithAuth(
    method: string,
    userId: string
  ): Promise<{ service: ServiceConfig; accessToken?: string }> {
    const service = this.getServiceByMethod(method);
    if (!service) {
      throw new ServiceNotFoundError(method.split('.')[0]);
    }

    if (!service.requiresAuth) {
      return { service };
    }

    // Get OAuth token for the service using configuration
    const provider = getProviderForService(service.prefix);
    if (!provider) {
      throw new ProviderNotMappedError(service.prefix);
    }

    try {
      // Use getValidToken which handles automatic refresh
      const accessToken = await oauthFlowService.getValidToken(userId, provider);
      
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