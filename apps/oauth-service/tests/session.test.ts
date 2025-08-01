// Set required environment variables before imports
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test-cookie-secret-minimum-32-characters-long';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-minimum-32-characters-long';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@relayforge/database';
import { SessionService } from '../src/services/session.service';
import { AppError } from '../src/utils/errors';

describe('SessionService', () => {
  let sessionService: SessionService;
  let testUserId: string;

  beforeEach(async () => {
    sessionService = new SessionService();
    
    // Create a test user
    const user = await prisma.user.create({
      data: {
        primaryEmail: 'session-test@example.com',
        credits: 500,
      },
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: { primaryEmail: 'session-test@example.com' },
    });
  });

  describe('createSession', () => {
    it('should create a new session with default expiry', async () => {
      const result = await sessionService.createSession({
        userId: testUserId,
        metadata: {
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
        },
      });

      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('sessionUrl');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('createdAt');
      expect(result.sessionUrl).toContain('/mcp/');
      expect(result.sessionId).toHaveLength(36);

      // Verify session was created in database
      const session = await prisma.session.findUnique({
        where: { sessionId: result.sessionId },
      });
      expect(session).toBeTruthy();
      expect(session?.userId).toBe(testUserId);
    });

    it('should create a session with custom expiry', async () => {
      const expiresIn = 7; // 7 days
      const result = await sessionService.createSession({
        userId: testUserId,
        expiresIn,
      });

      const expectedExpiry = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);
      expect(result.expiresAt.getTime()).toBeCloseTo(expectedExpiry.getTime(), -3); // Within seconds
    });

    it('should throw error for non-existent user', async () => {
      await expect(
        sessionService.createSession({
          userId: 'non-existent-id',
        })
      ).rejects.toThrow('User not found');
    });
  });

  describe('getUserSessions', () => {
    it('should return all active sessions for a user', async () => {
      // Create multiple sessions
      await sessionService.createSession({ userId: testUserId });
      await sessionService.createSession({ userId: testUserId });
      
      // Create an expired session
      const expiredSession = await prisma.session.create({
        data: {
          sessionId: 'expired-session',
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      });

      const sessions = await sessionService.getUserSessions(testUserId);

      expect(sessions).toHaveLength(2); // Only active sessions
      sessions.forEach(session => {
        expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });
    });

    it('should return sessions ordered by last accessed', async () => {
      const session1 = await sessionService.createSession({ userId: testUserId });
      
      // Wait a bit and create another session
      await new Promise(resolve => setTimeout(resolve, 100));
      const session2 = await sessionService.createSession({ userId: testUserId });

      const sessions = await sessionService.getUserSessions(testUserId);

      expect(sessions[0].sessionId).toBe(session2.sessionId);
      expect(sessions[1].sessionId).toBe(session1.sessionId);
    });
  });

  describe('validateSession', () => {
    it('should validate an active session', async () => {
      const { sessionId } = await sessionService.createSession({ userId: testUserId });

      const result = await sessionService.validateSession(sessionId);

      expect(result).toBeTruthy();
      expect(result?.userId).toBe(testUserId);
      expect(result?.user.primaryEmail).toBe('session-test@example.com');
    });

    it('should return null for non-existent session', async () => {
      const result = await sessionService.validateSession('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      const expiredSession = await prisma.session.create({
        data: {
          sessionId: 'expired-session',
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const result = await sessionService.validateSession(expiredSession.sessionId);
      expect(result).toBeNull();
    });

    it('should update last accessed time on validation', async () => {
      const { sessionId } = await sessionService.createSession({ userId: testUserId });
      
      const initialSession = await prisma.session.findUnique({
        where: { sessionId },
      });
      const initialLastAccessed = initialSession?.lastAccessedAt;

      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await sessionService.validateSession(sessionId);

      const updatedSession = await prisma.session.findUnique({
        where: { sessionId },
      });

      expect(updatedSession?.lastAccessedAt.getTime()).toBeGreaterThan(
        initialLastAccessed!.getTime()
      );
    });
  });

  describe('revokeSession', () => {
    it('should revoke a session', async () => {
      const { sessionId } = await sessionService.createSession({ userId: testUserId });

      await sessionService.revokeSession(testUserId, sessionId);

      const session = await prisma.session.findUnique({
        where: { sessionId },
      });
      expect(session).toBeNull();
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        sessionService.revokeSession(testUserId, 'non-existent')
      ).rejects.toThrow('Session not found');
    });

    it('should throw error when user tries to revoke another user\'s session', async () => {
      const { sessionId } = await sessionService.createSession({ userId: testUserId });
      
      await expect(
        sessionService.revokeSession('different-user-id', sessionId)
      ).rejects.toThrow('Unauthorized to revoke this session');
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for a user', async () => {
      // Create multiple sessions
      await sessionService.createSession({ userId: testUserId });
      await sessionService.createSession({ userId: testUserId });
      await sessionService.createSession({ userId: testUserId });

      const count = await sessionService.revokeAllSessions(testUserId);

      expect(count).toBe(3);

      const remainingSessions = await prisma.session.count({
        where: { userId: testUserId },
      });
      expect(remainingSessions).toBe(0);
    });
  });

  describe('refreshSession', () => {
    it('should extend session expiry', async () => {
      const { sessionId, expiresAt } = await sessionService.createSession({ 
        userId: testUserId,
        expiresIn: 1, // 1 day
      });

      const refreshed = await sessionService.refreshSession(testUserId, sessionId, 7);

      expect(refreshed.sessionId).toBe(sessionId);
      expect(refreshed.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());
      
      // Should be approximately 7 days from now
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(refreshed.expiresAt.getTime()).toBeCloseTo(expectedExpiry.getTime(), -3);
    });

    it('should throw error for expired session', async () => {
      const expiredSession = await prisma.session.create({
        data: {
          sessionId: 'expired-session',
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await expect(
        sessionService.refreshSession(testUserId, expiredSession.sessionId)
      ).rejects.toThrow('Session has expired');
    });
  });

  describe('getSessionStats', () => {
    it('should return correct session statistics', async () => {
      // Create active sessions
      await sessionService.createSession({ userId: testUserId });
      await sessionService.createSession({ userId: testUserId });
      
      // Create expired session
      await prisma.session.create({
        data: {
          sessionId: 'expired-session',
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const stats = await sessionService.getSessionStats(testUserId);

      expect(stats.totalSessions).toBe(3);
      expect(stats.activeSessions).toBe(2);
      expect(stats.expiredSessions).toBe(1);
      expect(stats.lastActivity).toBeTruthy();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove all expired sessions', async () => {
      // Create expired sessions
      await prisma.session.create({
        data: {
          sessionId: 'expired-1',
          userId: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      await prisma.session.create({
        data: {
          sessionId: 'expired-2',
          userId: testUserId,
          expiresAt: new Date(Date.now() - 2000),
        },
      });

      // Create active session
      await sessionService.createSession({ userId: testUserId });

      const cleanedCount = await sessionService.cleanupExpiredSessions();

      expect(cleanedCount).toBe(2);

      const remainingSessions = await prisma.session.count({
        where: { userId: testUserId },
      });
      expect(remainingSessions).toBe(1);
    });
  });
});