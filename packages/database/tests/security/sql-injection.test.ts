import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src';
import { userService, oauthService, usageService } from '../../src/services';
import { testHelpers } from '../helpers';

describe('SQL Injection Prevention', () => {
  beforeEach(async () => {
    await testHelpers.cleanDatabase();
    await testHelpers.seedServicePricing();
    testHelpers.resetTestHelpers();
  });

  describe('User Service Injection Tests', () => {
    it('should safely handle malicious email inputs', async () => {
      const maliciousEmails = [
        "admin'--",
        "admin' or '1'='1", // Prisma normalizes case
        "admin'; drop table users; --", // Prisma normalizes case
        "admin' union select * from users --", // Prisma normalizes case
        "admin\\'; drop table users; --", // Prisma normalizes case
        "admin%27%20or%20%271%27%3d%271", // Prisma normalizes case
      ];

      for (const email of maliciousEmails) {
        // Should not throw or cause SQL injection
        const user = await userService.createUser({
          email,
          provider: 'google',
        });
        expect(user.primaryEmail).toBe(email);

        // Verify the user was created normally
        const found = await userService.findUserByEmail(email);
        expect(found?.primaryEmail).toBe(email);

        // Clean up for next iteration
        await prisma.user.delete({ where: { id: user.id } });
      }

      // Verify users table still exists and has correct count
      const userCount = await prisma.user.count();
      expect(userCount).toBe(0); // All cleaned up
    });

    it('should safely handle malicious user IDs', async () => {
      const user = await userService.createUser({
        email: 'test@example.com',
        provider: 'google',
      });

      const maliciousIds = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM oauth_connections --",
        "../../../etc/passwd",
        "%00",
      ];

      for (const maliciousId of maliciousIds) {
        // Should return null, not cause injection
        const found = await userService.findUserById(maliciousId);
        expect(found).toBeNull();
      }

      // Verify the real user still exists
      const realUser = await userService.findUserById(user.id);
      expect(realUser?.id).toBe(user.id);
    });

    // Note: The malicious metadata test was removed as it was testing session metadata
    // which is not applicable to MCP tokens. MCP tokens don't store metadata.
  });

  describe('OAuth Service Injection Tests', () => {
    it('should safely handle malicious provider names', async () => {
      const user = await userService.createUser({
        email: 'oauth-test@example.com',
        provider: 'google',
      });

      const maliciousProviders = [
        "google'; DROP TABLE oauth_connections; --",
        "google' OR '1'='1",
        "google' UNION SELECT * FROM users --",
      ];

      for (const provider of maliciousProviders) {
        // Should handle safely
        await expect(
          oauthService.storeTokens({
            userId: user.id,
            provider,
            email: 'test@example.com',
            scopes: ['read'],
            accessToken: 'token',
            expiresAt: new Date(),
          })
        ).resolves.not.toThrow();

        // Verify no injection occurred
        const connections = await oauthService.getUserConnections(user.id);
        expect(connections.some(c => c.provider === provider)).toBe(true);
      }
    });

    it('should safely handle malicious scopes array', async () => {
      const user = await userService.createUser({
        email: 'scopes-test@example.com',
        provider: 'google',
      });

      const maliciousScopes = [
        "read'; DROP TABLE oauth_connections; --",
        "write' OR '1'='1",
        "admin' UNION SELECT * FROM users --",
      ];

      const connection = await oauthService.storeTokens({
        userId: user.id,
        provider: 'google',
        email: 'test@example.com',
        scopes: maliciousScopes,
        accessToken: 'token',
        expiresAt: new Date(),
      });

      // Verify scopes were stored safely
      expect(connection.scopes).toEqual(maliciousScopes);
    });
  });

  describe('Usage Service Injection Tests', () => {
    it('should safely handle malicious service names', async () => {
      const user = await userService.createUser({
        email: 'usage-test@example.com',
        provider: 'google',
      });

      const tokenId = await testHelpers.createMcpToken(user.id);

      const maliciousServices = [
        "google-calendar'; DROP TABLE usage; --",
        "openai' OR '1'='1",
        "github' UNION SELECT * FROM users --",
      ];

      for (const service of maliciousServices) {
        // First ensure the service exists in pricing
        await prisma.servicePricing.create({
          data: {
            service,
            pricePerCall: 1,
            category: 'test',
          },
        });

        // Should track safely
        const usage = await usageService.trackUsage({
          userId: user.id,
          tokenId,
          service,
          success: true,
        });

        expect(usage.service).toBe(service);
      }

      // Verify usage table still exists
      const usageCount = await prisma.usage.count();
      expect(usageCount).toBeGreaterThan(0);
    });

    it('should safely handle malicious method names', async () => {
      const user = await userService.createUser({
        email: 'method-test@example.com',
        provider: 'google',
      });

      const tokenId = await testHelpers.createMcpToken(user.id);

      const maliciousMethods = [
        "createEvent'; DELETE FROM usage; --",
        "readFile' OR '1'='1",
        "exec' UNION SELECT * FROM sessions --",
      ];

      for (const method of maliciousMethods) {
        const usage = await usageService.trackUsage({
          userId: user.id,
          tokenId,
          service: 'google-calendar',
          method,
          success: true,
        });

        expect(usage.method).toBe(method);
      }
    });
  });

  describe('Complex Injection Scenarios', () => {
    it('should handle nested injection attempts', async () => {
      const email = "test@example.com'; insert into users (id, \"primaryemail\", credits) values ('malicious', 'hacker@evil.com', 999999); --";
      
      const user = await userService.createUser({
        email,
        provider: 'google',
      });

      // Check that only one user was created
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { primaryEmail: email },
            { primaryEmail: 'hacker@evil.com' },
          ],
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].primaryEmail).toBe(email);
      expect(users[0].credits).toBe(500); // Default credits
    });

    it('should handle Unicode injection attempts', async () => {
      const unicodeInjections = [
        "admin'–", // Unicode dash
        "admin'＂", // Fullwidth quotation mark
        "admin'；drop table users；--", // Fullwidth semicolon - Prisma normalizes case
      ];

      for (const email of unicodeInjections) {
        const user = await userService.createUser({
          email,
          provider: 'google',
        });
        expect(user.primaryEmail).toBe(email);
      }

      // Verify tables still exist
      const tableChecks = await Promise.all([
        prisma.user.count(),
        prisma.session.count(),
        prisma.oAuthConnection.count(),
      ]);

      tableChecks.forEach(count => {
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle time-based injection attempts', async () => {
      const user = await userService.createUser({
        email: 'timing-test@example.com',
        provider: 'google',
      });

      // Attempt time-based SQL injection
      const timingEmail = "admin@test.com' AND SLEEP(5) --";
      
      const startTime = Date.now();
      const result = await userService.findUserByEmail(timingEmail);
      const endTime = Date.now();

      // Should not sleep, query should be fast
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
      expect(result).toBeNull();
    });
  });

  describe('Parameterized Query Verification', () => {
    it('should use parameterized queries for all operations', async () => {
      // This test verifies that Prisma is being used correctly
      // Prisma always uses parameterized queries, but we can verify
      // by checking that special characters are handled correctly

      const specialCharsEmail = "test'@\"example\\.com";
      const user = await userService.createUser({
        email: specialCharsEmail,
        provider: 'google',
      });

      // If parameterized queries are used, this should work fine
      const found = await userService.findUserByEmail(specialCharsEmail);
      expect(found?.primaryEmail).toBe(specialCharsEmail);

      // Link email with special characters
      const linkedEmail = "linked'@\"test\\.com";
      await userService.linkEmail({
        userId: user.id,
        email: linkedEmail,
        provider: 'github',
      });

      const emails = await userService.getLinkedEmails(user.id);
      expect(emails.some(e => e.email === linkedEmail)).toBe(true);
    });
  });
});