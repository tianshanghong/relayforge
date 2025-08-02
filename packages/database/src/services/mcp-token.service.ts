import { prisma } from '../index';
import crypto from 'crypto';
import type { McpToken } from '@prisma/client';

export interface CreateMcpTokenInput {
  userId: string;
  name: string;
}

export interface McpTokenWithPlainText extends McpToken {
  plainToken: string;
}

// Re-export the type for external use
export type { McpTokenWithPlainText as McpTokenWithPlainTextType };

export class McpTokenService {
  private static readonly TOKEN_PREFIX = 'mcp_live_';
  private static readonly TOKEN_LENGTH = 32; // bytes -> 43 chars base64url

  /**
   * Generate a secure MCP token
   */
  static generateToken(): { token: string; hash: string } {
    const randomBytes = crypto.randomBytes(this.TOKEN_LENGTH);
    const tokenValue = randomBytes.toString('base64url');
    const fullToken = `${this.TOKEN_PREFIX}${tokenValue}`;
    
    // Hash the full token for storage
    const hash = crypto.createHash('sha256').update(fullToken).digest('hex');
    
    return {
      token: fullToken,
      hash
    };
  }

  /**
   * Extract prefix for display (first 8 chars after mcp_live_)
   */
  static getTokenPrefix(token: string): string {
    const prefixLength = this.TOKEN_PREFIX.length;
    return token.substring(0, prefixLength + 8);
  }

  /**
   * Create a new MCP token for a user
   * Returns the token ONLY ONCE - it cannot be retrieved later
   */
  async createToken(input: CreateMcpTokenInput): Promise<McpTokenWithPlainText> {
    const { userId, name } = input;
    const { token, hash } = McpTokenService.generateToken();
    const prefix = McpTokenService.getTokenPrefix(token);

    const mcpToken = await prisma.mcpToken.create({
      data: {
        userId,
        name,
        tokenHash: hash,
        prefix
      }
    });

    return {
      ...mcpToken,
      plainToken: token // Only returned on creation!
    };
  }

  /**
   * Validate a token and return the associated user ID
   */
  async validateToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
    if (!token.startsWith(McpTokenService.TOKEN_PREFIX)) {
      return null;
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const mcpToken = await prisma.mcpToken.findUnique({
      where: { tokenHash: hash },
      select: {
        id: true,
        userId: true,
        revokedAt: true
      }
    });

    if (!mcpToken || mcpToken.revokedAt) {
      return null;
    }

    // Update last used time - await to ensure it completes
    // We don't want to fail auth if this fails, but we want to ensure it completes
    const updatePromise = prisma.mcpToken.update({
      where: { id: mcpToken.id },
      data: { lastUsedAt: new Date() }
    }).catch(err => {
      // Log error but don't throw - this is non-critical for auth
      console.error('Failed to update token last used time:', err);
      // In production, this should be sent to monitoring service
      // TODO: Add proper error tracking/monitoring
    });

    // Wait for update to complete before returning
    await updatePromise;

    return {
      userId: mcpToken.userId,
      tokenId: mcpToken.id
    };
  }

  /**
   * Get all tokens for a user (without the actual token values)
   */
  async getUserTokens(userId: string): Promise<McpToken[]> {
    return prisma.mcpToken.findMany({
      where: {
        userId,
        revokedAt: null
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Revoke a token
   */
  async getTokenById(tokenId: string): Promise<{ userId: string; hashedToken: string } | null> {
    const token = await prisma.mcpToken.findUnique({
      where: { id: tokenId },
      select: { userId: true, tokenHash: true }
    });

    if (!token) return null;

    return {
      userId: token.userId,
      hashedToken: token.tokenHash
    };
  }

  async revokeToken(userId: string, tokenId: string): Promise<boolean> {
    const result = await prisma.mcpToken.updateMany({
      where: {
        id: tokenId,
        userId, // Ensure user owns the token
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return result.count > 0;
  }

  /**
   * Delete old revoked tokens (cleanup job)
   */
  async cleanupRevokedTokens(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.mcpToken.deleteMany({
      where: {
        revokedAt: {
          lt: cutoffDate
        }
      }
    });

    return result.count;
  }
}