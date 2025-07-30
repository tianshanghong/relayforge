import { UserService } from '@relayforge/database';

export interface SessionInfo {
  userId: string;
  email: string;
  credits: number;
}

export class SessionValidator {
  private userService: UserService;
  private sessionCache: Map<string, { info: SessionInfo; expires: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.userService = new UserService();
  }

  async validateSession(sessionId: string): Promise<SessionInfo | null> {
    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached && cached.expires > Date.now()) {
      return cached.info;
    }

    // Validate against database
    const user = await this.userService.getUserBySessionId(sessionId);
    if (!user) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    const info: SessionInfo = {
      userId: user.id,
      email: user.primaryEmail,
      credits: user.credits,
    };

    // Cache the result
    this.sessionCache.set(sessionId, {
      info,
      expires: Date.now() + this.CACHE_TTL,
    });

    return info;
  }

  async checkCredits(userId: string, service: string): Promise<boolean> {
    return this.userService.deductCredits(userId, service);
  }

  clearCache(sessionId?: string) {
    if (sessionId) {
      this.sessionCache.delete(sessionId);
    } else {
      this.sessionCache.clear();
    }
  }
}