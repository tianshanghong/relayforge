import crypto from 'crypto';
import { prisma } from '@relayforge/database';
import { config } from '../config';

export class SessionManager {
  static generateSessionId(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static async createSession(userId: string): Promise<{
    sessionId: string;
    sessionUrl: string;
    expiresAt: Date;
  }> {
    const sessionId = this.generateSessionId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.SESSION_DURATION_DAYS);

    const session = await prisma.session.create({
      data: {
        sessionId,
        userId,
        expiresAt,
      },
    });

    const sessionUrl = this.getMcpUrl(sessionId);

    return {
      sessionId: session.sessionId,
      sessionUrl,
      expiresAt: session.expiresAt,
    };
  }

  static getMcpUrl(sessionId: string): string {
    const baseUrl = process.env.MCP_BASE_URL || 'https://relayforge.com';
    return `${baseUrl}/mcp/${sessionId}`;
  }

  static async validateSession(sessionId: string): Promise<string | null> {
    const session = await prisma.session.findUnique({
      where: { sessionId },
      select: {
        userId: true,
        expiresAt: true,
        lastAccessedAt: true,
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    // Only update last accessed time if it's been more than 1 hour
    const ONE_HOUR = 60 * 60 * 1000;
    const lastAccessed = session.lastAccessedAt?.getTime() || 0;
    const now = Date.now();
    
    if (now - lastAccessed > ONE_HOUR) {
      await prisma.session.update({
        where: { sessionId },
        data: { lastAccessedAt: new Date() },
      });
    }

    return session.userId;
  }
}