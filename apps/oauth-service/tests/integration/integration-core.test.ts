import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { prisma } from '@relayforge/database';
import { authRoutes } from '../../src/routes/auth.routes';
import { accountRoutes } from '../../src/routes/account.routes';
import { providerRegistry } from '../../src/providers/registry';
import { CSRFManager } from '../../src/utils/csrf';
import { errorHandler } from '../../src/middleware/error-handler';
import type { GoogleProvider } from '../../src/providers/google.provider';

// Mock environment
vi.mock('../../src/config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'core-integration-test-client-id',
    GOOGLE_CLIENT_SECRET: 'core-integration-test-client-secret',
    GOOGLE_REDIRECT_URL: 'http://localhost:3001/oauth/google/callback',
    JWT_SECRET: 'core-integration-test-jwt-secret-that-is-long-enough-for-security',
    SESSION_DURATION_DAYS: 30,
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: ['http://localhost:3000'],
    COOKIE_SECRET: 'core-integration-test-cookie-secret',
    LOG_LEVEL: 'error',
    FRONTEND_URL: 'http://localhost:3000',
    PORT: 3001,
  },
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(cookie, {
    secret: 'core-integration-test-cookie-secret',
    parseOptions: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    },
  });

  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/oauth' });
  await app.register(accountRoutes, { prefix: '/api/account' });

  return app;
}

