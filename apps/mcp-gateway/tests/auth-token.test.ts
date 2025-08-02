import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenValidator } from '../src/auth/token-validator';
import { mcpTokenService, prisma } from '@relayforge/database';

// Mock the database module
vi.mock('@relayforge/database', () => ({
  mcpTokenService: {
    validateToken: vi.fn(),
  },
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Token-based Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TokenValidator', () => {
    const validator = new TokenValidator();

    it('should validate a valid bearer token', async () => {
      const mockToken = 'mcp_live_test123';
      const mockUserId = 'user-123';
      const mockTokenId = 'token-456';

      vi.mocked(mcpTokenService.validateToken).mockResolvedValue({
        userId: mockUserId,
        tokenId: mockTokenId,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUserId,
        credits: 500,
      } as any);

      const result = await validator.validateBearerToken(`Bearer ${mockToken}`);

      expect(result).toEqual({
        userId: mockUserId,
        credits: 500,
        authType: 'token',
        identifier: mockTokenId,
      });
    });

    it('should return null for invalid token format', async () => {
      const result = await validator.validateBearerToken('InvalidFormat');
      expect(result).toBeNull();
    });

    it('should extract slug from path correctly', () => {
      expect(validator.extractSlugFromPath('/mcp/u/happy-dolphin-42')).toBe('happy-dolphin-42');
      expect(validator.extractSlugFromPath('/mcp/u/brave-eagle-7')).toBe('brave-eagle-7');
      expect(validator.extractSlugFromPath('/mcp/u/invalid_format')).toBeNull();
      expect(validator.extractSlugFromPath('/mcp/session-id')).toBeNull();
    });

    it('should validate token belongs to user with slug', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        slug: 'happy-dolphin-42',
      } as any);

      const authInfo = {
        userId: 'user-123',
        credits: 500,
        authType: 'token' as const,
        identifier: 'token-456',
      };

      const result = await validator.validateTokenForSlug(authInfo, 'happy-dolphin-42');
      expect(result).toBe(true);

      const result2 = await validator.validateTokenForSlug(authInfo, 'wrong-slug-99');
      expect(result2).toBe(false);
    });
  });

});