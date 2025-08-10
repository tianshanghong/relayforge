import { userService } from '../services/index.js';

export interface SessionCleanupOptions {
  intervalMinutes?: number;
  logResults?: boolean;
}

export class SessionCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the session cleanup job
   */
  start(options: SessionCleanupOptions = {}): void {
    const { intervalMinutes = 60, logResults = true } = options;

    if (this.intervalId) {
      console.warn('Session cleanup job is already running');
      return;
    }

    // Run immediately on start
    this.run(logResults);

    // Schedule periodic runs
    this.intervalId = setInterval(
      () => this.run(logResults),
      intervalMinutes * 60 * 1000
    );

    if (logResults) {
      console.log(
        `✅ Session cleanup job started (runs every ${intervalMinutes} minutes)`
      );
    }
  }

  /**
   * Stop the session cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Session cleanup job stopped');
    }
  }

  /**
   * Run the cleanup job once
   */
  async run(logResults: boolean = true): Promise<number> {
    if (this.isRunning) {
      if (logResults) {
        console.log('⏳ Session cleanup already in progress, skipping...');
      }
      return 0;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const deletedCount = await userService.cleanupExpiredSessions();

      if (logResults) {
        const duration = Date.now() - startTime;
        console.log(
          `🧹 Session cleanup completed: ${deletedCount} expired sessions removed (${duration}ms)`
        );
      }

      return deletedCount;
    } catch (error) {
      console.error('❌ Session cleanup failed:', error);
      return 0;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if the job is currently running
   */
  isActive(): boolean {
    return this.intervalId !== null;
  }
}

// Export singleton instance
export const sessionCleanupJob = new SessionCleanupJob();

// Helper function to start cleanup job in production
export function startSessionCleanup(options?: SessionCleanupOptions): void {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CRON_JOBS === 'true') {
    sessionCleanupJob.start(options);
  } else {
    console.log('📌 Session cleanup job disabled in development');
  }
}