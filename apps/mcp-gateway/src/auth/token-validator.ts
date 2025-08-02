import { mcpTokenService, prisma } from '@relayforge/database';

export interface AuthInfo {
  userId: string;
  credits: number;
  authType: 'session' | 'token';
  tokenId: string;
}

export class TokenValidator {
  private tokenCache: Map<string, { info: AuthInfo; expires: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 10000; // Prevent memory leak

  /**
   * Validate bearer token from Authorization header
   */
  async validateBearerToken(authHeader: string | undefined): Promise<AuthInfo | null> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached && cached.expires > Date.now()) {
      return cached.info;
    }

    try {
      // Validate token
      const result = await mcpTokenService.validateToken(token);
      if (!result) {
        this.tokenCache.delete(token);
        return null;
      }

      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: result.userId },
        select: {
          id: true,
          credits: true,
        },
      });

      if (!user) {
        return null;
      }

      const info: AuthInfo = {
        userId: user.id,
        credits: user.credits,
        authType: 'token',
        tokenId: result.tokenId,
      };

      // Cache the result
      this.cacheResult(token, info);

      return info;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * Extract user slug from URL path
   */
  extractSlugFromPath(path: string): string | null {
    // Match /mcp/u/{slug} pattern
    const match = path.match(/^\/mcp\/u\/([a-z]+-[a-z]+-\d+)$/);
    return match ? match[1] : null;
  }

  /**
   * Validate that the token belongs to the user with the given slug
   */
  async validateTokenForSlug(authInfo: AuthInfo, slug: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: authInfo.userId },
      select: { slug: true },
    });

    return user?.slug === slug;
  }

  private cacheResult(key: string, info: AuthInfo) {
    if (this.tokenCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.tokenCache.keys().next().value;
      if (firstKey) {
        this.tokenCache.delete(firstKey);
      }
    }

    this.tokenCache.set(key, {
      info,
      expires: Date.now() + this.CACHE_TTL,
    });
  }

  clearCache(key?: string) {
    if (key) {
      this.tokenCache.delete(key);
    } else {
      this.tokenCache.clear();
    }
  }

  /**
   * Invalidate a token by its hash
   * Called when a token is revoked to ensure immediate invalidation
   */
  invalidateToken(tokenHash: string) {
    // Remove from cache to force re-validation
    this.clearCache(tokenHash);
  }

  getCacheStats() {
    return {
      size: this.tokenCache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }
}