import { UserService, prisma } from '@relayforge/database';
import { config } from '../config.js';

export interface CreateSessionOptions {
  userId: string;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    origin?: string;
  };
  expiresIn?: number; // Days
}

export interface SessionResponse {
  sessionId: string;
  sessionUrl: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionInfo {
  id: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  metadata: Record<string, unknown> | null;
}

export class SessionService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Create a new session for authenticated user
   */
  async createSession(options: CreateSessionOptions): Promise<SessionResponse> {
    const { userId, metadata, expiresIn = config.SESSION_DURATION_DAYS } = options;

    // Verify user exists
    const user = await this.userService.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create session with UserService
    const sessionId = await this.userService.createSession({
      userId,
      metadata,
      expiresAt: new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000),
    });

    // Get the created session for response
    const session = await prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw new Error('Failed to create session');
    }

    return {
      sessionId: session.sessionId,
      sessionUrl: this.generateMcpUrl(session.sessionId),
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastAccessedAt: 'desc',
      },
    });

    return sessions.map(session => ({
      id: session.id,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastAccessedAt: session.lastAccessedAt,
      metadata: session.metadata as Record<string, unknown> | null,
    }));
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.userId !== userId) {
      throw new Error('Unauthorized to revoke this session');
    }

    await prisma.session.delete({
      where: { sessionId },
    });
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllSessions(userId: string): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  /**
   * Refresh/extend a session
   */
  async refreshSession(userId: string, sessionId: string, expiresIn?: number): Promise<SessionResponse> {
    const session = await prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.userId !== userId) {
      throw new Error('Unauthorized to refresh this session');
    }

    if (session.expiresAt < new Date()) {
      throw new Error('Session has expired. Please create a new session at https://relayforge.xyz/dashboard');
    }

    // Calculate new expiry
    const daysToAdd = expiresIn || config.SESSION_DURATION_DAYS;
    const newExpiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);

    // Update session
    const updatedSession = await prisma.session.update({
      where: { sessionId },
      data: {
        expiresAt: newExpiresAt,
        lastAccessedAt: new Date(),
      },
    });

    return {
      sessionId: updatedSession.sessionId,
      sessionUrl: this.generateMcpUrl(updatedSession.sessionId),
      expiresAt: updatedSession.expiresAt,
      createdAt: updatedSession.createdAt,
    };
  }

  /**
   * Validate session and return user info
   */
  async validateSession(sessionId: string): Promise<{ userId: string; user: { id: string; primaryEmail: string; credits: number; createdAt: Date } } | null> {
    const session = await prisma.session.findUnique({
      where: { sessionId },
      include: {
        user: {
          select: {
            id: true,
            primaryEmail: true,
            credits: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      return null;
    }

    // Update last accessed time
    await prisma.session.update({
      where: { sessionId },
      data: { lastAccessedAt: new Date() },
    });

    return {
      userId: session.userId,
      user: session.user,
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    return this.userService.cleanupExpiredSessions();
  }

  /**
   * Generate MCP URL for a session
   */
  private generateMcpUrl(sessionId: string): string {
    const baseUrl = process.env.MCP_BASE_URL || 'https://relayforge.com';
    return `${baseUrl}/mcp/${sessionId}`;
  }

  /**
   * Get session statistics for analytics
   */
  async getSessionStats(userId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    lastActivity: Date | null;
  }> {
    const [total, active] = await Promise.all([
      prisma.session.count({
        where: { userId },
      }),
      prisma.session.count({
        where: {
          userId,
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
    ]);

    const lastSession = await prisma.session.findFirst({
      where: { userId },
      orderBy: { lastAccessedAt: 'desc' },
      select: { lastAccessedAt: true },
    });

    return {
      totalSessions: total,
      activeSessions: active,
      expiredSessions: total - active,
      lastActivity: lastSession?.lastAccessedAt || null,
    };
  }
}