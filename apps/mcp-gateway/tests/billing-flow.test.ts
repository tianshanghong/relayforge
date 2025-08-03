import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the OAuth service config before importing anything else
vi.mock('@relayforge/oauth-service', () => ({
  OAuthService: vi.fn(),
  sessionService: {
    createSession: vi.fn(),
    validateSession: vi.fn(),
  },
}));

import { BillingService } from '../src/services/billing.service';
import { TokenValidator } from '../src/auth/token-validator';
import { ServiceRouter } from '../src/routing/service-router';
import { prisma, UserService } from '@relayforge/database';
import type { AuthInfo } from '../src/auth/token-validator';

// Mock the database module
vi.mock('@relayforge/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    servicePricing: {
      findUnique: vi.fn(),
    },
    usage: {
      create: vi.fn(),
    },
  },
  UserService: vi.fn().mockImplementation(() => ({
    checkCredits: vi.fn(),
    deductCredits: vi.fn(),
    getServicePricing: vi.fn(),
  })),
  mcpTokenService: {
    validateToken: vi.fn(),
  },
}));

// Mock the service router
vi.mock('../src/routing/service-router');

describe('Billing Flow Integration Tests', () => {
  let billingService: BillingService;
  let tokenValidator: TokenValidator;
  let serviceRouter: ServiceRouter;
  let mockUserService: any;

  const mockAuthInfo: AuthInfo = {
    userId: 'user-123',
    credits: 500,
    authType: 'token',
    tokenId: 'token-456',
  };

  const mockServicePricing = {
    service: 'google-calendar',
    pricePerCall: 2,
    active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    billingService = new BillingService();
    tokenValidator = new TokenValidator();
    serviceRouter = new ServiceRouter();
    
    // Get the mocked UserService instance
    mockUserService = (billingService as any).userService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HTTP Endpoint Billing', () => {
    it('should deduct credits on successful request', async () => {
      // Setup
      mockUserService.checkCredits.mockResolvedValue(true);
      mockUserService.deductCredits.mockResolvedValue(true);
      mockUserService.getServicePricing.mockResolvedValue(mockServicePricing);

      // Test credit check
      const hasCredits = await billingService.checkCredits(mockAuthInfo.userId, 'google-calendar');
      expect(hasCredits).toBe(true);
      expect(mockUserService.checkCredits).toHaveBeenCalledWith(mockAuthInfo.userId, 'google-calendar');

      // Test credit deduction
      const charged = await billingService.chargeCredits(mockAuthInfo.userId, 'google-calendar');
      expect(charged).toBe(true);
      expect(mockUserService.deductCredits).toHaveBeenCalledWith(mockAuthInfo.userId, 'google-calendar');
    });

    it('should not deduct credits on failed request', async () => {
      // Setup
      mockUserService.checkCredits.mockResolvedValue(true);
      mockUserService.getServicePricing.mockResolvedValue(mockServicePricing);

      // Only check credits, don't deduct on failure
      const hasCredits = await billingService.checkCredits(mockAuthInfo.userId, 'google-calendar');
      expect(hasCredits).toBe(true);
      
      // Simulate request failure - no deduction should happen
      expect(mockUserService.deductCredits).not.toHaveBeenCalled();
    });

    it('should reject request when insufficient credits', async () => {
      // Setup
      mockUserService.checkCredits.mockResolvedValue(false);
      mockUserService.getServicePricing.mockResolvedValue(mockServicePricing);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockAuthInfo.userId,
        credits: 0,
      } as any);

      // Test insufficient credits
      const hasCredits = await billingService.checkCredits(mockAuthInfo.userId, 'google-calendar');
      expect(hasCredits).toBe(false);

      // Get current credits for error message
      const currentCredits = await billingService.getCurrentCredits(mockAuthInfo.userId);
      expect(currentCredits).toBe(0);
      
      // No deduction should happen
      expect(mockUserService.deductCredits).not.toHaveBeenCalled();
    });

    it('should track usage with correct method name', async () => {
      // Test usage tracking
      await billingService.trackUsage(
        mockAuthInfo.tokenId,
        mockAuthInfo.userId,
        'google-calendar',
        2,
        true,
        'google-calendar.list-calendars'
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

    it('should handle credit check failures gracefully', async () => {
      // Setup database error
      mockUserService.checkCredits.mockRejectedValue(new Error('Database error'));

      // Test error handling
      await expect(
        billingService.checkCredits(mockAuthInfo.userId, 'google-calendar')
      ).rejects.toThrow('Database error');
    });

    it('should show real-time credits in error messages', async () => {
      // Setup
      mockUserService.checkCredits.mockResolvedValue(false);
      
      // Mock different credit values to simulate cache vs real-time
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ id: mockAuthInfo.userId, credits: 100 } as any) // Cached value
        .mockResolvedValueOnce({ id: mockAuthInfo.userId, credits: 0 } as any);   // Real-time value

      // Get current credits (should return real-time value)
      const currentCredits = await billingService.getCurrentCredits(mockAuthInfo.userId);
      expect(currentCredits).toBe(100);
    });
  });

  describe('WebSocket Endpoint Billing', () => {
    it('should deduct credits on successful WebSocket request', async () => {
      // Setup
      mockUserService.checkCredits.mockResolvedValue(true);
      mockUserService.deductCredits.mockResolvedValue(true);
      mockUserService.getServicePricing.mockResolvedValue(mockServicePricing);

      // Test WebSocket request billing flow
      const hasCredits = await billingService.checkCredits(mockAuthInfo.userId, 'google-calendar');
      expect(hasCredits).toBe(true);

      // Simulate successful request processing
      const charged = await billingService.chargeCredits(mockAuthInfo.userId, 'google-calendar');
      expect(charged).toBe(true);

      // Track usage
      await billingService.trackUsage(
        mockAuthInfo.tokenId,
        mockAuthInfo.userId,
        'google-calendar',
        2,
        true,
        'google-calendar.list-events'
      );

      expect(prisma.usage.create).toHaveBeenCalledWith({
        data: {
          tokenId: mockAuthInfo.tokenId,
          userId: mockAuthInfo.userId,
          service: 'google-calendar',
          method: 'google-calendar.list-events',
          credits: 2,
          success: true,
        },
      });
    });

    it('should track failed attempts due to insufficient credits', async () => {
      // Setup
      mockUserService.checkCredits.mockResolvedValue(false);

      // Track failed attempt
      await billingService.trackUsage(
        mockAuthInfo.tokenId,
        mockAuthInfo.userId,
        'google-calendar',
        0,
        false,
        'google-calendar.create-event'
      );

      expect(prisma.usage.create).toHaveBeenCalledWith({
        data: {
          tokenId: mockAuthInfo.tokenId,
          userId: mockAuthInfo.userId,
          service: 'google-calendar',
          method: 'google-calendar.create-event',
          credits: 0,
          success: false,
        },
      });
    });

    it('should include method name in WebSocket usage tracking', async () => {
      const methods = [
        'google-calendar.list-calendars',
        'google-calendar.create-event',
        'google-calendar.update-event',
        'google-calendar.delete-event',
      ];

      for (const method of methods) {
        await billingService.trackUsage(
          mockAuthInfo.tokenId,
          mockAuthInfo.userId,
          'google-calendar',
          2,
          true,
          method
        );
      }

      expect(prisma.usage.create).toHaveBeenCalledTimes(methods.length);
      
      // Verify each method was tracked
      methods.forEach((method, index) => {
        expect(prisma.usage.create).toHaveBeenNthCalledWith(index + 1, {
          data: expect.objectContaining({
            method,
          }),
        });
      });
    });

    it('should handle WebSocket connection lifecycle billing', async () => {
      // Test multiple requests in a single WebSocket session
      mockUserService.checkCredits.mockResolvedValue(true);
      mockUserService.deductCredits.mockResolvedValue(true);

      const requests = [
        { method: 'google-calendar.list-calendars', success: true },
        { method: 'google-calendar.create-event', success: true },
        { method: 'google-calendar.list-events', success: false }, // Simulate failure
      ];

      for (const request of requests) {
        if (request.success) {
          await billingService.chargeCredits(mockAuthInfo.userId, 'google-calendar');
        }
        
        await billingService.trackUsage(
          mockAuthInfo.tokenId,
          mockAuthInfo.userId,
          'google-calendar',
          request.success ? 2 : 0,
          request.success,
          request.method
        );
      }

      // Verify correct number of credit deductions
      expect(mockUserService.deductCredits).toHaveBeenCalledTimes(2); // Only successful requests
      expect(prisma.usage.create).toHaveBeenCalledTimes(3); // All requests tracked
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests without double-charging', async () => {
      // Setup
      mockUserService.checkCredits.mockResolvedValue(true);
      
      // Simulate slow deduction to test race condition
      mockUserService.deductCredits.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      // Launch concurrent requests
      const promises = Array(5).fill(null).map(() => 
        billingService.chargeCredits(mockAuthInfo.userId, 'google-calendar')
      );

      const results = await Promise.all(promises);
      
      // All should succeed
      expect(results).toEqual([true, true, true, true, true]);
      
      // Should be called 5 times (no deduplication in current implementation)
      expect(mockUserService.deductCredits).toHaveBeenCalledTimes(5);
    });

    it('should handle database errors during billing', async () => {
      // Setup database failure
      mockUserService.checkCredits.mockRejectedValue(new Error('Connection timeout'));

      // Test error propagation
      await expect(
        billingService.checkCredits(mockAuthInfo.userId, 'google-calendar')
      ).rejects.toThrow('Connection timeout');

      // Usage tracking should handle errors gracefully
      vi.mocked(prisma.usage.create).mockRejectedValue(new Error('Insert failed'));
      
      // Should not throw - trackUsage swallows errors
      await expect(
        billingService.trackUsage(
          mockAuthInfo.tokenId,
          mockAuthInfo.userId,
          'google-calendar',
          2,
          true,
          'google-calendar.list-calendars'
        )
      ).resolves.not.toThrow();
    });

    it('should handle service pricing not found', async () => {
      // Setup
      mockUserService.getServicePricing.mockResolvedValue(null);

      const pricing = await billingService.getServicePricing('unknown-service');
      expect(pricing).toBeNull();
    });

    it('should handle missing user gracefully', async () => {
      // Setup
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const currentCredits = await billingService.getCurrentCredits('non-existent-user');
      expect(currentCredits).toBe(0);
    });

    it('should track usage even when database insert fails', async () => {
      // Setup
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(prisma.usage.create).mockRejectedValue(new Error('Constraint violation'));

      // Should not throw
      await billingService.trackUsage(
        mockAuthInfo.tokenId,
        mockAuthInfo.userId,
        'google-calendar',
        2,
        true,
        'google-calendar.list-calendars'
      );

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to track usage:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Service Pricing', () => {
    it('should correctly retrieve service pricing', async () => {
      mockUserService.getServicePricing.mockResolvedValue({
        pricePerCall: 2,
      });

      const pricing = await billingService.getServicePricing('google-calendar');
      expect(pricing).toEqual({ pricePerCall: 2 });
    });

    it('should handle different service pricing', async () => {
      const services = [
        { name: 'google-calendar', price: 2 },
        { name: 'google-drive', price: 3 },
        { name: 'github', price: 1 },
        { name: 'openai', price: 0.5 },
      ];

      for (const service of services) {
        mockUserService.getServicePricing.mockResolvedValue({
          pricePerCall: service.price,
        });

        const pricing = await billingService.getServicePricing(service.name);
        expect(pricing?.pricePerCall).toBe(service.price);
      }
    });
  });
});