import { describe, it, expect, beforeEach } from 'vitest';
import { oauthService } from '../../src/services';
import { crypto } from '../../src/crypto';
import { prisma } from '../../src';
import { testHelpers } from '../helpers';

describe('OAuthService', () => {
  describe('storeTokens', () => {
    it('should store encrypted OAuth tokens', async () => {
      const user = await testHelpers.createUser();
      
      const connection = await oauthService.storeTokens({
        userId: user.id,
        provider: 'google',
        email: 'oauth@gmail.com',
        scopes: ['calendar.read', 'calendar.write'],
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      expect(connection.provider).toBe('google');
      expect(connection.email).toBe('oauth@gmail.com');
      expect(connection.scopes).toEqual(['calendar.read', 'calendar.write']);
      
      // Tokens should be encrypted
      expect(connection.accessToken).not.toBe('access-token-123');
      expect(connection.refreshToken).not.toBe('refresh-token-456');
      
      // Verify tokens can be decrypted
      expect(crypto.decrypt(connection.accessToken)).toBe('access-token-123');
      expect(crypto.decrypt(connection.refreshToken!)).toBe('refresh-token-456');
    });

    it('should update existing connection', async () => {
      const user = await testHelpers.createUser();
      
      // Store initial tokens
      await oauthService.storeTokens({
        userId: user.id,
        provider: 'github',
        email: 'user@github.com',
        scopes: ['repo'],
        accessToken: 'old-token',
        expiresAt: new Date(Date.now() + 1000),
      });

      // Update tokens
      const updated = await oauthService.storeTokens({
        userId: user.id,
        provider: 'github',
        email: 'user@github.com',
        scopes: ['repo', 'user'],
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      expect(updated.scopes).toEqual(['repo', 'user']);
      expect(crypto.decrypt(updated.accessToken)).toBe('new-token');
      expect(crypto.decrypt(updated.refreshToken!)).toBe('new-refresh');
    });

    it('should normalize email', async () => {
      const user = await testHelpers.createUser();
      
      const connection = await oauthService.storeTokens({
        userId: user.id,
        provider: 'slack',
        email: '  User@Slack.COM  ',
        scopes: ['chat:write'],
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      expect(connection.email).toBe('user@slack.com');
    });
  });

  describe('getTokens', () => {
    it('should retrieve and decrypt tokens', async () => {
      const user = await testHelpers.createUser();
      await testHelpers.createOAuthConnection(user.id);

      const tokens = await oauthService.getTokens(user.id, 'google');
      
      expect(tokens).toBeTruthy();
      expect(tokens?.accessToken).toBe('test-access-token');
      expect(tokens?.refreshToken).toBe('test-refresh-token');
    });

    it('should return null if no connection exists', async () => {
      const user = await testHelpers.createUser();
      
      const tokens = await oauthService.getTokens(user.id, 'nonexistent');
      expect(tokens).toBeNull();
    });

    it('should update lastUsedAt', async () => {
      const user = await testHelpers.createUser();
      const connection = await testHelpers.createOAuthConnection(user.id);
      const originalLastUsed = connection.lastUsedAt;

      // Wait to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await oauthService.getTokens(user.id, 'google');

      const updated = await prisma.oAuthConnection.findUnique({
        where: { id: connection.id },
      });
      
      expect(updated?.lastUsedAt.getTime()).toBeGreaterThan(originalLastUsed.getTime());
    });

    it('should return most recently used connection', async () => {
      const user = await testHelpers.createUser();
      
      // Create multiple connections for same provider
      await oauthService.storeTokens({
        userId: user.id,
        provider: 'google',
        email: 'old@gmail.com',
        scopes: ['calendar'],
        accessToken: 'old-token',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await oauthService.storeTokens({
        userId: user.id,
        provider: 'google',
        email: 'new@gmail.com',
        scopes: ['calendar'],
        accessToken: 'new-token',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      const tokens = await oauthService.getTokens(user.id, 'google');
      expect(tokens?.accessToken).toBe('new-token');
    });
  });

  describe('updateTokens', () => {
    it('should update access token', async () => {
      const user = await testHelpers.createUser();
      const connection = await testHelpers.createOAuthConnection(user.id);

      const updated = await oauthService.updateTokens(
        connection.id,
        'refreshed-token'
      );

      expect(crypto.decrypt(updated.accessToken)).toBe('refreshed-token');
    });

    it('should update refresh token and expiry', async () => {
      const user = await testHelpers.createUser();
      const connection = await testHelpers.createOAuthConnection(user.id);
      const newExpiry = new Date(Date.now() + 7200 * 1000);

      const updated = await oauthService.updateTokens(
        connection.id,
        'new-access',
        'new-refresh',
        newExpiry
      );

      expect(crypto.decrypt(updated.accessToken)).toBe('new-access');
      expect(crypto.decrypt(updated.refreshToken!)).toBe('new-refresh');
      expect(updated.expiresAt.getTime()).toBe(newExpiry.getTime());
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired token', async () => {
      const user = await testHelpers.createUser();
      const connection = await prisma.oAuthConnection.create({
        data: {
          userId: user.id,
          provider: 'test',
          email: 'test@example.com',
          scopes: ['test'],
          accessToken: crypto.encrypt('token'),
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      });

      expect(oauthService.isTokenExpired(connection)).toBe(true);
    });

    it('should return false for valid token', async () => {
      const user = await testHelpers.createUser();
      const connection = await testHelpers.createOAuthConnection(user.id);

      expect(oauthService.isTokenExpired(connection)).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect specific email', async () => {
      const user = await testHelpers.createUser();
      await testHelpers.createOAuthConnection(user.id, 'google', 'work@gmail.com');
      await testHelpers.createOAuthConnection(user.id, 'google', 'personal@gmail.com');

      await oauthService.disconnect(user.id, 'google', 'work@gmail.com');

      const connections = await oauthService.getUserConnections(user.id);
      expect(connections).toHaveLength(1);
      expect(connections[0].email).toBe('personal@gmail.com');
    });

    it('should disconnect all connections for provider', async () => {
      const user = await testHelpers.createUser();
      await testHelpers.createOAuthConnection(user.id, 'google', 'work@gmail.com');
      await testHelpers.createOAuthConnection(user.id, 'google', 'personal@gmail.com');
      await testHelpers.createOAuthConnection(user.id, 'github', 'user@github.com');

      await oauthService.disconnect(user.id, 'google');

      const connections = await oauthService.getUserConnections(user.id);
      expect(connections).toHaveLength(1);
      expect(connections[0].provider).toBe('github');
    });
  });

  describe('getProvidersStatus', () => {
    it('should return status of all providers', async () => {
      const user = await testHelpers.createUser();
      await testHelpers.createOAuthConnection(user.id, 'google', 'user@gmail.com');
      await testHelpers.createOAuthConnection(user.id, 'github', 'user@github.com');

      const status = await oauthService.getProvidersStatus(user.id);

      const googleStatus = status.find(s => s.provider === 'google');
      expect(googleStatus?.connected).toBe(true);
      expect(googleStatus?.emails).toEqual(['user@gmail.com']);

      const slackStatus = status.find(s => s.provider === 'slack');
      expect(slackStatus?.connected).toBe(false);
      expect(slackStatus?.emails).toEqual([]);
    });

    it('should include multiple emails for same provider', async () => {
      const user = await testHelpers.createUser();
      await testHelpers.createOAuthConnection(user.id, 'google', 'work@gmail.com');
      await testHelpers.createOAuthConnection(user.id, 'google', 'personal@gmail.com');

      const status = await oauthService.getProvidersStatus(user.id);
      const googleStatus = status.find(s => s.provider === 'google');
      
      expect(googleStatus?.emails).toHaveLength(2);
      expect(googleStatus?.emails).toContain('work@gmail.com');
      expect(googleStatus?.emails).toContain('personal@gmail.com');
    });
  });
});