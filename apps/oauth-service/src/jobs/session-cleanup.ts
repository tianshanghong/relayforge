import { SessionService } from '../services/session.service.js';

export class SessionCleanupJob {
  private sessionService: SessionService;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.sessionService = new SessionService();
  }

  start(): void {
    if (this.intervalId) {
      console.warn('Session cleanup job is already running');
      return;
    }

    // Run immediately on start
    this.runCleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL);

    console.info(`Session cleanup job started - will run every ${this.CLEANUP_INTERVAL / 1000 / 60} minutes`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.info('Session cleanup job stopped');
    }
  }

  private async runCleanup(): Promise<void> {
    try {
      const startTime = Date.now();
      const deletedCount = await this.sessionService.cleanupExpiredSessions();
      const duration = Date.now() - startTime;

      if (deletedCount > 0) {
        console.info(`Session cleanup completed: deleted ${deletedCount} expired sessions in ${duration}ms`);
      }
    } catch (error) {
      console.error('Session cleanup failed:', error);
    }
  }

  // Method to manually trigger cleanup (useful for testing or admin endpoints)
  async triggerCleanup(): Promise<number> {
    console.info('Manual session cleanup triggered');
    return this.sessionService.cleanupExpiredSessions();
  }
}

// Export singleton instance
export const sessionCleanupJob = new SessionCleanupJob();