import { UserService, prisma } from '@relayforge/database';

export interface SessionInfo {
  userId: string;
  credits: number;
  sessionId: string;
  expiresAt: Date;
  // Note: We don't cache email or other mutable user data to avoid stale information
}

export interface SessionValidationResult {
  valid: boolean;
  info?: SessionInfo;
  error?: string;
}

export class SessionValidator {
  private userService: UserService;
  private sessionCache: Map<string, { info: SessionInfo; expires: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 10000; // Prevent memory leak

  constructor() {
    this.userService = new UserService();
  }

  async validateSession(sessionId: string): Promise<SessionInfo | null> {
    // Input validation
    if (!sessionId || sessionId.length !== 36) {
      return null;
    }

    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached && cached.expires > Date.now()) {
      return cached.info;
    }

    try {
      // Validate against database with session details
      const session = await prisma.session.findUnique({
        where: { sessionId },
        include: {
          user: {
            select: {
              id: true,
              primaryEmail: true,
              credits: true,
            },
          },
        },
      });

      if (!session) {
        this.sessionCache.delete(sessionId);
        return null;
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        this.sessionCache.delete(sessionId);
        return null;
      }

      const info: SessionInfo = {
        userId: session.user.id,
        credits: session.user.credits,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
      };

      // Update last accessed time asynchronously
      this.updateLastAccessed(sessionId).catch(err => {
        console.error('Failed to update session last accessed time:', err);
      });

      // Cache the result with size limit check
      if (this.sessionCache.size >= this.MAX_CACHE_SIZE) {
        // Remove oldest entries (simple FIFO)
        const firstKey = this.sessionCache.keys().next().value;
        if (firstKey) {
          this.sessionCache.delete(firstKey);
        }
      }

      this.sessionCache.set(sessionId, {
        info,
        expires: Date.now() + this.CACHE_TTL,
      });

      return info;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  async validateSessionWithDetails(sessionId: string): Promise<SessionValidationResult> {
    const info = await this.validateSession(sessionId);
    
    if (!info) {
      return {
        valid: false,
        error: 'Invalid or expired session',
      };
    }

    return {
      valid: true,
      info,
    };
  }

  async checkCredits(userId: string, service: string): Promise<boolean> {
    return this.userService.deductCredits(userId, service);
  }

  private async updateLastAccessed(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { sessionId },
      data: { lastAccessedAt: new Date() },
    });
  }

  async trackUsage(sessionId: string, userId: string, service: string, credits: number, success: boolean): Promise<void> {
    try {
      await prisma.usage.create({
        data: {
          sessionId,
          userId,
          service,
          credits,
          success,
        },
      });
    } catch (error) {
      console.error('Failed to track usage:', error);
    }
  }

  clearCache(sessionId?: string) {
    if (sessionId) {
      this.sessionCache.delete(sessionId);
    } else {
      this.sessionCache.clear();
    }
  }

  getCacheStats() {
    return {
      size: this.sessionCache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }
}