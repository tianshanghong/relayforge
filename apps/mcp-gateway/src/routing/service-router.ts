import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { OAuthService } from '@relayforge/database';

export interface ServiceConfig {
  name: string;
  prefix: string;
  requiresAuth: boolean;
  adapter: MCPHttpAdapter;
}

export class ServiceRouter {
  private services: Map<string, ServiceConfig> = new Map();
  private oauthService: OAuthService;

  constructor() {
    this.oauthService = new OAuthService();
  }

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
  ): Promise<{ service: ServiceConfig; accessToken?: string } | null> {
    const service = this.getServiceByMethod(method);
    if (!service) {
      return null;
    }

    if (!service.requiresAuth) {
      return { service };
    }

    // Get OAuth token for the service
    const providerMap: Record<string, string> = {
      'google-calendar': 'google',
      'google-drive': 'google',
      'github': 'github',
      'slack': 'slack',
    };

    const provider = providerMap[service.prefix];
    if (!provider) {
      throw new Error(`No OAuth provider mapped for service: ${service.prefix}`);
    }

    try {
      const accessToken = await this.oauthService.getTokens(userId, provider);
      if (!accessToken) {
        throw new Error(`No OAuth connection found for provider: ${provider}`);
      }

      return { service, accessToken: accessToken.accessToken };
    } catch (error) {
      console.error(`Failed to get OAuth token for ${provider}:`, error);
      return null;
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