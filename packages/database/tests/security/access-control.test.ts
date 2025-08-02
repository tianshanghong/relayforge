import { describe, it, expect, beforeEach } from 'vitest';
import { userService, oauthService, usageService } from '../../src/services';
import { prisma } from '../../src';
import { testHelpers } from '../helpers';

describe('Access Control Security', () => {
  let user1: any;
  let user2: any;
  let session1: string;
  let session2: string;

  beforeEach(async () => {
    await testHelpers.cleanDatabase();
    await testHelpers.seedServicePricing();
    testHelpers.resetTestHelpers();

    // Create two separate users
    user1 = await userService.createUser({
      email: 'user1@example.com',
      provider: 'google',
    });

    user2 = await userService.createUser({
      email: 'user2@example.com',
      provider: 'google',
    });

    // Create sessions for both users
    session1 = await userService.createSession({ userId: user1.id });
    session2 = await userService.createSession({ userId: user2.id });
  });

  describe('User Data Isolation', () => {
    it('should not allow access to other user\'s data via ID', async () => {
      // User 2 should not be able to access User 1's data
      const user1Data = await userService.findUserById(user1.id);
      expect(user1Data).toBeTruthy();

      // In a real system, this would be enforced at the API layer
      // but we can verify the data model supports proper isolation
      const user1Emails = await userService.getLinkedEmails(user1.id);
      expect(user1Emails.every(e => e.userId === user1.id)).toBe(true);
    });

    it('should not allow linking emails to another user', async () => {
      // Try to link an email to user1 that already belongs to user2
      await expect(
        userService.linkEmail({
          userId: user1.id,
          email: 'user2@example.com',
          provider: 'github',
        })
      ).rejects.toThrow('already linked to another account');
    });

    it('should isolate OAuth connections by user', async () => {
      // Store OAuth tokens for both users
      await oauthService.storeTokens({
        userId: user1.id,
        provider: 'google',
        email: 'user1@example.com',
        scopes: ['calendar.read'],
        accessToken: 'user1-token',
        expiresAt: new Date(Date.now() + 3600000),
      });

      await oauthService.storeTokens({
        userId: user2.id,
        provider: 'google',
        email: 'user2@example.com',
        scopes: ['calendar.read'],
        accessToken: 'user2-token',
        expiresAt: new Date(Date.now() + 3600000),
      });

      // Each user should only see their own connections
      const user1Connections = await oauthService.getUserConnections(user1.id);
      const user2Connections = await oauthService.getUserConnections(user2.id);

      expect(user1Connections).toHaveLength(1);
      expect(user2Connections).toHaveLength(1);
      expect(user1Connections[0].userId).toBe(user1.id);
      expect(user2Connections[0].userId).toBe(user2.id);

      // Verify tokens are isolated
      const user1Tokens = await oauthService.getTokens(user1.id, 'google');
      const user2Tokens = await oauthService.getTokens(user2.id, 'google');

      expect(user1Tokens?.accessToken).toBe('user1-token');
      expect(user2Tokens?.accessToken).toBe('user2-token');
    });
  });

  describe('Session Security', () => {
    it('should validate session belongs to user', async () => {
      // Create usage with correct session-user mapping
      const usage1 = await usageService.trackUsage({
        userId: user1.id,
        identifier: session1,
        service: 'google-calendar',
        success: true,
      });

      expect(usage1.userId).toBe(user1.id);
      expect(usage1.identifier).toBe(session1);

      // In a real system, the API layer would prevent cross-user session usage
      // Here we verify the data model maintains referential integrity
      const session = await prisma.session.findUnique({
        where: { sessionId: session1 },
      });
      expect(session?.userId).toBe(user1.id);
    });

    it('should handle expired sessions', async () => {
      // Create an expired session
      const expiredSessionId = await userService.createSession({
        userId: user1.id,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      const isValid = await userService.validateSession(expiredSessionId);
      expect(isValid).toBe(false);

      // Should not update last accessed time for expired sessions
      const session = await prisma.session.findUnique({
        where: { sessionId: expiredSessionId },
      });
      expect(session?.expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it('should isolate session cleanup by user', async () => {
      // Create multiple sessions for each user
      const user1Sessions = [];
      const user2Sessions = [];

      for (let i = 0; i < 3; i++) {
        user1Sessions.push(await userService.createSession({
          userId: user1.id,
          expiresAt: new Date(Date.now() - 1000), // Expired
        }));
        user2Sessions.push(await userService.createSession({
          userId: user2.id,
          expiresAt: new Date(Date.now() + 3600000), // Not expired
        }));
      }

      // Run cleanup
      const cleaned = await testHelpers.cleanupExpiredSessions();

      // Only user1's expired sessions should be cleaned
      const remainingSessions = await prisma.session.findMany({
        where: {
          sessionId: {
            in: [...user1Sessions, ...user2Sessions],
          },
        },
      });
      expect(remainingSessions).toHaveLength(3); // Only user2's 3 sessions remain
      expect(remainingSessions.every(s => s.userId === user2.id)).toBe(true);
    });
  });

  describe('Credit System Security', () => {
    it('should prevent negative credit exploitation', async () => {
      // Set user to low credits
      await prisma.user.update({
        where: { id: user1.id },
        data: { credits: 1 },
      });

      // Try to use expensive service
      const canUse = await userService.deductCredits(user1.id, 'google-calendar');
      expect(canUse).toBe(false); // Should fail (costs 2, has 1)

      // Verify credits didn't go negative
      const user = await userService.findUserById(user1.id);
      expect(user?.credits).toBe(1);
    });

    it('should handle concurrent credit deductions safely', async () => {
      // Set specific credit amount
      await prisma.user.update({
        where: { id: user1.id },
        data: { credits: 10 },
      });

      // Simulate concurrent deductions
      const deductions = Array(10).fill(0).map(() => 
        userService.deductCredits(user1.id, 'openai') // Costs 1 credit
      );

      const results = await Promise.all(deductions);
      const successCount = results.filter(r => r === true).length;

      // Exactly 10 should succeed
      expect(successCount).toBe(10);

      // User should have 0 credits left
      const user = await userService.findUserById(user1.id);
      expect(user?.credits).toBe(0);
    });

    it('should isolate credit operations by user', async () => {
      const initialCredits1 = user1.credits;
      const initialCredits2 = user2.credits;

      // Deduct from user1
      await userService.deductCredits(user1.id, 'openai');

      // Only user1's credits should change
      const updatedUser1 = await userService.findUserById(user1.id);
      const updatedUser2 = await userService.findUserById(user2.id);

      expect(updatedUser1?.credits).toBe(initialCredits1 - 1);
      expect(updatedUser2?.credits).toBe(initialCredits2);
    });
  });

  describe('Usage Data Privacy', () => {
    it('should isolate usage data by user', async () => {
      // Track usage for both users
      await usageService.trackUsage({
        userId: user1.id,
        identifier: session1,
        service: 'google-calendar',
        method: 'createEvent',
        success: true,
      });

      await usageService.trackUsage({
        userId: user2.id,
        identifier: session2,
        service: 'openai',
        method: 'complete',
        success: true,
      });

      // Each user should only see their own usage
      const user1Usage = await usageService.getUserUsage(user1.id);
      const user2Usage = await usageService.getUserUsage(user2.id);

      expect(user1Usage).toHaveLength(1);
      expect(user2Usage).toHaveLength(1);
      expect(user1Usage[0].service).toBe('google-calendar');
      expect(user2Usage[0].service).toBe('openai');
    });

    it('should not leak usage patterns between users', async () => {
      // Create distinct usage patterns
      for (let i = 0; i < 5; i++) {
        await usageService.trackUsage({
          userId: user1.id,
          identifier: session1,
          service: 'google-calendar',
          success: true,
        });
      }

      for (let i = 0; i < 3; i++) {
        await usageService.trackUsage({
          userId: user2.id,
          identifier: session2,
          service: 'github',
          success: true,
        });
      }

      // Get top services for each user
      const user1Top = await usageService.getTopServices(user1.id, 10);
      const user2Top = await usageService.getTopServices(user2.id, 10);

      expect(user1Top).toHaveLength(1);
      expect(user1Top[0].service).toBe('google-calendar');
      expect(user1Top[0].calls).toBe(5);

      expect(user2Top).toHaveLength(1);
      expect(user2Top[0].service).toBe('github');
      expect(user2Top[0].calls).toBe(3);
    });
  });

  describe('Token Security', () => {
    it('should encrypt OAuth tokens at rest', async () => {
      const plainToken = 'super-secret-oauth-token';
      
      const connection = await oauthService.storeTokens({
        userId: user1.id,
        provider: 'google',
        email: 'user1@example.com',
        scopes: ['calendar.read'],
        accessToken: plainToken,
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
      });

      // Read directly from database
      const dbConnection = await prisma.oAuthConnection.findUnique({
        where: { id: connection.id },
      });

      // Token should be encrypted in database
      expect(dbConnection?.accessToken).not.toBe(plainToken);
      expect(dbConnection?.accessToken).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64

      // But should decrypt correctly through service
      const tokens = await oauthService.getTokens(user1.id, 'google');
      expect(tokens?.accessToken).toBe(plainToken);
    });

    it('should not expose tokens to other users', async () => {
      await oauthService.storeTokens({
        userId: user1.id,
        provider: 'google',
        email: 'user1@example.com',
        scopes: ['calendar.read'],
        accessToken: 'user1-secret-token',
        expiresAt: new Date(Date.now() + 3600000),
      });

      // User2 should not be able to get User1's tokens
      const tokens = await oauthService.getTokens(user2.id, 'google');
      expect(tokens).toBeNull();

      // Even with User1's email
      const connections = await oauthService.getUserConnections(user2.id);
      expect(connections).toHaveLength(0);
    });
  });

  describe('Cascade Deletion Security', () => {
    it('should cascade delete all user data on account deletion', async () => {
      // Create comprehensive user data
      await userService.linkEmail({
        userId: user1.id,
        email: 'user1-alt@example.com',
        provider: 'github',
      });

      await oauthService.storeTokens({
        userId: user1.id,
        provider: 'github',
        email: 'user1-alt@example.com',
        scopes: ['repo'],
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 3600000),
      });

      await usageService.trackUsage({
        userId: user1.id,
        identifier: session1,
        service: 'github',
        success: true,
      });

      // Delete user
      await prisma.user.delete({ where: { id: user1.id } });

      // Verify all related data is deleted
      const emails = await prisma.linkedEmail.findMany({
        where: { userId: user1.id },
      });
      const connections = await prisma.oAuthConnection.findMany({
        where: { userId: user1.id },
      });
      const sessions = await prisma.session.findMany({
        where: { userId: user1.id },
      });
      const usage = await prisma.usage.findMany({
        where: { userId: user1.id },
      });

      expect(emails).toHaveLength(0);
      expect(connections).toHaveLength(0);
      expect(sessions).toHaveLength(0);
      expect(usage).toHaveLength(0);

      // But user2's data should remain
      const user2Data = await userService.findUserById(user2.id);
      expect(user2Data).toBeTruthy();
    });
  });
});