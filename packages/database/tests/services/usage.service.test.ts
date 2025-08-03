import { describe, it, expect, beforeEach } from 'vitest';
import { usageService } from '../../src/services';
import { prisma } from '../../src';
import { testHelpers } from '../helpers';

describe('UsageService', () => {
  let user: any;
  let tokenId: string;

  beforeEach(async () => {
    // Seed service pricing first
    await testHelpers.seedServicePricing();
    
    // Create user and token
    user = await testHelpers.createUser();
    tokenId = await testHelpers.createMcpToken(user.id);
  });

  describe('trackUsage', () => {
    it('should track service usage', async () => {
      const usage = await usageService.trackUsage({
        userId: user.id,
        tokenId,
        service: 'google-calendar',
        method: 'createEvent',
        success: true,
      });

      expect(usage.userId).toBe(user.id);
      expect(usage.service).toBe('google-calendar');
      expect(usage.method).toBe('createEvent');
      expect(usage.credits).toBe(2); // Based on seed data
      expect(usage.success).toBe(true);
    });

    it('should track failed usage', async () => {
      const usage = await usageService.trackUsage({
        userId: user.id,
        tokenId,
        service: 'openai',
        success: false,
      });

      expect(usage.success).toBe(false);
      expect(usage.credits).toBe(1); // Still charged
    });

    it('should throw error for non-existent service', async () => {
      await expect(
        usageService.trackUsage({
          userId: user.id,
          tokenId,
          service: 'nonexistent',
        })
      ).rejects.toThrow('Service nonexistent is not available');
    });
  });

  describe('getUserUsage', () => {
    it('should get user usage history', async () => {
      // Track some usage
      for (let i = 0; i < 5; i++) {
        await usageService.trackUsage({
          userId: user.id,
          tokenId,
          service: i % 2 === 0 ? 'google-calendar' : 'openai',
        });
      }

      const usage = await usageService.getUserUsage(user.id);
      expect(usage).toHaveLength(5);
      expect(usage[0].timestamp.getTime()).toBeGreaterThan(usage[4].timestamp.getTime());
    });

    it('should filter by date range', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create old usage
      await prisma.usage.create({
        data: {
          userId: user.id,
          tokenId,
          service: 'openai',
          credits: 1,
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      });

      // Create recent usage
      await usageService.trackUsage({
        userId: user.id,
        tokenId,
        service: 'google-calendar',
      });

      const usage = await usageService.getUserUsage(user.id, yesterday, tomorrow);
      expect(usage).toHaveLength(1);
      expect(usage[0].service).toBe('google-calendar');
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        await usageService.trackUsage({
          userId: user.id,
          tokenId,
          service: 'openai',
        });
      }

      const usage = await usageService.getUserUsage(user.id, undefined, undefined, 5);
      expect(usage).toHaveLength(5);
    });
  });

  describe('getUsageSummary', () => {
    it('should summarize usage by service', async () => {
      // Track various usage
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'google-calendar' });
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'google-calendar' });
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'openai' });
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'openai', success: false });
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'github' });

      const summary = await usageService.getUsageSummary(user.id);

      expect(summary).toHaveLength(3);
      
      const googleSummary = summary.find(s => s.service === 'google-calendar');
      expect(googleSummary?.callCount).toBe(2);
      expect(googleSummary?.totalCredits).toBe(4); // 2 calls * 2 credits
      expect(googleSummary?.successRate).toBe(100);

      const openaiSummary = summary.find(s => s.service === 'openai');
      expect(openaiSummary?.callCount).toBe(2);
      expect(openaiSummary?.totalCredits).toBe(2); // 2 calls * 1 credit
      expect(openaiSummary?.successRate).toBe(50); // 1 success, 1 failure

      // Should be sorted by total credits descending
      expect(summary[0].service).toBe('google-calendar');
    });
  });

  describe('getBillingPeriodSummary', () => {
    it('should get monthly billing summary', async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // Track usage
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'google-calendar' });
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'openai' });
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'github' });

      const summary = await usageService.getBillingPeriodSummary(user.id, year, month);

      expect(summary.totalCalls).toBe(3);
      expect(summary.totalCredits).toBe(4); // 2 + 1 + 1
      expect(summary.byService).toHaveLength(3);
      expect(summary.startDate.getMonth()).toBe(month - 1);
      expect(summary.endDate.getMonth()).toBe(month - 1);
    });
  });

  describe('getServicePricing', () => {
    it('should get all active service pricing', async () => {
      const pricing = await usageService.getServicePricing();
      
      expect(pricing.length).toBeGreaterThan(0);
      expect(pricing.every(p => p.active)).toBe(true);
      
      const googlePricing = pricing.find(p => p.service === 'google-calendar');
      expect(googlePricing?.pricePerCall).toBe(2);
      expect(googlePricing?.category).toBe('oauth');
    });

    it('should include inactive services when requested', async () => {
      // Create inactive service
      await prisma.servicePricing.create({
        data: {
          service: 'deprecated-service',
          pricePerCall: 5,
          category: 'test',
          active: false,
        },
      });

      const activePricing = await usageService.getServicePricing(true);
      const allPricing = await usageService.getServicePricing(false);

      expect(allPricing.length).toBeGreaterThan(activePricing.length);
      expect(allPricing.some(p => p.service === 'deprecated-service')).toBe(true);
    });
  });

  describe('getTopServices', () => {
    it('should get top services by usage', async () => {
      // Create usage pattern
      for (let i = 0; i < 5; i++) {
        await usageService.trackUsage({ userId: user.id, tokenId, service: 'google-calendar' });
      }
      for (let i = 0; i < 3; i++) {
        await usageService.trackUsage({ userId: user.id, tokenId, service: 'openai' });
      }
      await usageService.trackUsage({ userId: user.id, tokenId, service: 'github' });

      const topServices = await usageService.getTopServices(user.id, 3);

      expect(topServices).toHaveLength(3);
      expect(topServices[0].service).toBe('google-calendar');
      expect(topServices[0].calls).toBe(5);
      expect(topServices[0].credits).toBe(10); // 5 * 2
      expect(topServices[1].service).toBe('openai');
      expect(topServices[1].calls).toBe(3);
    });

    it('should filter by recent days', async () => {
      // Create a token for testing
      const token = await prisma.mcpToken.create({
        data: {
          userId: user.id,
          name: 'Test Token',
          tokenHash: 'test-hash-' + Math.random(),
          prefix: 'mcp_test',
        },
      });

      // Create old usage
      const oldUsage = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      await prisma.usage.create({
        data: {
          userId: user.id,
          tokenId: token.id,
          service: 'github',
          credits: 1,
          timestamp: oldUsage,
        },
      });

      // Create recent usage
      await usageService.trackUsage({ userId: user.id, tokenId: token.id, service: 'openai' });

      const topServices = await usageService.getTopServices(user.id, 5, 30);
      
      expect(topServices.some(s => s.service === 'github')).toBe(false);
      expect(topServices.some(s => s.service === 'openai')).toBe(true);
    });
  });

  describe('estimateMonthlySpend', () => {
    it('should estimate monthly spend based on recent usage', async () => {
      // Track daily usage
      const dailyCredits = 10;
      for (let i = 0; i < 5; i++) {
        await usageService.trackUsage({ userId: user.id, tokenId, service: 'google-calendar' });
      }

      const estimate = await usageService.estimateMonthlySpend(user.id, 1);
      
      // 5 calls * 2 credits = 10 credits per day * 30 days = 300
      expect(estimate).toBe(300);
    });

    it('should handle no usage', async () => {
      const estimate = await usageService.estimateMonthlySpend(user.id, 7);
      expect(estimate).toBe(0);
    });
  });
});