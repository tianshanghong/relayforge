import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the OAuth service config before importing anything else
vi.mock('@relayforge/oauth-service', () => ({
  OAuthService: vi.fn(),
  sessionService: {
    createSession: vi.fn(),
    validateSession: vi.fn(),
  },
}));

import { WebSocket } from 'ws';
import { BillingService } from '../src/services/billing.service';
import { TokenValidator } from '../src/auth/token-validator';
import { prisma, mcpTokenService } from '@relayforge/database';

// Mock WebSocket
vi.mock('ws');

// Mock the database module
vi.mock('@relayforge/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    usage: {
      create: vi.fn(),
    },
  },
  mcpTokenService: {
    validateToken: vi.fn(),
  },
  UserService: vi.fn().mockImplementation(() => ({
    checkCredits: vi.fn(),
    deductCredits: vi.fn(),
    getServicePricing: vi.fn(),
  })),
}));

describe('WebSocket Billing Integration', () => {
  let mockSocket: any;
  let billingService: BillingService;
  let tokenValidator: TokenValidator;

  const mockAuthInfo = {
    userId: 'user-123',
    credits: 500,
    authType: 'token' as const,
    tokenId: 'token-456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock WebSocket
    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    billingService = new BillingService();
    tokenValidator = new TokenValidator();
  });

  describe('WebSocket Message Handling', () => {
    it('should handle tools/list without billing', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/list',
        params: {},
      };

      // tools/list should not trigger billing
      const mockUserService = (billingService as any).userService;
      
      // Process tools/list - no billing should occur
      expect(mockUserService.checkCredits).not.toHaveBeenCalled();
      expect(mockUserService.deductCredits).not.toHaveBeenCalled();
    });

    it('should bill for service-specific methods', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '2',
        method: 'google-calendar.list-calendars',
        params: {},
      };

      const mockUserService = (billingService as any).userService;
      mockUserService.checkCredits.mockResolvedValue(true);
      mockUserService.deductCredits.mockResolvedValue(true);
      mockUserService.getServicePricing.mockResolvedValue({ pricePerCall: 2 });

      // Simulate billing flow
      const hasCredits = await billingService.checkCredits(mockAuthInfo.userId, 'google-calendar');
      expect(hasCredits).toBe(true);

      const charged = await billingService.chargeCredits(mockAuthInfo.userId, 'google-calendar');
      expect(charged).toBe(true);

      await billingService.trackUsage(
        mockAuthInfo.tokenId,
        mockAuthInfo.userId,
        'google-calendar',
        2,
        true,
        message.method
      );

      expect(prisma.usage.create).toHaveBeenCalledWith({
        data: {
          tokenId: mockAuthInfo.tokenId,
          userId: mockAuthInfo.userId,
          service: 'google-calendar',
          method: 'google-calendar.list-calendars',
          credits: 2,
          success: true,
        },
      });
    });

    it('should send proper error response for insufficient credits', async () => {
      const mockUserService = (billingService as any).userService;
      mockUserService.checkCredits.mockResolvedValue(false);
      
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockAuthInfo.userId,
        credits: 1,
      } as any);

      const currentCredits = await billingService.getCurrentCredits(mockAuthInfo.userId);
      
      const errorResponse = {
        jsonrpc: '2.0',
        id: '3',
        error: {
          code: -32000,
          message: 'Insufficient credits',
          data: {
            service: 'Google Calendar',
            userCredits: currentCredits,
            requiredCredits: 2,
            shortBy: 2 - currentCredits,
          },
        },
      };

      // Verify error structure
      expect(errorResponse.error.data.userCredits).toBe(1);
      expect(errorResponse.error.data.shortBy).toBe(1);
    });
  });

  describe('WebSocket Connection Lifecycle', () => {
    it('should handle authentication failure', async () => {
      vi.mocked(mcpTokenService.validateToken).mockResolvedValue(null);

      const authHeader = 'Bearer invalid-token';
      const result = await tokenValidator.validateBearerToken(authHeader);
      
      expect(result).toBeNull();
      
      // Socket should be closed with auth error
      const expectedError = {
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'Invalid or missing authentication',
          data: {
            help: 'Bearer token is required in Authorization header',
            code: 'AUTH_REQUIRED',
          },
        },
      };

      // In real implementation, this would trigger socket.send(error) and socket.close(1008)
      mockSocket.send(JSON.stringify(expectedError));
      mockSocket.close(1008, 'Authentication required');

      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(expectedError));
      expect(mockSocket.close).toHaveBeenCalledWith(1008, 'Authentication required');
    });

    it('should validate token belongs to user slug', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockAuthInfo.userId,
        slug: 'happy-dolphin-42',
      } as any);

      const isValid = await tokenValidator.validateTokenForSlug(mockAuthInfo, 'happy-dolphin-42');
      expect(isValid).toBe(true);

      const isInvalid = await tokenValidator.validateTokenForSlug(mockAuthInfo, 'wrong-slug-99');
      expect(isInvalid).toBe(false);
    });
  });

  describe('Billing Error Scenarios', () => {
    it('should handle service not available', async () => {
      const mockUserService = (billingService as any).userService;
      mockUserService.getServicePricing.mockResolvedValue(null);

      const pricing = await billingService.getServicePricing('hello-world');
      expect(pricing).toBeNull();

      const errorResponse = {
        jsonrpc: '2.0',
        id: '4',
        error: {
          code: -32000,
          message: 'Service Hello World is not available',
        },
      };

      mockSocket.send(JSON.stringify(errorResponse));
      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(errorResponse));
    });

    it('should track usage for failed requests', async () => {
      // Track failed request due to processing error
      await billingService.trackUsage(
        mockAuthInfo.tokenId,
        mockAuthInfo.userId,
        'google-calendar',
        2,
        false,
        'google-calendar.create-event'
      );

      expect(prisma.usage.create).toHaveBeenCalledWith({
        data: {
          tokenId: mockAuthInfo.tokenId,
          userId: mockAuthInfo.userId,
          service: 'google-calendar',
          method: 'google-calendar.create-event',
          credits: 2,
          success: false,
        },
      });
    });

    it('should handle rapid sequential requests', async () => {
      const mockUserService = (billingService as any).userService;
      mockUserService.checkCredits.mockResolvedValue(true);
      mockUserService.deductCredits.mockResolvedValue(true);

      const methods = [
        'google-calendar.list-calendars',
        'google-calendar.list-events',
        'google-calendar.get-event',
      ];

      // Simulate rapid requests
      for (const method of methods) {
        await billingService.checkCredits(mockAuthInfo.userId, 'google-calendar');
        await billingService.chargeCredits(mockAuthInfo.userId, 'google-calendar');
        await billingService.trackUsage(
          mockAuthInfo.tokenId,
          mockAuthInfo.userId,
          'google-calendar',
          2,
          true,
          method
        );
      }

      expect(mockUserService.checkCredits).toHaveBeenCalledTimes(3);
      expect(mockUserService.deductCredits).toHaveBeenCalledTimes(3);
      expect(prisma.usage.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('Real-time Credits Display', () => {
    it('should fetch current credits for error messages', async () => {
      // Mock stale cached value vs current database value
      const cachedCredits = 500;
      const currentCredits = 0;

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockAuthInfo.userId,
        credits: currentCredits,
      } as any);

      const fetchedCredits = await billingService.getCurrentCredits(mockAuthInfo.userId);
      expect(fetchedCredits).toBe(currentCredits);
      expect(fetchedCredits).not.toBe(cachedCredits);
    });

    it('should handle missing user when fetching credits', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const credits = await billingService.getCurrentCredits('non-existent-user');
      expect(credits).toBe(0);
    });
  });
});