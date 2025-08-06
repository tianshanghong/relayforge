import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { oauthFlowService } from '@relayforge/oauth-service/dist/services';
import { 
  ServiceNotFoundError, 
  OAuthTokenError, 
  ProviderNotMappedError 
} from '../errors/gateway-errors';
import { getProviderForService } from '../config/service-providers';

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
    const prefix = method.split('.')[0];
    return this.services.get(prefix) || null;
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