import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ServiceRouter } from '../src/routing/service-router';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { OAuthClient } from '../src/clients/oauth-client';
import { 
  ServiceNotFoundError, 
  OAuthTokenError, 
  ProviderNotMappedError 
} from '../src/errors/gateway-errors';

// Mock the OAuth client
vi.mock('../src/clients/oauth-client');

describe('Gateway Token Refresh Integration', () => {
  let serviceRouter: ServiceRouter;
  let mockAdapter: MCPHttpAdapter;
  let mockOAuthClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceRouter = new ServiceRouter();
    
    // Create mock OAuth client
    mockOAuthClient = {
      getToken: vi.fn(),
      healthCheck: vi.fn(),
    };
    
    // Set the mock OAuth client
    serviceRouter.setOAuthClient(mockOAuthClient as OAuthClient);
    
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
      authConfig: {
        type: 'oauth',
        provider: 'google'
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getServiceWithAuth', () => {
    it('should use getValidToken instead of getTokens', async () => {
      const userId = 'test-user-id';
      const mockAccessToken = 'refreshed-access-token';

      // Mock OAuth client getToken to return a token
      mockOAuthClient.getToken.mockResolvedValue(mockAccessToken);

      // Get service with auth
      const result = await serviceRouter.getServiceWithAuth(
        'google-calendar_create-event',
        userId
      );

      // Verify OAuth client getToken was called with correct parameters
      expect(mockOAuthClient.getToken).toHaveBeenCalledWith(userId, 'google');
      
      // Verify the result
      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe(mockAccessToken);
      expect(result?.service.name).toBe('Google Calendar');
    });

    it('should handle token refresh errors with proper error type', async () => {
      const userId = 'test-user-id';

      // Mock OAuth client getToken to throw an error
      mockOAuthClient.getToken.mockRejectedValue(
        new Error('Token refresh failed')
      );

      // Get service with auth - should throw OAuthTokenError
      await expect(
        serviceRouter.getServiceWithAuth('google-calendar_list-events', userId)
      ).rejects.toThrow('Failed to obtain OAuth token for google: Token refresh failed');

      // Verify the error has proper context
      try {
        await serviceRouter.getServiceWithAuth('google-calendar_list-events', userId);
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
        'public-api_get-data',
        'any-user-id'
      );

      // Should not call getToken
      expect(mockOAuthClient.getToken).not.toHaveBeenCalled();
      
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

      expect(mockOAuthClient.getToken).not.toHaveBeenCalled();
    });

    it('should throw error for unmapped OAuth providers', async () => {
      // Register a service with OAuth auth but no provider specified
      serviceRouter.registerService({
        name: 'Unmapped Service',
        prefix: 'unmapped-service',
        requiresAuth: true,
        adapter: mockAdapter,
        authConfig: {
          type: 'oauth',
          provider: undefined // Missing provider
        } as any
      });

      await expect(
        serviceRouter.getServiceWithAuth('unmapped-service_method', 'user-id')
      ).rejects.toThrow('No OAuth provider mapped for service: unmapped-service');
    });
  });
});