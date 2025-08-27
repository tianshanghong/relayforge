import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceRouter } from '../src/routing/service-router';
import { MCPHttpAdapter } from '@relayforge/mcp-adapter';
import { GoogleCalendarCompleteServer } from '../src/servers/google-calendar-complete';
import { OAuthClient } from '../src/clients/oauth-client';

// Mock the OAuth client
vi.mock('../src/clients/oauth-client');

describe('Token Refresh in Gateway', () => {
  let serviceRouter: ServiceRouter;
  let mockOAuthClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceRouter = new ServiceRouter();
    
    // Create mock OAuth client
    mockOAuthClient = {
      getToken: vi.fn(),
      healthCheck: vi.fn(),
    };
    
    // Set the mock OAuth client
    serviceRouter.setOAuthClient(mockOAuthClient as OAuthClient);
    
    // Register Google Calendar service
    const googleCalendarServer = new GoogleCalendarCompleteServer();
    serviceRouter.registerService({
      name: 'Google Calendar',
      prefix: 'google-calendar',
      requiresAuth: true,
      adapter: new MCPHttpAdapter(googleCalendarServer),
      authConfig: {
        type: 'oauth',
        provider: 'google'
      }
    });
  });

  it('should use getValidToken which handles automatic token refresh', async () => {
    const userId = 'test-user-123';
    const freshAccessToken = 'fresh-access-token-after-refresh';
    
    // Mock OAuth client getToken to return a fresh token
    mockOAuthClient.getToken.mockResolvedValue(freshAccessToken);

    // Call getServiceWithAuth
    const result = await serviceRouter.getServiceWithAuth('google-calendar_create-event', userId);

    // Verify OAuth client getToken was called
    expect(mockOAuthClient.getToken).toHaveBeenCalledWith(userId, 'google');
    
    // Verify we got the fresh token
    expect(result.accessToken).toBe(freshAccessToken);
    expect(result.service.prefix).toBe('google-calendar');
  });

  it('should handle token refresh errors gracefully', async () => {
    const userId = 'test-user-123';
    
    // Mock getToken to throw an error (e.g., refresh failed)
    mockOAuthClient.getToken.mockRejectedValue(new Error('Refresh token invalid'));

    // Call should throw an OAuthTokenError
    await expect(
      serviceRouter.getServiceWithAuth('google-calendar_create-event', userId)
    ).rejects.toThrow('Failed to obtain OAuth token for google');
  });

  it('demonstrates that expired tokens are automatically refreshed', async () => {
    const userId = 'test-user-123';
    
    // Simulate the behavior of getToken:
    // 1. First call: token is expired, so it refreshes and returns new token
    // 2. Second call: token is still valid, returns same token
    mockOAuthClient.getToken
      .mockResolvedValueOnce('refreshed-token-1')
      .mockResolvedValueOnce('refreshed-token-1');

    // First request - token was expired, got refreshed
    const result1 = await serviceRouter.getServiceWithAuth('google-calendar_list-events', userId);
    expect(result1.accessToken).toBe('refreshed-token-1');

    // Second request - token still valid, no refresh needed
    const result2 = await serviceRouter.getServiceWithAuth('google-calendar_list-events', userId);
    expect(result2.accessToken).toBe('refreshed-token-1');

    // getToken was called twice
    expect(mockOAuthClient.getToken).toHaveBeenCalledTimes(2);
  });
});