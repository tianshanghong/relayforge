import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerServiceDiscoveryRoutes } from '../src/routes/service-discovery';
import { TokenValidator } from '../src/auth/token-validator';
import { ServiceRouter } from '../src/routing/service-router';
import { UserService, OAuthService, prisma, mcpTokenService } from '@relayforge/database';

// Mock the database module
vi.mock('@relayforge/database', () => ({
  UserService: vi.fn().mockImplementation(() => ({
    findUserById: vi.fn(),
    getLinkedEmails: vi.fn(),
    getServicePricing: vi.fn(),
    getLastSuccessfulUsage: vi.fn(),
  })),
  OAuthService: vi.fn().mockImplementation(() => ({
    getTokens: vi.fn(),
  })),
  mcpTokenService: {
    validateToken: vi.fn(),
  },
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock the service router
vi.mock('../src/routing/service-router', () => ({
  ServiceRouter: vi.fn().mockImplementation(() => ({
    getAllServices: vi.fn(),
  })),
}));

// Mock the token validator
vi.mock('../src/auth/token-validator', () => ({
  TokenValidator: vi.fn().mockImplementation(() => ({
    validateBearerToken: vi.fn(),
  })),
}));

// Mock config

describe('Service Discovery API', () => {
  let fastify: any;
  let serviceRouter: any;
  let tokenValidator: any;
  let userService: any;
  let oauthService: any;

  beforeAll(async () => {
    fastify = Fastify();
    serviceRouter = new ServiceRouter();
    await registerServiceDiscoveryRoutes(fastify, serviceRouter);
    
    // Get mocked instances
    tokenValidator = vi.mocked(TokenValidator).mock.results[0].value;
    userService = vi.mocked(UserService).mock.results[0].value;
    oauthService = vi.mocked(OAuthService).mock.results[0].value;
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /services', () => {
    describe('Authentication', () => {
      it('should return 401 for missing bearer token', async () => {
        tokenValidator.validateBearerToken.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Unauthorized',
          message: 'Invalid or missing bearer token',
          code: 'AUTH_REQUIRED',
        });
      });

      it('should return 401 for invalid bearer token', async () => {
        tokenValidator.validateBearerToken.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer invalid_token',
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Unauthorized',
          message: 'Invalid or missing bearer token',
          code: 'AUTH_REQUIRED',
        });
      });

      it('should return 404 for non-existent user', async () => {
        tokenValidator.validateBearerToken.mockResolvedValue({
          userId: 'user-123',
          credits: 500,
          authType: 'token',
          tokenId: 'token-456',
        });

        userService.findUserById.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
          error: 'Not Found',
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      });
    });

    describe('Service Listing', () => {
      const mockUser = {
        id: 'user-123',
        primaryEmail: 'test@example.com',
        credits: 500,
      };

      const mockServices = [
        {
          name: 'Google Calendar',
          prefix: 'google-calendar',
          requiresAuth: true,
          authConfig: {
            type: 'oauth',
            provider: 'google'
          },
          adapter: {
            handleHttpRequest: vi.fn().mockResolvedValue({
              result: {
                tools: [
                  { name: 'google_calendar_create_event' },
                  { name: 'google_calendar_list_events' },
                ],
              },
            }),
          },
        },
        {
          name: 'OpenAI',
          prefix: 'openai',
          requiresAuth: true,
          authConfig: {
            type: 'api-key',
            envVar: 'OPENAI_API_KEY'
          },
          adapter: {
            handleHttpRequest: vi.fn().mockResolvedValue({
              result: {
                tools: [
                  { name: 'openai.complete' },
                  { name: 'openai.embed' },
                ],
              },
            }),
          },
        },
        {
          name: 'Hello World',
          prefix: 'hello-world',
          requiresAuth: false,
          adapter: {
            handleHttpRequest: vi.fn().mockResolvedValue({
              result: {
                tools: [
                  { name: 'hello-world.greet' },
                ],
              },
            }),
          },
        },
      ];

      beforeEach(() => {
        tokenValidator.validateBearerToken.mockResolvedValue({
          userId: 'user-123',
          credits: 500,
          authType: 'token',
          tokenId: 'token-456',
        });

        userService.findUserById.mockResolvedValue(mockUser);
        userService.getLinkedEmails.mockResolvedValue([
          { email: 'test@example.com', isPrimary: true },
          { email: 'test@company.com', isPrimary: false },
        ]);
        serviceRouter.getAllServices.mockReturnValue(mockServices);
      });

      it('should return correct service structure', async () => {
        userService.getServicePricing.mockImplementation((service: string) => {
          const pricing: Record<string, number> = {
            'google-calendar': 0.02,
            'openai': 0.005,
            'hello-world': 0,
          };
          return Promise.resolve({ pricePerCall: pricing[service] || 0 });
        });

        userService.getLastSuccessfulUsage.mockResolvedValue(null);
        oauthService.getTokens.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body).toHaveProperty('services');
        expect(body).toHaveProperty('account');
        expect(body.services).toHaveLength(3);
        
        // Check service structure
        expect(body.services[0]).toMatchObject({
          id: 'google-calendar',
          name: 'Google Calendar',
          methods: ['google_calendar_create_event', 'google_calendar_list_events'],
          auth: 'oauth',
          connected: false,
          price_per_call: 0.02,
          last_used: null,
        });

        // Check account info
        expect(body.account).toEqual({
          primary_email: 'test@example.com',
          balance: 5, // 500 credits = $5.00
          linked_emails: ['test@example.com', 'test@company.com'],
        });
      });

      it('should show connected status for valid OAuth services', async () => {
        const futureDate = new Date();
        futureDate.setHours(futureDate.getHours() + 1);

        oauthService.getTokens.mockResolvedValue({
          accessToken: 'encrypted_token',
          expiresAt: futureDate,
        });

        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0.02 });
        userService.getLastSuccessfulUsage.mockResolvedValue(new Date('2024-01-15T10:30:00Z'));

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        const googleCalendar = body.services.find((s: any) => s.id === 'google-calendar');
        expect(googleCalendar).toMatchObject({
          connected: true,
          last_used: '2024-01-15T10:30:00.000Z',
        });
      });

      it('should show disconnected status for expired OAuth tokens', async () => {
        const pastDate = new Date();
        pastDate.setHours(pastDate.getHours() - 1);

        oauthService.getTokens.mockResolvedValue({
          accessToken: 'encrypted_token',
          expiresAt: pastDate,
        });

        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0.02 });
        userService.getLastSuccessfulUsage.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        const googleCalendar = body.services.find((s: any) => s.id === 'google-calendar');
        expect(googleCalendar).toMatchObject({
          connected: false,
        });
      });

      it('should include required_env for client-key services', async () => {
        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0.005 });
        userService.getLastSuccessfulUsage.mockResolvedValue(null);
        oauthService.getTokens.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        const openai = body.services.find((s: any) => s.id === 'openai');
        expect(openai).toMatchObject({
          auth: 'client-key',
          setup: {
            required_env: 'OPENAI_API_KEY',
          },
        });
      });

      it('should not include setup for OAuth services', async () => {
        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0.02 });
        userService.getLastSuccessfulUsage.mockResolvedValue(null);
        oauthService.getTokens.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        const googleCalendar = body.services.find((s: any) => s.id === 'google-calendar');
        expect(googleCalendar).not.toHaveProperty('setup');
      });

      it('should handle services without pricing gracefully', async () => {
        userService.getServicePricing.mockResolvedValue(null);
        userService.getLastSuccessfulUsage.mockResolvedValue(null);
        oauthService.getTokens.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.services[0]).toMatchObject({
          price_per_call: 0,
        });
      });

      it('should return account info with balance in dollars', async () => {
        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0 });
        userService.getLastSuccessfulUsage.mockResolvedValue(null);
        oauthService.getTokens.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.account.balance).toBe(5); // 500 credits = $5.00
      });

      it('should handle empty service list gracefully', async () => {
        serviceRouter.getAllServices.mockReturnValue([]);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.services).toEqual([]);
        expect(body.account).toBeDefined();
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        tokenValidator.validateBearerToken.mockResolvedValue({
          userId: 'user-123',
          credits: 500,
          authType: 'token',
          tokenId: 'token-456',
        });

        userService.findUserById.mockResolvedValue({
          id: 'user-123',
          primaryEmail: 'test@example.com',
          credits: 500,
        });

        userService.getLinkedEmails.mockResolvedValue([
          { email: 'test@example.com', isPrimary: true },
        ]);
      });

      it('should handle service adapter failures gracefully', async () => {
        const mockServicesWithError = [
          {
            name: 'Google Calendar',
            prefix: 'google-calendar',
            requiresAuth: true,
            adapter: {
              handleHttpRequest: vi.fn().mockRejectedValue(new Error('Adapter error')),
            },
          },
          {
            name: 'OpenAI',
            prefix: 'openai',
            requiresAuth: true,
            adapter: {
              handleHttpRequest: vi.fn().mockResolvedValue({
                result: {
                  tools: [{ name: 'openai.complete' }],
                },
              }),
            },
          },
        ];

        serviceRouter.getAllServices.mockReturnValue(mockServicesWithError);
        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0.01 });
        userService.getLastSuccessfulUsage.mockResolvedValue(null);
        oauthService.getTokens.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        // Should still return both services
        expect(body.services).toHaveLength(2);
        
        // Failed service should have empty methods
        const googleCalendar = body.services.find((s: any) => s.id === 'google-calendar');
        expect(googleCalendar.methods).toEqual([]);
        
        // Other service should work normally
        const openai = body.services.find((s: any) => s.id === 'openai');
        expect(openai.methods).toEqual(['openai.complete']);
      });

      it('should handle malformed tool responses', async () => {
        const mockServicesWithBadResponse = [
          {
            name: 'Bad Service',
            prefix: 'bad-service',
            requiresAuth: false,
            adapter: {
              handleHttpRequest: vi.fn().mockResolvedValue({
                result: {
                  tools: 'not-an-array', // Invalid tools format
                },
              }),
            },
          },
          {
            name: 'Null Tools Service',
            prefix: 'null-tools',
            requiresAuth: false,
            adapter: {
              handleHttpRequest: vi.fn().mockResolvedValue({
                result: {
                  tools: [null, { name: 'valid-tool' }, { invalid: 'object' }],
                },
              }),
            },
          },
        ];

        serviceRouter.getAllServices.mockReturnValue(mockServicesWithBadResponse);
        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0 });
        userService.getLastSuccessfulUsage.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        // Bad service should have empty methods
        const badService = body.services.find((s: any) => s.id === 'bad-service');
        expect(badService.methods).toEqual([]);

        // Null tools service should only have valid tool
        const nullToolsService = body.services.find((s: any) => s.id === 'null-tools');
        expect(nullToolsService.methods).toEqual(['valid-tool']);
      });

      it('should continue processing other services if one fails', async () => {
        const mockServices = [
          {
            name: 'Service 1',
            prefix: 'service-1',
            requiresAuth: false,
            adapter: {
              handleHttpRequest: vi.fn().mockResolvedValue({
                result: { tools: [{ name: 'tool-1' }] },
              }),
            },
          },
          {
            name: 'Service 2',
            prefix: 'service-2',
            requiresAuth: false,
            adapter: {
              handleHttpRequest: vi.fn().mockRejectedValue(new Error('Service 2 error')),
            },
          },
          {
            name: 'Service 3',
            prefix: 'service-3',
            requiresAuth: false,
            adapter: {
              handleHttpRequest: vi.fn().mockResolvedValue({
                result: { tools: [{ name: 'tool-3' }] },
              }),
            },
          },
        ];

        serviceRouter.getAllServices.mockReturnValue(mockServices);
        userService.getServicePricing.mockResolvedValue({ pricePerCall: 0.01 });
        userService.getLastSuccessfulUsage.mockResolvedValue(null);

        const response = await fastify.inject({
          method: 'GET',
          url: '/services',
          headers: {
            authorization: 'Bearer mcp_live_test123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.services).toHaveLength(3);
        
        // Service 1 and 3 should have methods
        expect(body.services.find((s: any) => s.id === 'service-1').methods).toEqual(['tool-1']);
        expect(body.services.find((s: any) => s.id === 'service-3').methods).toEqual(['tool-3']);
        
        // Service 2 should have empty methods
        expect(body.services.find((s: any) => s.id === 'service-2').methods).toEqual([]);
      });
    });
  });
});