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
      const createdUser = await testHelpers.createUser('find@example.com');
      
      const foundUser = await userService.findUserByEmail('find@example.com');
      expect(foundUser?.id).toBe(createdUser.id);
    });

    it('should return null for non-existent email', async () => {
      const user = await userService.findUserByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });

    it('should normalize email when searching', async () => {
      await testHelpers.createUser('search@example.com');
      
      const user = await userService.findUserByEmail('  Search@Example.COM  ');
      expect(user).toBeTruthy();
      expect(user?.primaryEmail).toBe('search@example.com');
    });
  });

  describe('linkEmail', () => {
    it('should link new email to user', async () => {
      const user = await testHelpers.createUser('primary@example.com');
      
      const linkedEmail = await userService.linkEmail({
        userId: user.id,
        email: 'secondary@company.com',
        provider: 'github',
      });

      expect(linkedEmail.email).toBe('secondary@company.com');
      expect(linkedEmail.provider).toBe('github');
      expect(linkedEmail.isPrimary).toBe(false);
    });

    it('should throw error if email belongs to another user', async () => {
      const user1 = await testHelpers.createUser('user1@example.com');
      const user2 = await testHelpers.createUser('user2@example.com');

      await expect(
        userService.linkEmail({
          userId: user2.id,
          email: 'user1@example.com',
          provider: 'google',
        })
      ).rejects.toThrow('already linked to another account');
    });

    it('should return existing linked email if already linked', async () => {
      const user = await testHelpers.createUser('user@example.com');
      
      const linked1 = await userService.linkEmail({
        userId: user.id,
        email: 'work@company.com',
        provider: 'slack',
      });

      const linked2 = await userService.linkEmail({
        userId: user.id,
        email: 'work@company.com',
        provider: 'slack',
      });

      expect(linked2.id).toBe(linked1.id);
    });
  });

  describe('updatePrimaryEmail', () => {
    it('should update primary email', async () => {
      const user = await testHelpers.createUser('old@example.com');
      await userService.linkEmail({
        userId: user.id,
        email: 'new@example.com',
        provider: 'github',
      });

      const updatedUser = await userService.updatePrimaryEmail(user.id, 'new@example.com');
      expect(updatedUser.primaryEmail).toBe('new@example.com');

      // Check that email flags are updated
      const oldEmail = await prisma.linkedEmail.findUnique({
        where: { email: 'old@example.com' },
      });
      const newEmail = await prisma.linkedEmail.findUnique({
        where: { email: 'new@example.com' },
      });

      expect(oldEmail?.isPrimary).toBe(false);
      expect(newEmail?.isPrimary).toBe(true);
    });

    it('should throw error if email not linked to user', async () => {
      const user = await testHelpers.createUser('user@example.com');

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
      const user = await testHelpers.createUser('user@example.com', 100);
      await testHelpers.createServicePricing('test-service', 10);

      const success = await userService.deductCredits(user.id, 'test-service');
      expect(success).toBe(true);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.credits).toBe(90);
    });

    it('should return false for insufficient credits', async () => {
      const user = await testHelpers.createUser('poor@example.com', 5);
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
      await prisma.servicePricing.create({
        data: {
          service: 'inactive-service',
          pricePerCall: 10,
          category: 'test',
          active: false,
        },
      });

      await expect(
        userService.deductCredits(user.id, 'inactive-service')
      ).rejects.toThrow('Service inactive-service is not available');
    });
  });

  describe('addCredits', () => {
    it('should add credits to user account', async () => {
      const user = await testHelpers.createUser('user@example.com', 100);

      const updatedUser = await userService.addCredits(user.id, 50);
      expect(updatedUser.credits).toBe(150);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should delete expired sessions', async () => {
      const user = await testHelpers.createUser();
      
      // Create active session
      const activeSessionId = await testHelpers.createSession(user.id);
      
      // Create expired sessions
      for (let i = 0; i < 3; i++) {
        await prisma.session.create({
          data: {
            sessionId: `expired-${i}`,
            userId: user.id,
            expiresAt: new Date(Date.now() - 1000),
          },
        });
      }

      const deletedCount = await userService.cleanupExpiredSessions();
      expect(deletedCount).toBe(3);

      // Active session should still exist
      const activeSession = await prisma.session.findUnique({
        where: { sessionId: activeSessionId },
      });
      expect(activeSession).toBeTruthy();
    });
  });
});