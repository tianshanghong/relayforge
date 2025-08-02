import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { prisma } from '@relayforge/database';
import { authRoutes } from '../src/routes/auth.routes';
import { providerRegistry } from '../src/providers/registry';
import { CSRFManager } from '../src/utils/csrf';
import { SessionManager } from '../src/utils/session';
import { tokenRefreshLock } from '../src/utils/token-lock';
import { errorHandler } from '../src/middleware/error-handler';
import type { GoogleProvider } from '../src/providers/google.provider';

// Mock environment for load testing
vi.mock('../src/config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'load-test-client-id',
    GOOGLE_CLIENT_SECRET: 'load-test-client-secret',
    GOOGLE_REDIRECT_URL: 'http://localhost:3001/oauth/google/callback',
    JWT_SECRET: 'load-test-jwt-secret-that-is-long-enough-for-security',
    SESSION_DURATION_DAYS: 30,
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: ['http://localhost:3000'],
    COOKIE_SECRET: 'load-test-cookie-secret',
    LOG_LEVEL: 'error',
    FRONTEND_URL: 'http://localhost:3000',
    PORT: 3001,
  },
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Disable logging for load testing
  });

  await app.register(cors, {
    origin: ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(cookie, {
    secret: 'load-test-cookie-secret',
    parseOptions: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    },
  });

  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/oauth' });

  return app;
}

