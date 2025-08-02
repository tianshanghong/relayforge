import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@relayforge/database';
import { SecureAccountLinking } from '../src/utils/secure-account-linking';

describe('Secure Account Linking', () => {
  beforeEach(async () => {
    // Clear database
    await prisma.oAuthConnection.deleteMany();
    await prisma.session.deleteMany();
    await prisma.linkedEmail.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    // Clean up after tests
    await prisma.oAuthConnection.deleteMany();
    await prisma.session.deleteMany();
    await prisma.linkedEmail.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Exact Email Matching Only', () => {
    it('should add provider to existing account with same email', async () => {
      // Create existing user
      const existingUser = await prisma.user.create({
      data: {
        primaryEmail: 'alice@gmail.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 500,
          linkedEmails: {
            create: {
              email: 'alice@gmail.com',
              provider: 'google',
              isPrimary: true,
            },
          },
        },
      });

      await prisma.$transaction(async (tx) => {
        const decision = await SecureAccountLinking.checkExistingAccount(
          'alice@gmail.com',
          'github',
          tx
        );

        expect(decision.action).toBe('add_to_existing');
        expect(decision.existingUserId).toBe(existingUser.id);
      });
    });

    it('should create pending session for new email', async () => {
      // Create existing user with different email
      await prisma.user.create({
      data: {
        primaryEmail: 'alice@gmail.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 500,
          linkedEmails: {
            create: {
              email: 'alice@gmail.com',
              provider: 'google',
              isPrimary: true,
            },
          },
        },
      });

      await prisma.$transaction(async (tx) => {
        const decision = await SecureAccountLinking.checkExistingAccount(
          'alice@company.com', // Different email
          'github',
          tx
        );

        expect(decision.action).toBe('pending_user_choice');
        expect(decision.existingUserId).toBeUndefined();
      });
    });

    it('should NOT suggest similar emails', async () => {
      // Create users with similar emails
      await prisma.user.create({
      data: {
        primaryEmail: 'john@gmail.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 500,
          linkedEmails: {
            create: {
              email: 'john@gmail.com',
              provider: 'google',
              isPrimary: true,
            },
          },
        },
      });

      await prisma.user.create({
      data: {
        primaryEmail: 'johnson@gmail.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 500,
          linkedEmails: {
            create: {
              email: 'johnson@gmail.com',
              provider: 'google',
              isPrimary: true,
            },
          },
        },
      });

      await prisma.$transaction(async (tx) => {
        // Should NOT match similar email
        const decision1 = await SecureAccountLinking.checkExistingAccount(
          'john.smith@gmail.com',
          'github',
          tx
        );
        expect(decision1.action).toBe('pending_user_choice');

        // Should NOT match partially similar email
        const decision2 = await SecureAccountLinking.checkExistingAccount(
          'johnny@gmail.com',
          'github',
          tx
        );
        expect(decision2.action).toBe('pending_user_choice');
      });
    });

    it('should throw error if provider already connected', async () => {
      // Create user with Google OAuth
      const user = await prisma.user.create({
      data: {
        primaryEmail: 'alice@gmail.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 500,
          linkedEmails: {
            create: {
              email: 'alice@gmail.com',
              provider: 'google',
              isPrimary: true,
            },
          },
        },
      });

      const { crypto } = await import('@relayforge/database');
      await prisma.oAuthConnection.create({
        data: {
          userId: user.id,
          provider: 'google',
          email: 'alice@gmail.com',
          scopes: ['email', 'profile'],
          accessToken: await crypto.encrypt('token'),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      await prisma.$transaction(async (tx) => {
        await expect(
          SecureAccountLinking.checkExistingAccount(
            'alice@gmail.com',
            'google', // Same provider
            tx
          )
        ).rejects.toThrow('This provider is already connected to your account');
      });
    });
  });

  describe('Verified Account Merging', () => {
    it('should merge accounts after user authenticates both', async () => {
      // Create two accounts that user owns
      const account1 = await prisma.user.create({
      data: {
        primaryEmail: 'alice@gmail.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 300,
          linkedEmails: {
            create: {
              email: 'alice@gmail.com',
              provider: 'google',
              isPrimary: true,
            },
          },
        },
      });

      const account2 = await prisma.user.create({
      data: {
        primaryEmail: 'alice@company.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 200,
          linkedEmails: {
            create: {
              email: 'alice@company.com',
              provider: 'github',
              isPrimary: true,
            },
          },
        },
      });

      // Add OAuth connections
      const { crypto } = await import('@relayforge/database');
      await prisma.oAuthConnection.create({
        data: {
          userId: account2.id,
          provider: 'github',
          email: 'alice@company.com',
          scopes: ['repo', 'user'],
          accessToken: await crypto.encrypt('github-token'),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      // User has now authenticated with both accounts
      // Safe to merge
      await prisma.$transaction(async (tx) => {
        await SecureAccountLinking.mergeVerifiedAccounts(
          account1.id, // Keep this one
          account2.id, // Merge this one
          tx
        );
      });

      // Verify merge results
      const mergedAccount = await prisma.user.findUnique({
        where: { id: account1.id },
        include: {
          linkedEmails: true,
          oauthConnections: true,
        },
      });

      const deletedAccount = await prisma.user.findUnique({
        where: { id: account2.id },
      });

      expect(mergedAccount).toBeTruthy();
      expect(mergedAccount!.credits).toBe(500); // 300 + 200
      expect(mergedAccount!.linkedEmails).toHaveLength(2);
      expect(mergedAccount!.oauthConnections).toHaveLength(1);
      expect(deletedAccount).toBeNull();
    });

    it.skip('should handle duplicate emails during merge', async () => {
      // Scenario: User accidentally created two accounts with same provider
      const account1 = await prisma.user.create({
      data: {
        primaryEmail: 'merge-test1@gmail.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 300,
          linkedEmails: {
            create: [
              {
                email: 'merge-test1@gmail.com',
                provider: 'google',
                isPrimary: true,
              },
              {
                email: 'shared@personal.com',
                provider: 'manual',
                isPrimary: false,
              },
            ],
          },
        },
      });

      const account2 = await prisma.user.create({
      data: {
        primaryEmail: 'merge-test2@work.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 200,
          linkedEmails: {
            create: [
              {
                email: 'merge-test2@work.com',
                provider: 'github',
                isPrimary: true,
              },
              {
                email: 'shared@personal.com', // Duplicate!
                provider: 'manual',
                isPrimary: false,
              },
            ],
          },
        },
      });

      await prisma.$transaction(async (tx) => {
        await SecureAccountLinking.mergeVerifiedAccounts(
          account1.id,
          account2.id,
          tx
        );
      });

      const merged = await prisma.user.findUnique({
        where: { id: account1.id },
        include: { linkedEmails: true },
      });

      // Should have 3 unique emails, not 4
      expect(merged!.linkedEmails).toHaveLength(3);
      const emails = merged!.linkedEmails.map(e => e.email).sort();
      expect(emails).toEqual([
        'merge-test1@gmail.com',
        'merge-test2@work.com',
        'shared@personal.com',
      ]);
    });
  });

  describe('Pending Session Creation', () => {
    it('should create secure temporary session', async () => {
      const sessionId = await SecureAccountLinking.createPendingSession(
        'alice@company.com',
        'github',
        {
          accessToken: 'github-access-token',
          refreshToken: 'github-refresh-token',
          expiresAt: new Date(Date.now() + 3600000),
          scopes: ['repo', 'user'],
        }
      );

      expect(sessionId).toBeTruthy();
      expect(sessionId.length).toBeGreaterThan(40); // base64url of 32 bytes
      // Session should be stored in Redis/temp table
      // Would need to implement getPendingSession to verify
    });

    it('should generate unique session IDs', async () => {
      const sessions = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          SecureAccountLinking.createPendingSession(
            `user${i}@example.com`,
            'github',
            {
              accessToken: `token-${i}`,
              expiresAt: new Date(Date.now() + 3600000),
              scopes: ['repo'],
            }
          )
        )
      );

      const uniqueSessions = new Set(sessions);
      expect(uniqueSessions.size).toBe(10);
    });
  });

  describe('Privacy Protection', () => {
    it('should not reveal account existence to unauthenticated users', async () => {
      // Create existing user
      await prisma.user.create({
      data: {
        primaryEmail: 'secret@company.com',
        slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        credits: 500,
          linkedEmails: {
            create: {
              email: 'secret@company.com',
              provider: 'google',
              isPrimary: true,
            },
          },
        },
      });

      // Attacker tries similar emails
      await prisma.$transaction(async (tx) => {
        // Should not reveal that secret@company.com exists
        const decision1 = await SecureAccountLinking.checkExistingAccount(
          'secret@companyy.com', // Typo
          'github',
          tx
        );
        expect(decision1.action).toBe('pending_user_choice');

        const decision2 = await SecureAccountLinking.checkExistingAccount(
          'secrets@company.com', // Close match
          'github',
          tx
        );
        expect(decision2.action).toBe('pending_user_choice');

        // Only exact match works (when user authenticates)
        const decision3 = await SecureAccountLinking.checkExistingAccount(
          'secret@company.com',
          'github',
          tx
        );
        expect(decision3.action).toBe('add_to_existing');
      });
    });
  });
});