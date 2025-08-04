import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { tokensRoutes } from '../src/routes/tokens.routes';
import { authenticateUser } from '../src/middleware/auth';
import { McpTokenService, UserService, prisma } from '@relayforge/database';

// Create mock functions
const mockGetUserTokens = vi.fn();
const mockCreateToken = vi.fn();
const mockRevokeToken = vi.fn();

// Mock the database services
vi.mock('@relayforge/database', () => ({
  McpTokenService: vi.fn().mockImplementation(() => ({
    getUserTokens: mockGetUserTokens,
    createToken: mockCreateToken,
    revokeToken: mockRevokeToken,
  })),
  UserService: vi.fn(),
  prisma: {},
}));

// Mock the auth middleware
vi.mock('../src/middleware/auth', () => ({
  authenticateUser: vi.fn((request, reply, done) => {
    // Simulate authentication
    if (request.headers.authorization === 'Bearer valid-session') {
      request.userId = 'test-user-id';
      done();
    } else {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  }),
}));

describe('Token Routes', () => {
  let fastify: any;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(cookie);
    await fastify.register(tokensRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    vi.clearAllMocks();
  });

  describe('GET /api/tokens', () => {
    it('should list user tokens with valid session', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          userId: 'test-user-id',
          name: 'Claude Desktop',
          prefix: 'mcp_live_abcd1234',
          tokenHash: 'hash1',
          createdAt: new Date('2025-01-01'),
          lastUsedAt: new Date('2025-01-02'),
          revokedAt: null,
        },
        {
          id: 'token-2',
          userId: 'test-user-id',
          name: 'Cursor',
          prefix: 'mcp_live_efgh5678',
          tokenHash: 'hash2',
          createdAt: new Date('2025-01-03'),
          lastUsedAt: new Date('2025-01-04'),
          revokedAt: null,
        },
      ];

      mockGetUserTokens.mockResolvedValue(mockTokens);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.tokens).toHaveLength(2);
      expect(body.tokens[0]).toEqual({
        id: 'token-1',
        name: 'Claude Desktop',
        prefix: 'mcp_live_abcd1234',
        createdAt: '2025-01-01T00:00:00.000Z',
        lastUsedAt: '2025-01-02T00:00:00.000Z',
      });
      // Should not expose tokenHash
      expect(body.tokens[0].tokenHash).toBeUndefined();
    });

    it('should return 401 without authentication', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tokens',
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe('Unauthorized');
    });

    it('should handle errors gracefully', async () => {
      mockGetUserTokens.mockRejectedValue(new Error('Database error'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to retrieve tokens');
    });
  });

  describe('POST /api/tokens', () => {
    it('should create a new token with valid name', async () => {
      const mockNewToken = {
        id: 'new-token-id',
        userId: 'test-user-id',
        name: 'New Token',
        prefix: 'mcp_live_newt1234',
        tokenHash: 'newhash',
        createdAt: new Date('2025-01-05'),
        lastUsedAt: null,
        revokedAt: null,
        plainToken: 'mcp_live_newt1234567890abcdefghijklmnop',
      };

      mockCreateToken.mockResolvedValue(mockNewToken);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Token',
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.token).toEqual({
        id: 'new-token-id',
        name: 'New Token',
        prefix: 'mcp_live_newt1234',
        createdAt: '2025-01-05T00:00:00.000Z',
        plainToken: 'mcp_live_newt1234567890abcdefghijklmnop',
      });
      expect(mockCreateToken).toHaveBeenCalledWith({
        userId: 'test-user-id',
        name: 'New Token',
      });
    });

    it('should reject empty token name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: '',
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(mockCreateToken).not.toHaveBeenCalled();
    });

    it('should reject token name that is too long', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'a'.repeat(101),
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(mockCreateToken).not.toHaveBeenCalled();
    });

    it('should trim whitespace from token name', async () => {
      mockCreateToken.mockResolvedValue({
        id: 'token-id',
        name: 'Trimmed Name',
        prefix: 'mcp_live_trim1234',
        createdAt: new Date(),
        plainToken: 'mcp_live_trim1234567890',
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: '  Trimmed Name  ',
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateToken).toHaveBeenCalledWith({
        userId: 'test-user-id',
        name: 'Trimmed Name',
      });
    });

    it('should return 409 for duplicate token names', async () => {
      // Mock Prisma unique constraint error
      const prismaError = new Error('Unique constraint failed');
      (prismaError as any).code = 'P2002';
      (prismaError as any).meta = { target: ['userId', 'name'] };
      
      mockCreateToken.mockRejectedValue(prismaError);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Duplicate Token',
        }),
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('A token with this name already exists');
    });
  });

  describe('DELETE /api/tokens/:id', () => {
    it('should revoke a token successfully', async () => {
      mockRevokeToken.mockResolvedValue(true);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/tokens/550e8400-e29b-41d4-a716-446655440000',
        headers: {
          authorization: 'Bearer valid-session',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Token revoked successfully');
      expect(mockRevokeToken).toHaveBeenCalledWith(
        'test-user-id',
        '550e8400-e29b-41d4-a716-446655440000'
      );
    });

    it('should return 404 for non-existent token', async () => {
      mockRevokeToken.mockResolvedValue(false);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/tokens/550e8400-e29b-41d4-a716-446655440001',
        headers: {
          authorization: 'Bearer valid-session',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Token not found or already revoked');
    });

    it('should validate UUID format', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/tokens/not-a-uuid',
        headers: {
          authorization: 'Bearer valid-session',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockRevokeToken).not.toHaveBeenCalled();
    });

    it('should handle revocation errors', async () => {
      mockRevokeToken.mockRejectedValue(new Error('Database error'));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/tokens/550e8400-e29b-41d4-a716-446655440000',
        headers: {
          authorization: 'Bearer valid-session',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to revoke token');
    });
  });

  describe('User Isolation', () => {
    it('should only show tokens for the authenticated user', async () => {
      // This is implicitly tested by the getUserTokens call with userId
      // The McpTokenService.getUserTokens method should filter by userId
      const mockTokens = [
        { id: '1', userId: 'test-user-id', name: 'My Token' },
      ];
      
      mockGetUserTokens.mockResolvedValue(mockTokens);

      await fastify.inject({
        method: 'GET',
        url: '/api/tokens',
        headers: {
          authorization: 'Bearer valid-session',
        },
      });

      expect(mockGetUserTokens).toHaveBeenCalledWith('test-user-id');
    });
  });
});