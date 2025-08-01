// Set required environment variables before imports
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test-cookie-secret-minimum-32-characters-long';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-minimum-32-characters-long';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key-minimum-32-characters-long';
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { build } from '../setup';
import { prisma } from '@relayforge/database';
import type { FastifyInstance } from 'fastify';

describe('Session Management Integration', () => {
  let app: FastifyInstance;
  let testUserId: string;

  beforeAll(async () => {
    app = await build();
  });

  beforeEach(async () => {
    // Clean up before each test
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
    
    // Create a fresh test user for each test
    const user = await prisma.user.create({
      data: {
        primaryEmail: 'session-integration@example.com',
        credits: 500,
      },
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Session CRUD Operations', () => {
    it.skip('should create a new session (disabled until JWT auth)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: {
          'x-user-id': testUserId,
        },
        payload: {
          metadata: {
            userAgent: 'test-agent',
            origin: 'test-origin',
          },
        },
      });

      if (response.statusCode !== 201) {
        console.log('Session creation failed:', response.body);
      }

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('sessionId');
      expect(body.data).toHaveProperty('sessionUrl');
      expect(body.data).toHaveProperty('expiresAt');
      expect(body.data.sessionUrl).toContain('/mcp/');
    });

    it.skip('should list user sessions (disabled until JWT auth)', async () => {
      // First create a session
      const createResp = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { 'x-user-id': testUserId },
        payload: {},
      });
      const { sessionId } = JSON.parse(createResp.body).data;

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions',
        headers: {
          'x-user-id': testUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0]).toHaveProperty('sessionId');
      expect(body.data.some((s: any) => s.sessionId === sessionId)).toBe(true);
    });

    it.skip('should get session statistics (disabled until JWT auth)', async () => {
      // First create a session
      await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { 'x-user-id': testUserId },
        payload: {},
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/stats',
        headers: {
          'x-user-id': testUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('totalSessions');
      expect(body.data).toHaveProperty('activeSessions');
      expect(body.data).toHaveProperty('expiredSessions');
      expect(body.data).toHaveProperty('lastActivity');
      expect(body.data.activeSessions).toBeGreaterThan(0);
    });

    it('should validate a session', async () => {
      // Create a session directly in the database since API is disabled
      const session = await prisma.session.create({
        data: {
          sessionId: 'test-session-123',
          userId: testUserId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/sessions/${session.sessionId}/validate`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('userId');
      expect(body.data).toHaveProperty('user');
      expect(body.data.userId).toBe(testUserId);
    });

    it.skip('should refresh/extend a session (disabled until JWT auth)', async () => {
      // First create a session
      const createResp = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { 'x-user-id': testUserId },
        payload: {},
      });
      const { sessionId } = JSON.parse(createResp.body).data;

      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/refresh`,
        headers: {
          'x-user-id': testUserId,
        },
        payload: {
          expiresIn: 60, // 60 days
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('sessionId');
      expect(body.data.sessionId).toBe(sessionId);
      
      // Verify expiry was extended
      const session = await prisma.session.findUnique({
        where: { sessionId },
      });
      const expectedExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      expect(session?.expiresAt.getTime()).toBeCloseTo(expectedExpiry.getTime(), -4);
    });

    it('should return 404 for invalid session validation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sessions/invalid-session-id/validate',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Session not found or expired');
    });

    it.skip('should revoke a session (disabled until JWT auth)', async () => {
      // First create a session
      const createResp = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { 'x-user-id': testUserId },
        payload: {},
      });
      const { sessionId } = JSON.parse(createResp.body).data;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sessions/${sessionId}`,
        headers: {
          'x-user-id': testUserId,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Session revoked successfully');

      // Verify session was deleted
      const session = await prisma.session.findUnique({
        where: { sessionId },
      });
      expect(session).toBeNull();
    });
  });

  describe('Session Security', () => {
    it('should return 503 for all authenticated endpoints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {},
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
      expect(body.message).toContain('JWT authentication is coming soon');
    });

    it.skip('should prevent users from revoking other users sessions (disabled until JWT auth)', async () => {
      // Create another user
      const otherUser = await prisma.user.create({
        data: {
          primaryEmail: 'other-user@example.com',
          credits: 500,
        },
      });

      // Create a session for the other user
      const otherSession = await prisma.session.create({
        data: {
          sessionId: 'other-user-session',
          userId: otherUser.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Try to revoke other user's session
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sessions/${otherSession.sessionId}`,
        headers: {
          'x-user-id': testUserId,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized to revoke this session');

      // Cleanup
      await prisma.session.delete({ where: { id: otherSession.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup expired sessions', async () => {
      // Create expired sessions
      await prisma.session.createMany({
        data: [
          {
            sessionId: 'expired-1',
            userId: testUserId,
            expiresAt: new Date(Date.now() - 1000),
          },
          {
            sessionId: 'expired-2',
            userId: testUserId,
            expiresAt: new Date(Date.now() - 2000),
          },
        ],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions/cleanup',
        headers: {
          'x-admin-key': process.env.ADMIN_KEY || 'test-admin-key-minimum-32-characters-long',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.count).toBeGreaterThanOrEqual(2);

      // Verify expired sessions were deleted
      const remainingExpired = await prisma.session.count({
        where: {
          sessionId: { in: ['expired-1', 'expired-2'] },
        },
      });
      expect(remainingExpired).toBe(0);
    });
  });
});