describe('OAuth Load Testing', () => {
  let app: FastifyInstance;
  let googleProvider: GoogleProvider;

  const mockTokens = {
    accessToken: 'load-test-access-token',
    refreshToken: 'load-test-refresh-token',
    expiresIn: 3600,
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    tokenType: 'Bearer',
  };

  beforeEach(async () => {
    // Clear all data
    await prisma.oAuthConnection.deleteMany();
    await prisma.session.deleteMany();
    await prisma.linkedEmail.deleteMany();
    await prisma.user.deleteMany();

    // Clear token refresh locks
    tokenRefreshLock.clear();

    // Build app
    app = await buildApp();

    // Get Google provider for mocking
    googleProvider = providerRegistry.get('google') as GoogleProvider;

    // Mock provider methods for consistent responses
    vi.spyOn(googleProvider, 'exchangeCode').mockImplementation(async (code: string) => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      return {
        ...mockTokens,
        accessToken: `access-token-for-${code}`, // Include code in token for unique user generation
      };
    });

    vi.spyOn(googleProvider, 'getUserInfo').mockImplementation(async (accessToken: string) => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
      // Generate unique user based on code parameter to avoid conflicts
      const codeMatch = accessToken.match(/load-test-code-(\d+)/) || accessToken.match(/e2e-code-(\d+)/);
      const userId = codeMatch ? codeMatch[1] : Math.random().toString(36).substr(2, 9);
      return {
        id: `google-user-${userId}`,
        email: `user-${userId}@gmail.com`,
        name: `Test User ${userId}`,
        emailVerified: true,
      };
    });

    vi.spyOn(googleProvider, 'validateScopes').mockReturnValue(true);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    vi.clearAllMocks();
  });

  describe('Authorization URL Generation Load Test', () => {
    it('should handle 1000 concurrent authorization requests', async () => {
      const startTime = Date.now();
      const concurrency = 1000;
      
      console.log(`Starting ${concurrency} concurrent authorization requests...`);

      const promises = Array.from({ length: concurrency }, (_, i) => 
        app.inject({
          method: 'GET',
          url: `/oauth/google/authorize?redirect_url=https://example.com/success-${i}`,
        })
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all requests succeeded
      const successCount = results.filter(r => r.statusCode === 302).length;
      const failureCount = results.filter(r => r.statusCode !== 302).length;

      console.log(`Authorization Load Test Results:`);
      console.log(`- Duration: ${duration}ms`);
      console.log(`- Requests per second: ${Math.round(concurrency / (duration / 1000))}`);
      console.log(`- Success: ${successCount}/${concurrency}`);
      console.log(`- Failures: ${failureCount}`);
      console.log(`- Average response time: ${Math.round(duration / concurrency)}ms`);

      // Assertions
      expect(successCount).toBe(concurrency);
      expect(failureCount).toBe(0);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      // Verify all responses have valid states
      results.forEach((response, i) => {
        expect(response.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
        expect(response.headers.location).toContain('state=');
        
        // Extract and validate state
        const url = new URL(response.headers.location as string);
        const state = url.searchParams.get('state');
        expect(state).toBeTruthy();
        
        const statePayload = CSRFManager.validateState(state!);
        expect(statePayload.provider).toBe('google');
        expect(statePayload.redirectUrl).toBe(`https://example.com/success-${i}`);
      });
    }, 60000); // 60 second timeout
  });

  describe('OAuth Callback Load Test', () => {
    it('should handle 1000 concurrent OAuth callbacks', async () => {
      const startTime = Date.now();
      const concurrency = 1000;
      
      console.log(`Starting ${concurrency} concurrent OAuth callback requests...`);

      // Generate states for all requests
      const states = Array.from({ length: concurrency }, (_, i) => 
        CSRFManager.createState('google', `https://example.com/success-${i}`)
      );

      const promises = states.map((state, i) => 
        app.inject({
          method: 'GET',
          url: `/oauth/google/callback?code=load-test-code-${i}&state=${state}`,
        })
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Analyze results
      const successCount = results.filter(r => r.statusCode === 302 && 
        r.headers.location?.includes('/auth/success')).length;
      const failureCount = results.filter(r => r.statusCode !== 302 || 
        !r.headers.location?.includes('/auth/success')).length;

      console.log(`OAuth Callback Load Test Results:`);
      console.log(`- Duration: ${duration}ms`);
      console.log(`- Requests per second: ${Math.round(concurrency / (duration / 1000))}`);
      console.log(`- Success: ${successCount}/${concurrency}`);
      console.log(`- Failures: ${failureCount}`);
      console.log(`- Average response time: ${Math.round(duration / concurrency)}ms`);

      // Database verification
      const userCount = await prisma.user.count();
      const connectionCount = await prisma.oAuthConnection.count();
      const sessionCount = await prisma.session.count();

      console.log(`Database State After Load Test:`);
      console.log(`- Users created: ${userCount}`);
      console.log(`- OAuth connections: ${connectionCount}`);
      console.log(`- Sessions created: ${sessionCount}`);

      // Assertions
      expect(successCount).toBe(concurrency);
      expect(failureCount).toBe(0);
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
      expect(userCount).toBe(concurrency); // Each request should create a unique user
      expect(connectionCount).toBe(concurrency);
      expect(sessionCount).toBe(concurrency);

      // Verify database integrity
      const users = await prisma.user.findMany({
        include: {
          linkedEmails: true,
          sessions: true,
        },
      });

      // Check that all users have the expected structure
      users.forEach((user, i) => {
        expect(user.credits).toBe(500); // $5 free credits
        expect(user.linkedEmails).toHaveLength(1);
        expect(user.linkedEmails[0].isPrimary).toBe(true);
        expect(user.sessions).toHaveLength(1);
      });
    }, 120000); // 120 second timeout
  });

  describe('Token Refresh Load Test', () => {
    let testUsers: Array<{ id: string; connectionId: string }> = [];

    beforeEach(async () => {
      // Create 100 users with expired tokens for refresh testing
      const { crypto } = await import('@relayforge/database');
      
      for (let i = 0; i < 100; i++) {
        const user = await prisma.user.create({
      data: {
        primaryEmail: `refresh-user-${i}@gmail.com`,
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 100,
            linkedEmails: {
              create: {
                email: `refresh-user-${i}@gmail.com`,
                provider: 'google',
                isPrimary: true,
              },
            },
          },
        });

        const connection = await prisma.oAuthConnection.create({
          data: {
            userId: user.id,
            provider: 'google',
            email: `refresh-user-${i}@gmail.com`,
            scopes: ['calendar', 'email'],
            accessToken: await crypto.encrypt(`old-access-token-${i}`),
            refreshToken: await crypto.encrypt(`old-refresh-token-${i}`),
            expiresAt: new Date(Date.now() - 1000), // Expired
          },
        });

        testUsers.push({ id: user.id, connectionId: connection.id });
      }

      // Mock refresh token behavior
      vi.spyOn(googleProvider, 'refreshToken').mockImplementation(async (refreshToken: string) => {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
        return {
          accessToken: `new-${refreshToken}-access`,
          refreshToken: `new-${refreshToken}-refresh`,
          expiresIn: 3600,
          tokenType: 'Bearer',
        };
      });
    });

    it('should handle concurrent token refresh requests without race conditions', async () => {
      const { oauthFlowService } = await import('../src/services/oauth.service');
      
      const startTime = Date.now();
      console.log(`Starting concurrent token refresh test with ${testUsers.length} users...`);

      // Create multiple concurrent requests for each user to test race conditions
      const promises: Promise<string>[] = [];
      
      testUsers.forEach(user => {
        // 5 concurrent requests per user to test race condition handling
        for (let i = 0; i < 5; i++) {
          promises.push(oauthFlowService.getValidToken(user.id, 'google'));
        }
      });

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Token Refresh Load Test Results:`);
      console.log(`- Duration: ${duration}ms`);
      console.log(`- Total requests: ${promises.length}`);
      console.log(`- Requests per second: ${Math.round(promises.length / (duration / 1000))}`);
      console.log(`- Average response time: ${Math.round(duration / promises.length)}ms`);

      // Verify all requests succeeded and returned valid tokens
      results.forEach(token => {
        expect(token).toBeTruthy();
        expect(typeof token).toBe('string');
        expect(token.startsWith('new-')).toBe(true);
      });

      // Verify that refresh was called exactly once per user (not per request)
      const refreshCallCount = vi.mocked(googleProvider.refreshToken).mock.calls.length;
      console.log(`- Actual refresh calls: ${refreshCallCount}/${testUsers.length} (should be equal)`);
      
      expect(refreshCallCount).toBe(testUsers.length);

      // Verify database was updated correctly
      const connections = await prisma.oAuthConnection.findMany({
        where: {
          userId: { in: testUsers.map(u => u.id) },
        },
      });

      connections.forEach(conn => {
        expect(conn.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });
    }, 60000);
  });

  describe('Session Validation Load Test', () => {
    let testSessions: string[] = [];

    beforeEach(async () => {
      // Create 1000 test sessions
      for (let i = 0; i < 1000; i++) {
        const user = await prisma.user.create({
      data: {
        primaryEmail: `session-user-${i}@gmail.com`,
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 100,
          },
        });

        const { sessionId } = await SessionManager.createSession(user.id);
        testSessions.push(sessionId);
      }
    });

    it('should handle 1000 concurrent session validations', async () => {
      const startTime = Date.now();
      console.log(`Starting ${testSessions.length} concurrent session validations...`);

      const promises = testSessions.map(sessionId => 
        SessionManager.validateSession(sessionId)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const validCount = results.filter(r => r !== null).length;
      const invalidCount = results.filter(r => r === null).length;

      console.log(`Session Validation Load Test Results:`);
      console.log(`- Duration: ${duration}ms`);
      console.log(`- Requests per second: ${Math.round(testSessions.length / (duration / 1000))}`);
      console.log(`- Valid sessions: ${validCount}/${testSessions.length}`);
      console.log(`- Invalid sessions: ${invalidCount}`);
      console.log(`- Average response time: ${Math.round(duration / testSessions.length)}ms`);

      // Assertions
      expect(validCount).toBe(testSessions.length);
      expect(invalidCount).toBe(0);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify all results are valid user IDs
      results.forEach(userId => {
        expect(userId).toBeTruthy();
        expect(typeof userId).toBe('string');
      });
    }, 30000);
  });

  describe('End-to-End Load Test', () => {
    it('should handle complete OAuth flow for 500 concurrent users', async () => {
      const concurrency = 500;
      const startTime = Date.now();
      
      console.log(`Starting end-to-end OAuth flow for ${concurrency} concurrent users...`);

      // Step 1: Generate authorization URLs
      console.log('Step 1: Generating authorization URLs...');
      const authPromises = Array.from({ length: concurrency }, (_, i) => 
        app.inject({
          method: 'GET',
          url: `/oauth/google/authorize?redirect_url=https://example.com/e2e-${i}`,
        })
      );

      const authResults = await Promise.all(authPromises);
      const authEndTime = Date.now();
      
      console.log(`Authorization step completed in ${authEndTime - startTime}ms`);

      // Extract states from authorization responses
      const states = authResults.map((response, i) => {
        if (response.statusCode !== 302 || !response.headers.location) {
          throw new Error(`Authorization failed for request ${i}: ${response.statusCode}`);
        }
        const url = new URL(response.headers.location as string);
        return url.searchParams.get('state')!;
      });

      // Step 2: Process OAuth callbacks
      console.log('Step 2: Processing OAuth callbacks...');
      const callbackPromises = states.map((state, i) => 
        app.inject({
          method: 'GET',
          url: `/oauth/google/callback?code=e2e-code-${i}&state=${state}`,
        })
      );

      const callbackResults = await Promise.all(callbackPromises);
      const callbackEndTime = Date.now();

      console.log(`Callback step completed in ${callbackEndTime - authEndTime}ms`);

      // Step 3: Validate created sessions
      console.log('Step 3: Validating sessions...');
      const sessionIds = callbackResults.map((response, i) => {
        if (response.statusCode !== 302 || !response.headers.location?.includes('/auth/success')) {
          throw new Error(`Callback failed for request ${i}: ${response.statusCode} - ${response.headers.location}`);
        }
        const cookies = response.headers['set-cookie'] as string | string[];
        const cookieString = Array.isArray(cookies) ? cookies[0] : cookies;
        const sessionMatch = cookieString?.match(/rf_session=([^;]+)/);
        if (!sessionMatch) {
          throw new Error(`No session cookie found for request ${i}: ${cookieString}`);
        }
        return sessionMatch[1];
      });

      const validationPromises = sessionIds.map(sessionId => 
        SessionManager.validateSession(sessionId)
      );

      const validationResults = await Promise.all(validationPromises);
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      console.log(`End-to-End Load Test Results:`);
      console.log(`- Total duration: ${totalDuration}ms`);
      console.log(`- Authorization step: ${authEndTime - startTime}ms`);
      console.log(`- Callback step: ${callbackEndTime - authEndTime}ms`);
      console.log(`- Validation step: ${endTime - callbackEndTime}ms`);
      console.log(`- Average time per complete flow: ${Math.round(totalDuration / concurrency)}ms`);
      console.log(`- Throughput: ${Math.round(concurrency / (totalDuration / 1000))} complete flows/second`);

      // Verify all steps succeeded
      const authSuccesses = authResults.filter(r => r.statusCode === 302).length;
      const callbackSuccesses = callbackResults.filter(r => 
        r.statusCode === 302 && r.headers.location?.includes('/auth/success')
      ).length;
      const validationSuccesses = validationResults.filter(r => r !== null).length;

      console.log(`Success rates:`);
      console.log(`- Authorization: ${authSuccesses}/${concurrency}`);
      console.log(`- Callbacks: ${callbackSuccesses}/${concurrency}`);
      console.log(`- Validations: ${validationSuccesses}/${concurrency}`);

      // Database verification
      const finalUserCount = await prisma.user.count();
      const finalConnectionCount = await prisma.oAuthConnection.count();
      const finalSessionCount = await prisma.session.count();

      console.log(`Final database state:`);
      console.log(`- Users: ${finalUserCount}`);
      console.log(`- Connections: ${finalConnectionCount}`);
      console.log(`- Sessions: ${finalSessionCount}`);

      // Assertions
      expect(authSuccesses).toBe(concurrency);
      expect(callbackSuccesses).toBe(concurrency);
      expect(validationSuccesses).toBe(concurrency);
      expect(finalUserCount).toBe(concurrency);
      expect(finalConnectionCount).toBe(concurrency);
      expect(finalSessionCount).toBe(concurrency);
      expect(totalDuration).toBeLessThan(120000); // Should complete within 2 minutes
    }, 180000); // 3 minute timeout
  });
});