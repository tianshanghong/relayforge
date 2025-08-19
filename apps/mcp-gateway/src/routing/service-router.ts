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
    // Extract prefix from method using underscore separator
    // Claude Code format: "google-calendar_create-event" -> "google-calendar"
    const parts = method.split('_');
    const prefix = parts[0];
    
    // First try direct prefix match
    if (this.services.has(prefix)) {
      return this.services.get(prefix) || null;
    }
    
    // For methods without underscore (like standalone "say-hello"), check registered services
    if (!method.includes('_')) {
      // Check each registered service to see if it might handle this method
      // For now, check hello-world service
      if (this.services.has('hello-world')) {
        return this.services.get('hello-world') || null;
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