import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src';
import { userService, oauthService, usageService } from '../../src/services';
import { testHelpers } from '../helpers';
import { performance } from 'perf_hooks';

describe('Database Write Performance', () => {
  const TARGET_WRITE_TIME_MS = 20; // 20ms target for writes
  const CONCURRENT_WRITES = 10;
  
  beforeAll(async () => {
    await testHelpers.cleanDatabase();
    await testHelpers.seedServicePricing();
  });

  afterAll(async () => {
    await testHelpers.cleanDatabase();
  });

  describe('User Creation Performance', () => {
    it('should create users within target time', async () => {
      const measurements = [];
      
      // Warm up
      await userService.createUser({
        email: 'warmup@example.com',
        provider: 'google',
      });
      
      // Measure single user creation
      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        const user = await userService.createUser({
          email: `perf-write-${i}@example.com`,
          provider: 'google',
        });
        const end = performance.now();
        
        expect(user).toBeTruthy();
        measurements.push(end - start);
      }
      
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[47]; // 95th percentile of 50
      
      console.log(`  User creation - Avg: ${avgTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(TARGET_WRITE_TIME_MS);
    });

    it('should handle concurrent user creation', async () => {
      const start = performance.now();
      
      const promises = [];
      for (let i = 0; i < CONCURRENT_WRITES; i++) {
        promises.push(
          userService.createUser({
            email: `concurrent-write-${i}-${Date.now()}@example.com`,
            provider: 'google',
          })
        );
      }
      
      const users = await Promise.all(promises);
      const end = performance.now();
      
      const totalTime = end - start;
      const avgTimePerUser = totalTime / CONCURRENT_WRITES;
      
      console.log(`  Concurrent user creation - Total: ${totalTime.toFixed(2)}ms, Avg per user: ${avgTimePerUser.toFixed(2)}ms`);
      
      expect(users).toHaveLength(CONCURRENT_WRITES);
      expect(avgTimePerUser).toBeLessThan(TARGET_WRITE_TIME_MS * 2); // Allow 2x for concurrent
    });
  });

  describe('OAuth Token Storage Performance', () => {
    it('should store OAuth tokens within target time', async () => {
      const user = await userService.createUser({
        email: 'oauth-perf@example.com',
        provider: 'google',
      });
      
      const measurements = [];
      
      for (let i = 0; i < 30; i++) {
        // Clean up previous connection if exists
        await prisma.oAuthConnection.deleteMany({
          where: {
            userId: user.id,
            provider: `provider-${i}`,
          },
        });
        
        const start = performance.now();
        const connection = await oauthService.storeTokens({
          userId: user.id,
          provider: `provider-${i}`,
          email: 'oauth-perf@example.com',
          scopes: ['read', 'write'],
          accessToken: 'encrypted-token-' + i,
          refreshToken: 'encrypted-refresh-' + i,
          expiresAt: new Date(Date.now() + 3600000),
        });
        const end = performance.now();
        
        expect(connection).toBeTruthy();
        measurements.push(end - start);
      }
      
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      console.log(`  OAuth token storage - Avg: ${avgTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(TARGET_WRITE_TIME_MS);
    });
  });

  describe('Usage Tracking Performance', () => {
    it('should track usage within target time', async () => {
      const user = await userService.createUser({
        email: 'usage-perf@example.com',
        provider: 'google',
      });
      
      const tokenId = await testHelpers.createMcpToken(user.id);
      
      const measurements = [];
      
      // Simulate rapid API calls
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        const usage = await usageService.trackUsage({
          userId: user.id,
          tokenId,
          service: 'google-calendar',
          method: 'createEvent',
          success: true,
        });
        const end = performance.now();
        
        expect(usage).toBeTruthy();
        measurements.push(end - start);
      }
      
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[95];
      
      console.log(`  Usage tracking - Avg: ${avgTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(TARGET_WRITE_TIME_MS);
    });

    it('should handle high-frequency usage tracking', async () => {
      const users = [];
      const sessions = [];
      
      // Create multiple users with sessions
      for (let i = 0; i < 5; i++) {
        const user = await userService.createUser({
          email: `high-freq-${i}@example.com`,
          provider: 'google',
        });
        const tokenId = await testHelpers.createMcpToken(user.id);
        users.push(user);
        sessions.push(tokenId);
      }
      
      // Simulate burst of usage from multiple users
      const start = performance.now();
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        const userIndex = i % users.length;
        promises.push(
          usageService.trackUsage({
            userId: users[userIndex].id,
            tokenId: sessions[userIndex],
            service: i % 2 === 0 ? 'google-calendar' : 'openai',
            success: true,
          })
        );
      }
      
      await Promise.all(promises);
      const end = performance.now();
      
      const totalTime = end - start;
      const avgTimePerTrack = totalTime / 50;
      
      console.log(`  High-frequency tracking - Total: ${totalTime.toFixed(2)}ms, Avg per track: ${avgTimePerTrack.toFixed(2)}ms`);
      
      expect(avgTimePerTrack).toBeLessThan(TARGET_WRITE_TIME_MS);
    });
  });

  describe('Transaction Performance', () => {
    it('should handle complex transactions efficiently', async () => {
      const measurements = [];
      
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        
        // Complex transaction: create user with linked email, OAuth, and initial usage
        const result = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              primaryEmail: `transaction-${i}@example.com`,
              credits: 500,
            },
          });
          
          const linkedEmail = await tx.linkedEmail.create({
            data: {
              userId: user.id,
              email: user.primaryEmail,
              provider: 'google',
              isPrimary: true,
            },
          });
          
          const session = await tx.session.create({
            data: {
              sessionId: `transaction-session-${i}`,
              userId: user.id,
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
          
          const oauthConnection = await tx.oAuthConnection.create({
            data: {
              userId: user.id,
              provider: 'google',
              email: user.primaryEmail,
              scopes: ['calendar.read'],
              accessToken: 'encrypted',
              expiresAt: new Date(Date.now() + 3600000),
            },
          });
          
          return { user, linkedEmail, session, oauthConnection };
        });
        
        const end = performance.now();
        
        expect(result.user).toBeTruthy();
        measurements.push(end - start);
      }
      
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);
      
      console.log(`  Complex transactions - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(TARGET_WRITE_TIME_MS * 3); // Allow 3x for complex transaction
    });
  });

  describe('Credit Deduction Performance', () => {
    it('should handle concurrent credit deductions safely and quickly', async () => {
      const user = await userService.createUser({
        email: 'credit-perf@example.com',
        provider: 'google',
        initialCredits: 10000, // Start with lots of credits
      });
      
      // Warm up
      await userService.deductCredits(user.id, 'openai');
      
      // Concurrent deductions
      const start = performance.now();
      const promises = [];
      
      for (let i = 0; i < 20; i++) {
        promises.push(
          userService.deductCredits(user.id, 'openai') // 1 credit each
        );
      }
      
      const results = await Promise.all(promises);
      const end = performance.now();
      
      const totalTime = end - start;
      const avgTimePerDeduction = totalTime / 20;
      
      console.log(`  Concurrent credit deductions - Total: ${totalTime.toFixed(2)}ms, Avg per deduction: ${avgTimePerDeduction.toFixed(2)}ms`);
      
      // All should succeed
      expect(results.every(r => r === true)).toBe(true);
      
      // Check final balance is correct
      const finalUser = await userService.findUserById(user.id);
      expect(finalUser?.credits).toBe(9979); // 10000 - 1 (warmup) - 20
      
      expect(avgTimePerDeduction).toBeLessThan(TARGET_WRITE_TIME_MS);
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk inserts efficiently', async () => {
      const BULK_SIZE = 1000;
      
      // Bulk user creation
      const users = [];
      for (let i = 0; i < BULK_SIZE; i++) {
        users.push({
          id: `bulk-user-${i}`,
          primaryEmail: `bulk-${i}@example.com`,
          credits: 500,
        });
      }
      
      const start = performance.now();
      await prisma.user.createMany({ data: users });
      const end = performance.now();
      
      const totalTime = end - start;
      const avgTimePerUser = totalTime / BULK_SIZE;
      
      console.log(`  Bulk insert ${BULK_SIZE} users - Total: ${totalTime.toFixed(2)}ms, Avg per user: ${avgTimePerUser.toFixed(2)}ms`);
      
      expect(avgTimePerUser).toBeLessThan(1); // Should be < 1ms per user in bulk
    });

    it('should handle bulk updates efficiently', async () => {
      // Update all bulk users' credits
      const start = performance.now();
      const result = await prisma.user.updateMany({
        where: {
          primaryEmail: {
            startsWith: 'bulk-',
          },
        },
        data: {
          credits: 1000,
        },
      });
      const end = performance.now();
      
      const totalTime = end - start;
      console.log(`  Bulk update ${result.count} users - Total: ${totalTime.toFixed(2)}ms`);
      
      expect(totalTime).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});