import { describe, it, expect, beforeEach } from 'vitest';
import { userService } from '../../src/services';
import { prisma } from '../../src';
import { crypto } from '../../src/crypto';
import { testHelpers } from '../helpers';

describe('UserService', () => {
  beforeEach(async () => {
    // Tests setup.ts handles database cleanup
  });

  describe('createUser', () => {
    it('should create a new user with linked email', async () => {
      const user = await userService.createUser({
        email: 'alice@example.com',
        provider: 'google',
        initialCredits: 1000,
      });

      expect(user.primaryEmail).toBe('alice@example.com');
      expect(user.credits).toBe(1000);

      const linkedEmail = await prisma.linkedEmail.findUnique({
        where: { email: 'alice@example.com' },
      });
      expect(linkedEmail).toBeTruthy();
      expect(linkedEmail?.isPrimary).toBe(true);
      expect(linkedEmail?.provider).toBe('google');
    });

    it('should return existing user if email already exists', async () => {
      const user1 = await userService.createUser({
        email: 'existing@example.com',
        provider: 'github',
      });

      const user2 = await userService.createUser({
        email: 'existing@example.com',
        provider: 'google',
      });

      expect(user2.id).toBe(user1.id);
    });

    it('should normalize email', async () => {
      const user = await userService.createUser({
        email: '  Alice@Example.COM  ',
        provider: 'google',
      });

      expect(user.primaryEmail).toBe('alice@example.com');
    });

    it('should use default credits if not specified', async () => {
      const user = await userService.createUser({
        email: 'default@example.com',
        provider: 'google',
      });

      expect(user.credits).toBe(500);
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by linked email', async () => {
      const createdUser = await testHelpers.createUser();
      
      const foundUser = await userService.findUserByEmail(createdUser.primaryEmail);
      expect(foundUser?.id).toBe(createdUser.id);
    });

    it('should return null for non-existent email', async () => {
      const user = await userService.findUserByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });

    it('should normalize email when searching', async () => {
      const testUser = await testHelpers.createUser();
      
      const user = await userService.findUserByEmail(`  ${testUser.primaryEmail.toUpperCase()}  `);
      expect(user).toBeTruthy();
      expect(user?.primaryEmail).toBe(testUser.primaryEmail);
    });
  });

  describe('linkEmail', () => {
    it('should link new email to user', async () => {
      const user = await testHelpers.createUser();
      
      const uniqueEmail = `secondary-${Date.now()}@company.com`;
      const linkedEmail = await userService.linkEmail({
        userId: user.id,
        email: uniqueEmail,
        provider: 'github',
      });

      expect(linkedEmail.email).toBe(uniqueEmail);
      expect(linkedEmail.provider).toBe('github');
      expect(linkedEmail.isPrimary).toBe(false);
    });

    it('should throw error if email belongs to another user', async () => {
      const user1 = await testHelpers.createUser();
      const user2 = await testHelpers.createUser();

      await expect(
        userService.linkEmail({
          userId: user2.id,
          email: user1.primaryEmail, // Use the actual email from user1
          provider: 'google',
        })
      ).rejects.toThrow('already linked to another account');
    });

    it('should return existing linked email if already linked', async () => {
      const user = await testHelpers.createUser();
      
      const uniqueWorkEmail = `work-${Date.now()}@company.com`;
      const linked1 = await userService.linkEmail({
        userId: user.id,
        email: uniqueWorkEmail,
        provider: 'slack',
      });

      const linked2 = await userService.linkEmail({
        userId: user.id,
        email: uniqueWorkEmail,
        provider: 'slack',
      });

      expect(linked2.id).toBe(linked1.id);
    });
  });

  describe('updatePrimaryEmail', () => {
    it('should update primary email', async () => {
      const user = await testHelpers.createUser();
      const newEmail = `new-${Date.now()}@example.com`;
      await userService.linkEmail({
        userId: user.id,
        email: newEmail,
        provider: 'github',
      });

      const updatedUser = await userService.updatePrimaryEmail(user.id, newEmail);
      expect(updatedUser.primaryEmail).toBe(newEmail);

      // Check that email flags are updated
      const oldEmail = await prisma.linkedEmail.findUnique({
        where: { email: user.primaryEmail },
      });
      const newEmailRecord = await prisma.linkedEmail.findUnique({
        where: { email: newEmail },
      });

      expect(oldEmail?.isPrimary).toBe(false);
      expect(newEmailRecord?.isPrimary).toBe(true);
    });

    it('should throw error if email not linked to user', async () => {
      const user = await testHelpers.createUser();

      await expect(
        userService.updatePrimaryEmail(user.id, 'notlinked@example.com')
      ).rejects.toThrow('Email must be linked to the user');
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const user = await testHelpers.createUser();
      
      const sessionId = await userService.createSession({
        userId: user.id,
        metadata: {
          userAgent: 'Test/1.0',
          ipAddress: '127.0.0.1',
        },
      });

      expect(sessionId).toMatch(/^[A-Za-z0-9_-]{36}$/);

      const session = await prisma.session.findUnique({
        where: { sessionId },
      });
      expect(session).toBeTruthy();
      expect(session?.userId).toBe(user.id);
      expect(session?.metadata).toEqual({
        userAgent: 'Test/1.0',
        ipAddress: '127.0.0.1',
      });
    });
  });

  describe('getUserBySessionId', () => {
    it('should get user by valid session', async () => {
      const user = await testHelpers.createUser();
      const sessionId = await testHelpers.createSession(user.id);

      const foundUser = await userService.getUserBySessionId(sessionId);
      expect(foundUser?.id).toBe(user.id);
    });

    it('should return null for non-existent session', async () => {
      const user = await userService.getUserBySessionId('nonexistent');
      expect(user).toBeNull();
    });

    it('should return null for expired session', async () => {
      const user = await testHelpers.createUser();
      const sessionId = crypto.generateSessionId();
      
      await prisma.session.create({
        data: {
          sessionId,
          userId: user.id,
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      });

      const foundUser = await userService.getUserBySessionId(sessionId);
      expect(foundUser).toBeNull();
    });

    it('should update lastAccessedAt', async () => {
      const user = await testHelpers.createUser();
      const sessionId = await testHelpers.createSession(user.id);

      const session1 = await prisma.session.findUnique({
        where: { sessionId },
      });
      const lastAccessed1 = session1?.lastAccessedAt;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await userService.getUserBySessionId(sessionId);

      const session2 = await prisma.session.findUnique({
        where: { sessionId },
      });
      const lastAccessed2 = session2?.lastAccessedAt;

      expect(lastAccessed2?.getTime()).toBeGreaterThan(lastAccessed1?.getTime() || 0);
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits for valid service', async () => {
      const user = await testHelpers.createUser(undefined, 100);
      await testHelpers.createServicePricing('test-service', 10);

      const success = await userService.deductCredits(user.id, 'test-service');
      expect(success).toBe(true);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.credits).toBe(90);
    });

    it('should return false for insufficient credits', async () => {
      const user = await testHelpers.createUser(undefined, 5);
      await testHelpers.createServicePricing('expensive-service', 10);

      const success = await userService.deductCredits(user.id, 'expensive-service');
      expect(success).toBe(false);

      // Credits should not change
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.credits).toBe(5);
    });

    it('should throw error for non-existent service', async () => {
      const user = await testHelpers.createUser();

      await expect(
        userService.deductCredits(user.id, 'nonexistent-service')
      ).rejects.toThrow('Service nonexistent-service is not available');
    });

    it('should throw error for inactive service', async () => {
      const user = await testHelpers.createUser();
      const serviceName = `inactive-service-${Date.now()}`;
      await prisma.servicePricing.create({
        data: {
          service: serviceName,
          pricePerCall: 10,
          category: 'test',
          active: false,
        },
      });

      await expect(
        userService.deductCredits(user.id, serviceName)
      ).rejects.toThrow(`Service ${serviceName} is not available`);
    });
  });

  describe('addCredits', () => {
    it('should add credits to user account', async () => {
      const user = await testHelpers.createUser(undefined, 100);

      const updatedUser = await userService.addCredits(user.id, 50);
      expect(updatedUser.credits).toBe(150);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should delete expired sessions', async () => {
      const user = await testHelpers.createUser();
      
      // Create active session
      const activeSessionId = await testHelpers.createSession(user.id);
      
      // Count existing expired sessions before test
      const initialExpiredCount = await prisma.session.count({
        where: { expiresAt: { lt: new Date() } }
      });

      // Create expired sessions
      for (let i = 0; i < 3; i++) {
        await prisma.session.create({
          data: {
            sessionId: `expired-${Date.now()}-${i}`,
            userId: user.id,
            expiresAt: new Date(Date.now() - 1000),
          },
        });
      }

      const deletedCount = await userService.cleanupExpiredSessions();
      expect(deletedCount).toBe(initialExpiredCount + 3);

      // Active session should still exist
      const activeSession = await prisma.session.findUnique({
        where: { sessionId: activeSessionId },
      });
      expect(activeSession).toBeTruthy();
    });
  });
});