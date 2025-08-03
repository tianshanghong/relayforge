import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { prisma, crypto } from '@relayforge/database';
import { oauthFlowService } from '../src/services/oauth.service';
import { providerRegistry } from '../src/providers/registry';
import { tokenRefreshLock } from '../src/utils/token-lock';
import { OAuthError } from '../src/utils/errors';
import type { OAuthProvider } from '../src/providers/base.provider';

// Mock environment
vi.mock('../src/config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URL: 'http://localhost:3001/oauth/google/callback',
    JWT_SECRET: 'test-jwt-secret-that-is-long-enough-for-security',
    SESSION_DURATION_DAYS: 30,
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: ['http://localhost:3000'],
    COOKIE_SECRET: 'test-cookie-secret',
    LOG_LEVEL: 'error',
  },
}));

// Mock provider for testing
class MockOAuthProvider implements OAuthProvider {
  name = 'mockProvider';
  clientId = 'mock-client-id';
  clientSecret = 'mock-client-secret';
  authorizationUrl = 'https://mock.com/oauth/authorize';
  tokenUrl = 'https://mock.com/oauth/token';
  scopes = ['read', 'write'];

  getAuthorizationUrl(state: string): string {
    return `${this.authorizationUrl}?state=${state}`;
  }

  async exchangeCode(): Promise<any> {
    return {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'read write',
    };
  }

  async refreshToken(refreshToken: string): Promise<any> {
    if (refreshToken === 'invalid-refresh-token') {
      throw OAuthError.invalidGrant(this.name);
    }
    if (refreshToken === 'network-error-token') {
      throw new Error('Network error');
    }
    return {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'read write',
    };
  }

  async getUserInfo(): Promise<any> {
    return {
      id: 'mock-user-id',
      email: 'test@example.com',
      name: 'Test User',
    };
  }

  validateScopes(): boolean {
    return true;
  }
}

