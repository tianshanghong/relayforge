import { describe, it, expect } from 'vitest';
import { userService, usageService } from '../../src/services';
import { testHelpers } from '../helpers';

describe('Billing Flow Integration', () => {
  it('should handle complete billing cycle', async () => {
    // Create user with initial credits
    const user = await userService.createUser({
      email: 'billing-test@example.com',
      provider: 'google',
      initialCredits: 500, // $5.00
    });
    
    const sessionId = await userService.createSession({
      userId: user.id,
    });
    
    // Seed pricing
    await testHelpers.seedServicePricing();
    
    // Simulate various service usage over time
    const usagePattern = [
      { service: 'google-calendar', count: 10 }, // 10 * 2 = 20 credits
      { service: 'openai', count: 20 },          // 20 * 1 = 20 credits  
      { service: 'github', count: 15 },          // 15 * 1 = 15 credits
    ];
    
    for (const { service, count } of usagePattern) {
      for (let i = 0; i < count; i++) {
        const canProceed = await userService.deductCredits(user.id, service);
        if (canProceed) {
          await usageService.trackUsage({
            userId: user.id,
            sessionId,
            service,
            success: true,
          });
        }
      }
    }
    
    // Check remaining credits
    const updatedUser = await userService.findUserById(user.id);
    expect(updatedUser?.credits).toBe(445); // 500 - 55
    
    // Get usage summary
    const summary = await usageService.getUsageSummary(user.id);
    expect(summary).toHaveLength(3);
    
    const googleSummary = summary.find(s => s.service === 'google-calendar');
    expect(googleSummary?.callCount).toBe(10);
    expect(googleSummary?.totalCredits).toBe(20);
    expect(googleSummary?.successRate).toBe(100);
    
    // Get top services
    const topServices = await usageService.getTopServices(user.id, 3);
    expect(topServices[0].service).toBe('google-calendar'); // Most expensive
    expect(topServices[0].credits).toBe(20);
    
    // Estimate monthly spend
    const monthlyEstimate = await usageService.estimateMonthlySpend(user.id, 1);
    expect(monthlyEstimate).toBe(1650); // 55 credits/day * 30 days
  });
  
  it('should handle insufficient credits', async () => {
    const user = await userService.createUser({
      email: 'poor-user@example.com',
      provider: 'google',
      initialCredits: 5, // Only $0.05
    });
    
    const sessionId = await userService.createSession({
      userId: user.id,
    });
    
    await testHelpers.seedServicePricing();
    
    // Try to use expensive service
    const canUseExpensive = await userService.deductCredits(user.id, 'google-calendar');
    expect(canUseExpensive).toBe(true); // First call succeeds (2 credits)
    
    const userAfterFirst = await userService.findUserById(user.id);
    expect(userAfterFirst?.credits).toBe(3);
    
    // Second call should succeed
    const canUseAgain = await userService.deductCredits(user.id, 'google-calendar');
    expect(canUseAgain).toBe(true);
    
    // Third call should fail
    const canUseThird = await userService.deductCredits(user.id, 'google-calendar');
    expect(canUseThird).toBe(false);
    
    // Credits should remain at 1
    const finalUser = await userService.findUserById(user.id);
    expect(finalUser?.credits).toBe(1);
    
    // Should still be able to use cheaper service
    const canUseCheap = await userService.deductCredits(user.id, 'openai');
    expect(canUseCheap).toBe(true);
  });
  
  it('should track failed usage for transparency', async () => {
    const user = await userService.createUser({
      email: 'failure-tracking@example.com',
      provider: 'google',
    });
    
    const sessionId = await userService.createSession({
      userId: user.id,
    });
    
    await testHelpers.seedServicePricing();
    
    // Track some successful and failed calls
    for (let i = 0; i < 5; i++) {
      await userService.deductCredits(user.id, 'openai');
      await usageService.trackUsage({
        userId: user.id,
        sessionId,
        service: 'openai',
        success: i % 2 === 0, // Alternate success/failure
      });
    }
    
    // Check usage history
    const usage = await usageService.getUserUsage(user.id);
    expect(usage).toHaveLength(5);
    
    const successfulCalls = usage.filter(u => u.success);
    const failedCalls = usage.filter(u => !u.success);
    
    expect(successfulCalls).toHaveLength(3);
    expect(failedCalls).toHaveLength(2);
    
    // All should be charged
    expect(usage.every(u => u.credits === 1)).toBe(true);
    
    // Check success rate in summary
    const summary = await usageService.getUsageSummary(user.id);
    const openaiSummary = summary.find(s => s.service === 'openai');
    
    expect(openaiSummary?.successRate).toBe(60); // 3/5 * 100
  });
  
  it('should generate accurate billing period summary', async () => {
    const user = await userService.createUser({
      email: 'monthly-billing@example.com',
      provider: 'google',
    });
    
    const sessionId = await userService.createSession({
      userId: user.id,
    });
    
    await testHelpers.seedServicePricing();
    
    // Create usage
    const services = ['google-calendar', 'openai', 'github'];
    for (const service of services) {
      for (let i = 0; i < 5; i++) {
        await userService.deductCredits(user.id, service);
        await usageService.trackUsage({
          userId: user.id,
          sessionId,
          service,
        });
      }
    }
    
    // Get current month billing
    const now = new Date();
    const summary = await usageService.getBillingPeriodSummary(
      user.id,
      now.getFullYear(),
      now.getMonth() + 1
    );
    
    expect(summary.totalCalls).toBe(15);
    expect(summary.totalCredits).toBe(20); // (5*2) + (5*1) + (5*1)
    expect(summary.byService).toHaveLength(3);
    
    // Verify date range
    expect(summary.startDate.getDate()).toBe(1);
    expect(summary.endDate.getMonth()).toBe(summary.startDate.getMonth());
  });
});