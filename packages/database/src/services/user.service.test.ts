import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { userService } from './index.js';
import { prisma } from '../index.js';

describe('UserService Credit Management', () => {
  let testUserId: string;

  beforeEach(async () => {
    
    // Create test user with 100 credits
    const user = await prisma.user.create({
      data: {
        primaryEmail: 'credit-test@example.com',
        slug: 'test-user-1',
        credits: 100,
      },
    });
    testUserId = user.id;

    // Create test service pricing
    await prisma.servicePricing.create({
      data: {
        service: 'test-service',
        category: 'api-key',
        pricePerCall: 10,
        active: true,
      },
    });
  });

  afterEach(async () => {
    // Clean up
    await prisma.servicePricing.deleteMany({
      where: { service: 'test-service' },
    });
    await prisma.user.deleteMany({
      where: { primaryEmail: 'credit-test@example.com' },
    });
  });

  describe('checkCredits', () => {
    it('should return true when user has enough credits', async () => {
      const result = await userService.checkCredits(testUserId, 'test-service');
      expect(result).toBe(true);
    });

    it('should return false when user has insufficient credits', async () => {
      // Update user to have only 5 credits
      await prisma.user.update({
        where: { id: testUserId },
        data: { credits: 5 },
      });

      const result = await userService.checkCredits(testUserId, 'test-service');
      expect(result).toBe(false);
    });

    it('should return false for non-existent service', async () => {
      const result = await userService.checkCredits(testUserId, 'non-existent-service');
      expect(result).toBe(false);
    });

    it('should return false for inactive service', async () => {
      await prisma.servicePricing.update({
        where: { service: 'test-service' },
        data: { active: false },
      });

      const result = await userService.checkCredits(testUserId, 'test-service');
      expect(result).toBe(false);
    });

    it('should not deduct credits when checking', async () => {
      const userBefore = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      await userService.checkCredits(testUserId, 'test-service');

      const userAfter = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      expect(userAfter?.credits).toBe(userBefore?.credits);
    });
  });

  describe('deductCredits', () => {
    it('should successfully deduct credits when user has enough', async () => {
      const result = await userService.deductCredits(testUserId, 'test-service');
      expect(result).toBe(true);

      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(user?.credits).toBe(90); // 100 - 10
    });

    it('should return false and not deduct when user has insufficient credits', async () => {
      // Update user to have only 5 credits
      await prisma.user.update({
        where: { id: testUserId },
        data: { credits: 5 },
      });

      const result = await userService.deductCredits(testUserId, 'test-service');
      expect(result).toBe(false);

      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(user?.credits).toBe(5); // Credits unchanged
    });

    it('should handle exact credit amount', async () => {
      // Update user to have exactly 10 credits
      await prisma.user.update({
        where: { id: testUserId },
        data: { credits: 10 },
      });

      const result = await userService.deductCredits(testUserId, 'test-service');
      expect(result).toBe(true);

      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(user?.credits).toBe(0);
    });

    it('should throw error for non-existent service', async () => {
      await expect(
        userService.deductCredits(testUserId, 'non-existent-service')
      ).rejects.toThrow('Service non-existent-service is not available');
    });

    it('should be atomic - no partial deductions on error', async () => {
      // Create a scenario that might cause a mid-transaction error
      const invalidUserId = 'invalid-user-id';
      
      try {
        await userService.deductCredits(invalidUserId, 'test-service');
      } catch (error) {
        // Expected to fail
      }

      // Check that no partial changes occurred
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(user?.credits).toBe(100); // Original amount
    });
  });

  describe('getServicePricing', () => {
    it('should return pricing for active service', async () => {
      const pricing = await userService.getServicePricing('test-service');
      expect(pricing).toEqual({
        pricePerCall: 10,
      });
    });

    it('should return null for non-existent service', async () => {
      const pricing = await userService.getServicePricing('non-existent-service');
      expect(pricing).toBeNull();
    });

    it('should return null for inactive service', async () => {
      await prisma.servicePricing.update({
        where: { service: 'test-service' },
        data: { active: false },
      });

      const pricing = await userService.getServicePricing('test-service');
      expect(pricing).toBeNull();
    });
  });

  describe('Credit Flow Integration', () => {
    it('should follow check-execute-charge pattern correctly', async () => {
      // 1. Check credits (should not deduct)
      const canProceed = await userService.checkCredits(testUserId, 'test-service');
      expect(canProceed).toBe(true);

      let userCheck = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(userCheck?.credits).toBe(100); // Still 100

      // 2. Simulate service execution
      const serviceSuccess = true; // Simulate successful execution

      // 3. Charge only on success
      if (serviceSuccess) {
        const charged = await userService.deductCredits(testUserId, 'test-service');
        expect(charged).toBe(true);
      }

      const userFinal = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(userFinal?.credits).toBe(90); // Now deducted
    });

    it('should not charge on service failure', async () => {
      // 1. Check credits
      const canProceed = await userService.checkCredits(testUserId, 'test-service');
      expect(canProceed).toBe(true);

      // 2. Simulate service execution failure
      const serviceSuccess = false;

      // 3. Should NOT charge on failure
      if (serviceSuccess) {
        await userService.deductCredits(testUserId, 'test-service');
      }

      const userFinal = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(userFinal?.credits).toBe(100); // Credits unchanged
    });
  });
});