import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ServiceRouter } from '../src/routing/service-router';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { oauthFlowService } from '@relayforge/oauth-service/services';
import { 
  ServiceNotFoundError, 
  OAuthTokenError, 
  ProviderNotMappedError 
} from '../src/errors/gateway-errors';

// Mock the oauth service
vi.mock('@relayforge/oauth-service/services', () => ({
  oauthFlowService: {
    getValidToken: vi.fn(),
  },
}));

describe('Gateway Token Refresh Integration', () => {
  let serviceRouter: ServiceRouter;
  let mockAdapter: MCPHttpAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceRouter = new ServiceRouter();
    
    // Create a mock adapter
    mockAdapter = {
      handleRequest: vi.fn(),
    } as any;

    // Register a test service that requires auth
    serviceRouter.registerService({
      name: 'Google Calendar',
      prefix: 'google-calendar',
      requiresAuth: true,
      adapter: mockAdapter,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getServiceWithAuth', () => {
    it('should use getValidToken instead of getTokens', async () => {
      const userId = 'test-user-id';
      const mockAccessToken = 'refreshed-access-token';

      // Mock getValidToken to return a token
      vi.mocked(oauthFlowService.getValidToken).mockResolvedValue(mockAccessToken);

      // Get service with auth
      const result = await serviceRouter.getServiceWithAuth(
        'google-calendar.create_event',
        userId
      );

      // Verify getValidToken was called with correct parameters
      expect(oauthFlowService.getValidToken).toHaveBeenCalledWith(userId, 'google');
      
      // Verify the result
      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe(mockAccessToken);
      expect(result?.service.name).toBe('Google Calendar');
    });

    it('should handle token refresh errors with proper error type', async () => {
      const userId = 'test-user-id';

      // Mock getValidToken to throw an error
      vi.mocked(oauthFlowService.getValidToken).mockRejectedValue(
        new Error('Token refresh failed')
      );

      // Get service with auth - should throw OAuthTokenError
      await expect(
        serviceRouter.getServiceWithAuth('google-calendar.list_events', userId)
      ).rejects.toThrow('Failed to obtain OAuth token for google: Token refresh failed');

      // Verify the error has proper context
      try {
        await serviceRouter.getServiceWithAuth('google-calendar.list_events', userId);
      } catch (error: any) {
        expect(error.name).toBe('OAuthTokenError');
        expect(error.code).toBe('OAUTH_TOKEN_ERROR');
        expect(error.statusCode).toBe(401);
        expect(error.message).toContain('google');
        expect(error.message).toContain('Token refresh failed');
        expect(error.details).toMatchObject({
          service: 'google-calendar',
          userId,
          originalError: expect.any(Error)
        });
      }
    });

    it('should return service without token for non-auth services', async () => {
      // Register a service that doesn't require auth
      serviceRouter.registerService({
        name: 'Public API',
        prefix: 'public-api',
        requiresAuth: false,
        adapter: mockAdapter,
      });

      // Get service without auth
      const result = await serviceRouter.getServiceWithAuth(
        'public-api.get_data',
        'any-user-id'
      );

      // Should not call getValidToken
      expect(oauthFlowService.getValidToken).not.toHaveBeenCalled();
      
      // Should return service without access token
      expect(result).not.toBeNull();
      expect(result?.accessToken).toBeUndefined();
      expect(result?.service.name).toBe('Public API');
    });

    it('should handle unknown service prefixes', async () => {
      // Should throw ServiceNotFoundError for unknown services
      await expect(
        serviceRouter.getServiceWithAuth('unknown-service.method', 'user-id')
      ).rejects.toThrow('Service not found: unknown-service');

      expect(oauthFlowService.getValidToken).not.toHaveBeenCalled();
    });

    it('should throw error for unmapped OAuth providers', async () => {
      // Register a service with no OAuth provider mapping
      serviceRouter.registerService({
        name: 'Unmapped Service',
        prefix: 'unmapped-service',
        requiresAuth: true,
        adapter: mockAdapter,
      });

      await expect(
        serviceRouter.getServiceWithAuth('unmapped-service.method', 'user-id')
      ).rejects.toThrow('No OAuth provider mapped for service: unmapped-service');
    });
  });
});