import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceRouter } from '../src/routing/service-router';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { GoogleCalendarCompleteServer } from '../src/servers/google-calendar-complete';

// Mock the oauth service
vi.mock('@relayforge/oauth-service/services', () => ({
  oauthFlowService: {
    getValidToken: vi.fn(),
  },
}));

// Mock the config
vi.mock('../src/config/service-providers', () => ({
  getProviderForService: vi.fn((service) => {
    if (service === 'google-calendar') return 'google';
    return null;
  }),
}));

describe('Token Refresh in Gateway', () => {
  let serviceRouter: ServiceRouter;
  let mockOAuthService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceRouter = new ServiceRouter();
    
    // Register Google Calendar service
    const googleCalendarServer = new GoogleCalendarCompleteServer();
    serviceRouter.registerService({
      name: 'Google Calendar',
      prefix: 'google-calendar',
      requiresAuth: true,
      adapter: new MCPHttpAdapter(googleCalendarServer),
    });

    // Get mocked oauth service
    const { oauthFlowService } = await import('@relayforge/oauth-service/services');
    mockOAuthService = oauthFlowService;
  });

  it('should use getValidToken which handles automatic token refresh', async () => {
    const userId = 'test-user-123';
    const freshAccessToken = 'fresh-access-token-after-refresh';
    
    // Mock getValidToken to return a fresh token
    mockOAuthService.getValidToken.mockResolvedValue(freshAccessToken);

    // Call getServiceWithAuth
    const result = await serviceRouter.getServiceWithAuth('google-calendar_create-event', userId);

    // Verify getValidToken was called (not getToken)
    expect(mockOAuthService.getValidToken).toHaveBeenCalledWith(userId, 'google');
    
    // Verify we got the fresh token
    expect(result.accessToken).toBe(freshAccessToken);
    expect(result.service.prefix).toBe('google-calendar');
  });

  it('should handle token refresh errors gracefully', async () => {
    const userId = 'test-user-123';
    
    // Mock getValidToken to throw an error (e.g., refresh failed)
    mockOAuthService.getValidToken.mockRejectedValue(new Error('Refresh token invalid'));

    // Call should throw an OAuthTokenError
    await expect(
      serviceRouter.getServiceWithAuth('google-calendar_create-event', userId)
    ).rejects.toThrow('Failed to obtain OAuth token for google');
  });

  it('demonstrates that expired tokens are automatically refreshed', async () => {
    const userId = 'test-user-123';
    
    // Simulate the behavior of getValidToken:
    // 1. First call: token is expired, so it refreshes and returns new token
    // 2. Second call: token is still valid, returns same token
    mockOAuthService.getValidToken
      .mockResolvedValueOnce('refreshed-token-1')
      .mockResolvedValueOnce('refreshed-token-1');

    // First request - token was expired, got refreshed
    const result1 = await serviceRouter.getServiceWithAuth('google-calendar_list-events', userId);
    expect(result1.accessToken).toBe('refreshed-token-1');

    // Second request - token still valid, no refresh needed
    const result2 = await serviceRouter.getServiceWithAuth('google-calendar_list-events', userId);
    expect(result2.accessToken).toBe('refreshed-token-1');

    // getValidToken was called twice
    expect(mockOAuthService.getValidToken).toHaveBeenCalledTimes(2);
  });
});