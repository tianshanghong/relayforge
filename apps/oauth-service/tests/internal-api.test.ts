import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { internalRoutes } from '../src/routes/internal.routes.js';
import { validateInternalApiKey } from '../src/middleware/internal-auth.js';
import { vi } from 'vitest';

// Mock the OAuth service
vi.mock('../src/services/oauth.service.js', () => ({
  oauthFlowService: {
    getValidToken: vi.fn(),
  },
}));

import { oauthFlowService } from '../src/services/oauth.service.js';

describe('Internal API', () => {
  let app: any;
  const TEST_INTERNAL_API_KEY = 'test-internal-api-key-1234567890abcdef';
  const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

  beforeAll(async () => {
    // Set up test environment
    process.env.INTERNAL_API_KEY = TEST_INTERNAL_API_KEY;
  });

  beforeEach(async () => {
    // Create a fresh Fastify instance for each test
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(internalRoutes);
    
    // Reset mocks
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Clean up
    delete process.env.INTERNAL_API_KEY;
  });

  describe('GET /api/internal/tokens/:provider', () => {
    it('should return 400 without authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/tokens/google',
        headers: {
          'x-user-id': TEST_USER_ID,
        },
      });

      expect(response.statusCode).toBe(400);
      // Schema validation error from Fastify
    });

    it('should return 401 with invalid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/tokens/google',
        headers: {
          'authorization': 'Bearer invalid-key',
          'x-user-id': TEST_USER_ID,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Forbidden',
        message: 'Invalid API key',
      });
    });

    it('should return 422 without x-user-id header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/tokens/google',
        headers: {
          'authorization': `Bearer ${TEST_INTERNAL_API_KEY}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should successfully return OAuth token with valid credentials', async () => {
      const mockToken = 'mock-access-token-12345';
      (oauthFlowService.getValidToken as any).mockResolvedValue(mockToken);

      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/tokens/google',
        headers: {
          'authorization': `Bearer ${TEST_INTERNAL_API_KEY}`,
          'x-user-id': TEST_USER_ID,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        accessToken: mockToken,
        provider: 'google',
        expiresAt: null,
      });

      expect(oauthFlowService.getValidToken).toHaveBeenCalledWith(TEST_USER_ID, 'google');
    });

    it('should return 404 when no OAuth connection exists', async () => {
      (oauthFlowService.getValidToken as any).mockRejectedValue(
        new Error('No OAuth connection found')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/tokens/github',
        headers: {
          'authorization': `Bearer ${TEST_INTERNAL_API_KEY}`,
          'x-user-id': TEST_USER_ID,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: 'Not Found',
        message: 'No OAuth connection found for provider: github',
      });
    });

    it('should return 401 when token refresh fails', async () => {
      (oauthFlowService.getValidToken as any).mockRejectedValue(
        new Error('Token refresh failed')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/tokens/google',
        headers: {
          'authorization': `Bearer ${TEST_INTERNAL_API_KEY}`,
          'x-user-id': TEST_USER_ID,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: 'Token Refresh Failed',
        message: 'Failed to refresh OAuth token. User may need to re-authenticate.',
      });
    });

    it('should return 500 for generic errors', async () => {
      (oauthFlowService.getValidToken as any).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/tokens/google',
        headers: {
          'authorization': `Bearer ${TEST_INTERNAL_API_KEY}`,
          'x-user-id': TEST_USER_ID,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: 'Internal Server Error',
        message: 'Failed to retrieve OAuth token',
      });
    });
  });

  describe('GET /api/internal/health', () => {
    it('should return 401 without API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/health',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return health status with valid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/health',
        headers: {
          'authorization': `Bearer ${TEST_INTERNAL_API_KEY}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
    });
  });
});

describe('Internal Auth Middleware', () => {
  it('should return 503 when INTERNAL_API_KEY is not configured', async () => {
    delete process.env.INTERNAL_API_KEY;
    
    const app = Fastify({ logger: false });
    app.get('/test', { preHandler: validateInternalApiKey }, async () => {
      return { success: true };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'authorization': 'Bearer some-key',
      },
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Service Unavailable');
    
    // Restore for other tests
    process.env.INTERNAL_API_KEY = 'test-key';
  });
});