describe('OAuth Token Refresh', () => {
  let mockProvider: MockOAuthProvider;
  let testUserId: string;

  beforeAll(async () => {
    // Register mock provider once for all tests
    mockProvider = new MockOAuthProvider();
    providerRegistry._registerForTesting('mockProvider', mockProvider);
    
    // Add a handler for expected test rejections
    const unhandledRejectionHandler = (reason: any) => {
      // Ignore expected test rejections
      if (reason?.message === 'Network error' || 
          reason?.message === 'The authorization grant is invalid, expired, or revoked') {
        return;
      }
      // Re-throw other unexpected rejections
      throw reason;
    };
    
    process.on('unhandledRejection', unhandledRejectionHandler);
    
    // Store handler reference for cleanup
    (global as any).__testRejectionHandler = unhandledRejectionHandler;
  });
  
  afterAll(() => {
    // Remove the test rejection handler
    const handler = (global as any).__testRejectionHandler;
    if (handler) {
      process.removeListener('unhandledRejection', handler);
      delete (global as any).__testRejectionHandler;
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    tokenRefreshLock.clear();
    
    // Create test user for each test (since setup.ts cleans up users before each test)
    const user = await prisma.user.create({
      data: {
        primaryEmail: 'test@example.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 500,
        linkedEmails: {
          create: {
            email: 'test@example.com',
            provider: 'mockProvider',
            isPrimary: true,
          },
        },
      },
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Restore all mocks
    vi.restoreAllMocks();
    
    // Wait for all microtasks to complete to ensure promise chains are resolved
    await new Promise(resolve => process.nextTick(resolve));
  });


  describe('Token Expiry Buffer', () => {
    it('should refresh token before it expires based on buffer', async () => {
      // Create connection with token expiring in 4 minutes
      const expiresAt = new Date(Date.now() + 4 * 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('old-access-token'),
          refreshToken: await crypto.encrypt('mock-refresh-token'),
          expiresAt,
        },
      });

      const refreshSpy = vi.spyOn(mockProvider, 'refreshToken');

      // Get token - should trigger refresh because 4 minutes < 5 minute buffer
      const token = await oauthFlowService.getValidToken(testUserId, 'mockProvider');

      expect(refreshSpy).toHaveBeenCalledWith('mock-refresh-token');
      expect(token).toBe('new-access-token');

      // Verify token was updated in database
      const connection = await prisma.oAuthConnection.findFirst({
        where: { userId: testUserId, provider: 'mockProvider' },
      });
      expect(await crypto.decrypt(connection!.accessToken)).toBe('new-access-token');
      expect(await crypto.decrypt(connection!.refreshToken!)).toBe('new-refresh-token');
    });

    it('should not refresh token if it has enough time left', async () => {
      // Create connection with token expiring in 10 minutes
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('valid-access-token'),
          refreshToken: await crypto.encrypt('mock-refresh-token'),
          expiresAt,
        },
      });

      const refreshSpy = vi.spyOn(mockProvider, 'refreshToken');

      // Get token - should not trigger refresh
      const token = await oauthFlowService.getValidToken(testUserId, 'mockProvider');

      expect(refreshSpy).not.toHaveBeenCalled();
      expect(token).toBe('valid-access-token');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient errors', async () => {
      // Mock setTimeout to execute immediately
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: any) => { fn(); return 0; }) as any;
      
      // Create expired connection
      const expiresAt = new Date(Date.now() - 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('old-access-token'),
          refreshToken: await crypto.encrypt('network-error-token'),
          expiresAt,
        },
      });

      let callCount = 0;
      const refreshSpy = vi.spyOn(mockProvider, 'refreshToken').mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Network error');
        }
        return {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
          scope: 'read write',
        };
      });

      // Get token - should retry and eventually succeed
      const token = await oauthFlowService.getValidToken(testUserId, 'mockProvider');
      
      expect(refreshSpy).toHaveBeenCalledTimes(3);
      expect(token).toBe('new-access-token');
      
      // Restore setTimeout
      global.setTimeout = originalSetTimeout;

      // Verify failure tracking was reset on success
      const connection = await prisma.oAuthConnection.findFirst({
        where: { userId: testUserId, provider: 'mockProvider' },
      });
      expect(connection!.refreshFailureCount).toBe(0);
      expect(connection!.isHealthy).toBe(true);
    });

    it('should not retry on non-recoverable errors', async () => {
      // Create expired connection
      const expiresAt = new Date(Date.now() - 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('old-access-token'),
          refreshToken: await crypto.encrypt('valid-refresh-token'),
          expiresAt,
        },
      });

      // Mock the refresh to throw invalid_grant error
      const refreshSpy = vi.spyOn(mockProvider, 'refreshToken').mockImplementation(() => {
        return Promise.reject(OAuthError.invalidGrant('mockProvider'));
      });

      // Get token - should fail immediately without retries
      let error: any;
      try {
        await oauthFlowService.getValidToken(testUserId, 'mockProvider');
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toBe('The authorization grant is invalid, expired, or revoked');
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      // Verify failure was tracked
      const connection = await prisma.oAuthConnection.findFirst({
        where: { userId: testUserId, provider: 'mockProvider' },
      });
      expect(connection!.refreshFailureCount).toBe(1);
      expect(connection!.lastRefreshError).toContain('The authorization grant is invalid');
    });
  });

  describe('Concurrent Refresh Handling', () => {
    it('should handle concurrent refresh requests', async () => {
      // Create expired connection
      const expiresAt = new Date(Date.now() - 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('old-access-token'),
          refreshToken: await crypto.encrypt('mock-refresh-token'),
          expiresAt,
        },
      });

      let refreshCallCount = 0;
      const refreshSpy = vi.spyOn(mockProvider, 'refreshToken').mockImplementation(async () => {
        refreshCallCount++;
        // Simulate slow refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          accessToken: `new-access-token-${refreshCallCount}`,
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
          scope: 'read write',
        };
      });

      // Make multiple concurrent requests
      const promises = Array(5).fill(null).map(() =>
        oauthFlowService.getValidToken(testUserId, 'mockProvider')
      );

      const tokens = await Promise.all(promises);

      // Should only refresh once
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      
      // All requests should get the same token
      expect(tokens.every(token => token === 'new-access-token-1')).toBe(true);
    });
  });

  describe('Refresh Token Rotation', () => {
    it('should handle refresh token rotation', async () => {
      // Create expired connection
      const expiresAt = new Date(Date.now() - 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('old-access-token'),
          refreshToken: await crypto.encrypt('mock-refresh-token'),
          expiresAt,
        },
      });

      // Get token - should update with new refresh token
      await oauthFlowService.getValidToken(testUserId, 'mockProvider');

      const connection = await prisma.oAuthConnection.findFirst({
        where: { userId: testUserId, provider: 'mockProvider' },
      });
      expect(await crypto.decrypt(connection!.refreshToken!)).toBe('new-refresh-token');
    });

    it('should keep existing refresh token if not rotated', async () => {
      // Mock provider that doesn't rotate refresh tokens
      vi.spyOn(mockProvider, 'refreshToken').mockResolvedValue({
        accessToken: 'new-access-token',
        // No refreshToken in response
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: 'read write',
      });

      // Create expired connection
      const expiresAt = new Date(Date.now() - 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('old-access-token'),
          refreshToken: await crypto.encrypt('original-refresh-token'),
          expiresAt,
        },
      });

      // Get token
      await oauthFlowService.getValidToken(testUserId, 'mockProvider');

      const connection = await prisma.oAuthConnection.findFirst({
        where: { userId: testUserId, provider: 'mockProvider' },
      });
      
      // Should keep original refresh token
      expect(await crypto.decrypt(connection!.refreshToken!)).toBe('original-refresh-token');
    });
  });

  describe('Health Tracking', () => {
    it('should mark connection as unhealthy after multiple failures', async () => {
      // Mock setTimeout to execute immediately
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: any) => { fn(); return 0; }) as any;
      
      // Create expired connection
      const expiresAt = new Date(Date.now() - 60 * 1000);
      await prisma.oAuthConnection.create({
        data: {
          userId: testUserId,
          provider: 'mockProvider',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          accessToken: await crypto.encrypt('old-access-token'),
          refreshToken: await crypto.encrypt('network-error-token'),
          expiresAt,
        },
      });

      // Mock persistent failures
      const refreshSpy = vi.spyOn(mockProvider, 'refreshToken').mockImplementation(() => {
        return Promise.reject(new Error('Network error'));
      });

      // Attempt once to trigger 3 retries (which will mark as unhealthy)
      let caughtError = false;
      try {
        await oauthFlowService.getValidToken(testUserId, 'mockProvider');
      } catch (error) {
        caughtError = true;
        // Expected to fail after 3 retries
      }
      
      expect(caughtError).toBe(true);
      expect(refreshSpy).toHaveBeenCalledTimes(3); // Should retry 3 times
      
      // Restore setTimeout
      global.setTimeout = originalSetTimeout;

      const connection = await prisma.oAuthConnection.findFirst({
        where: { userId: testUserId, provider: 'mockProvider' },
      });

      expect(connection!.refreshFailureCount).toBe(3);
      expect(connection!.isHealthy).toBe(false);
      expect(connection!.lastRefreshError).toBe('Network error');
      expect(connection!.lastRefreshAttempt).toBeDefined();
    }, 10000); // Increase timeout just in case
  });
});