describe('Core OAuth Integration Tests', () => {
  let app: FastifyInstance;
  let googleProvider: GoogleProvider;

  const mockTokens = {
    accessToken: 'core-integration-access-token',
    refreshToken: 'core-integration-refresh-token',
    expiresIn: 3600,
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    tokenType: 'Bearer',
  };

  const mockUserInfo = {
    id: 'google-user-core-123',
    email: 'core-integration@gmail.com',
    name: 'Core Integration User',
    emailVerified: true,
  };

  beforeEach(async () => {
    // Clear database
    await prisma.oAuthConnection.deleteMany();
    await prisma.session.deleteMany();
    await prisma.linkedEmail.deleteMany();
    await prisma.user.deleteMany();

    app = await buildApp();
    googleProvider = providerRegistry.get('google') as GoogleProvider;

    // Mock provider methods
    vi.spyOn(googleProvider, 'exchangeCode').mockResolvedValue(mockTokens);
    vi.spyOn(googleProvider, 'getUserInfo').mockResolvedValue(mockUserInfo);
    vi.spyOn(googleProvider, 'validateScopes').mockReturnValue(true);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('End-to-End OAuth Flow', () => {
    it('should complete full OAuth flow with user creation and account access', async () => {
      console.log('🚀 Testing complete OAuth integration flow...');

      // Step 1: Initiate OAuth
      console.log('Step 1: Initiating OAuth flow...');
      const authResponse = await app.inject({
        method: 'GET',
        url: '/oauth/google/authorize?redirect_url=https://example.com/success',
      });

      expect(authResponse.statusCode).toBe(302);
      expect(authResponse.headers.location).toMatch(/^https:\/\/accounts\.google\.com/);

      // Extract state
      const url = new URL(authResponse.headers.location as string);
      const state = url.searchParams.get('state')!;
      expect(state).toBeTruthy();

      // Step 2: Handle OAuth callback
      console.log('Step 2: Processing OAuth callback...');
      const callbackResponse = await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=core-integration-code&state=${state}`,
      });

      expect(callbackResponse.statusCode).toBe(302);
      expect(callbackResponse.headers.location).toContain('/auth/success');

      // Extract session cookie
      const cookies = callbackResponse.headers['set-cookie'] as string;
      expect(cookies).toContain('rf_session=');
      const sessionMatch = cookies.match(/rf_session=([^;]+)/);
      expect(sessionMatch).toBeTruthy();
      const sessionId = sessionMatch![1];

      // Step 3: Verify database state
      console.log('Step 3: Verifying database state...');
      const user = await prisma.user.findFirst({
        include: {
          linkedEmails: true,
          oauthConnections: true,
          sessions: true,
        },
      });

      expect(user).toBeTruthy();
      expect(user!.primaryEmail).toBe('core-integration@gmail.com');
      expect(user!.credits).toBe(500);
      expect(user!.linkedEmails).toHaveLength(1);
      expect(user!.oauthConnections).toHaveLength(1);
      expect(user!.sessions).toHaveLength(1);

      // Step 4: Access account information
      console.log('Step 4: Accessing account information...');
      const accountResponse = await app.inject({
        method: 'GET',
        url: '/api/account/status',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
      });

      expect(accountResponse.statusCode).toBe(200);
      const accountData = JSON.parse(accountResponse.payload);

      expect(accountData).toMatchObject({
        primaryEmail: 'core-integration@gmail.com',
        credits: 500,
        linkedAccounts: expect.arrayContaining([
          expect.objectContaining({
            provider: 'google',
            email: 'core-integration@gmail.com',
          }),
        ]),
        connectedServices: ['google'],
      });

      console.log('✅ Complete OAuth flow integration test passed!');
    });

    it('should handle OAuth provider errors gracefully', async () => {
      console.log('🔍 Testing OAuth error handling...');

      // Test user denial
      const state = CSRFManager.createState('google');
      
      const denialResponse = await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?error=access_denied&state=${state}`,
      });

      expect(denialResponse.statusCode).toBe(302);
      expect(denialResponse.headers.location).toContain('/auth/error');
      expect(denialResponse.headers.location).toContain('error=USER_DENIED');

      // Verify no data was created
      const userCount = await prisma.user.count();
      expect(userCount).toBe(0);

      console.log('✅ OAuth error handling test passed!');
    });

    it('should handle multiple OAuth providers correctly', async () => {
      console.log('🔄 Testing multiple OAuth providers...');

      // Complete Google OAuth flow
      const googleState = CSRFManager.createState('google');
      
      const googleResponse = await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=multi-provider-google&state=${googleState}`,
      });

      expect(googleResponse.statusCode).toBe(302);
      expect(googleResponse.headers.location).toContain('/auth/success');

      // Verify user was created
      const user = await prisma.user.findFirst({
        include: { oauthConnections: true },
      });

      expect(user).toBeTruthy();
      expect(user!.oauthConnections).toHaveLength(1);
      expect(user!.oauthConnections[0].provider).toBe('google');

      console.log('✅ Multiple OAuth providers test passed!');
    });

    it('should provide discoverable OAuth providers', async () => {
      console.log('🔍 Testing OAuth provider discovery...');

      const providersResponse = await app.inject({
        method: 'GET',
        url: '/oauth/providers',
      });

      expect(providersResponse.statusCode).toBe(200);
      const providersData = JSON.parse(providersResponse.payload);
      
      expect(providersData.providers).toContainEqual(
        expect.objectContaining({
          name: 'google',
          displayName: 'Google',
        })
      );

      console.log('✅ OAuth provider discovery test passed!');
    });
  });

  describe('Session and Security Integration', () => {
    it('should enforce proper session validation', async () => {
      console.log('🔒 Testing session security...');

      // Try to access protected endpoint without session
      const noAuthResponse = await app.inject({
        method: 'GET',
        url: '/api/account/status',
      });

      expect(noAuthResponse.statusCode).toBe(400); // Missing authorization header

      // Try with invalid session
      const invalidAuthResponse = await app.inject({
        method: 'GET',
        url: '/api/account/status',
        headers: {
          authorization: 'Bearer invalid-session-id',
        },
      });

      expect(invalidAuthResponse.statusCode).toBe(401);

      console.log('✅ Session security test passed!');
    });

    it('should prevent CSRF attacks', async () => {
      console.log('🛡️  Testing CSRF protection...');

      const response = await app.inject({
        method: 'GET',
        url: '/oauth/google/callback?code=test-code&state=invalid-state',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('/auth/error');
      expect(response.headers.location).toContain('error=INVALID_STATE');

      console.log('✅ CSRF protection test passed!');
    });

    it('should validate OAuth scopes strictly', async () => {
      console.log('📋 Testing scope validation...');

      // Mock insufficient scopes
      vi.spyOn(googleProvider, 'validateScopes').mockReturnValue(false);

      const state = CSRFManager.createState('google');
      
      const response = await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=test-code&state=${state}`,
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('/auth/error');
      expect(response.headers.location).toContain('error=INSUFFICIENT_SCOPE');

      // Verify no user was created
      const userCount = await prisma.user.count();
      expect(userCount).toBe(0);

      console.log('✅ Scope validation test passed!');
    });
  });

  describe('Database Integration', () => {
    it('should maintain data consistency across OAuth operations', async () => {
      console.log('💾 Testing database consistency...');

      // Complete OAuth flow
      const state = CSRFManager.createState('google');
      
      await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=consistency-test&state=${state}`,
      });

      // Verify all related data was created consistently
      const userCount = await prisma.user.count();
      const emailCount = await prisma.linkedEmail.count();
      const connectionCount = await prisma.oAuthConnection.count();
      const sessionCount = await prisma.session.count();

      expect(userCount).toBe(1);
      expect(emailCount).toBe(1);
      expect(connectionCount).toBe(1);
      expect(sessionCount).toBe(1);

      // Verify relationships
      const user = await prisma.user.findFirst({
        include: {
          linkedEmails: true,
          oauthConnections: true,
          sessions: true,
        },
      });

      expect(user!.linkedEmails[0].userId).toBe(user!.id);
      expect(user!.oauthConnections[0].userId).toBe(user!.id);
      expect(user!.sessions[0].userId).toBe(user!.id);

      console.log('✅ Database consistency test passed!');
    });

    it('should handle database transaction failures gracefully', async () => {
      console.log('⚠️  Testing database error handling...');

      // Mock transaction failure
      const transactionSpy = vi.spyOn(prisma, '$transaction').mockRejectedValue(
        new Error('Database connection error')
      );

      const state = CSRFManager.createState('google');
      
      const response = await app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=db-error-test&state=${state}`,
      });

      // Restore the mock immediately after use
      transactionSpy.mockRestore();

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('/auth/error');

      // Verify no partial data was saved - use restored prisma
      const userCount = await prisma.user.count();
      const connectionCount = await prisma.oAuthConnection.count();
      const sessionCount = await prisma.session.count();

      expect(userCount).toBe(0);
      expect(connectionCount).toBe(0);
      expect(sessionCount).toBe(0);

      console.log('✅ Database error handling test passed!');
    });
  });
});