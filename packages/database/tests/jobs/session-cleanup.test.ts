import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionCleanupJob } from '../../src/jobs/session-cleanup';
import { userService } from '../../src/services';
import { prisma } from '../../src';
import { testHelpers } from '../helpers';

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

describe('SessionCleanupJob', () => {
  let job: SessionCleanupJob;

  beforeEach(() => {
    job = new SessionCleanupJob();
    vi.clearAllMocks();
  });

  afterEach(() => {
    job.stop();
  });

  describe('run', () => {
    it('should cleanup expired sessions', async () => {
      const user = await testHelpers.createUser();
      
      // Create active session
      await testHelpers.createSession(user.id);
      
      // Create expired sessions
      const expiredCount = 3;
      for (let i = 0; i < expiredCount; i++) {
        await prisma.session.create({
          data: {
            sessionId: `expired-${i}`,
            userId: user.id,
            expiresAt: new Date(Date.now() - 1000),
          },
        });
      }

      const deletedCount = await job.run(false);
      expect(deletedCount).toBe(expiredCount);
    });

    it('should log results when requested', async () => {
      await job.run(true);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Session cleanup completed')
      );
    });

    it('should handle errors gracefully', async () => {
      // Mock userService to throw error
      vi.spyOn(userService, 'cleanupExpiredSessions').mockRejectedValueOnce(
        new Error('Database error')
      );

      const result = await job.run(false);
      
      expect(result).toBe(0);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '❌ Session cleanup failed:',
        expect.any(Error)
      );
    });

    it('should prevent concurrent runs', async () => {
      // Mock cleanup to take time
      vi.spyOn(userService, 'cleanupExpiredSessions').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(5), 100))
      );

      // Start first run
      const run1 = job.run(false);
      
      // Try to start second run immediately
      const run2 = job.run(true);

      const [result1, result2] = await Promise.all([run1, run2]);
      
      expect(result1).toBe(5);
      expect(result2).toBe(0);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '⏳ Session cleanup already in progress, skipping...'
      );
    });
  });

  describe('start', () => {
    it('should start periodic cleanup', async () => {
      const cleanupSpy = vi.spyOn(job, 'run');
      
      job.start({ intervalMinutes: 0.01, logResults: false }); // 0.6 seconds
      
      // Should run immediately
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      
      // Wait for interval
      await new Promise(resolve => setTimeout(resolve, 700));
      
      expect(cleanupSpy).toHaveBeenCalledTimes(2);
    });

    it('should not start if already running', () => {
      job.start({ logResults: false });
      job.start({ logResults: false });
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'Session cleanup job is already running'
      );
    });

    it('should log when started', () => {
      job.start({ intervalMinutes: 60, logResults: true });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '✅ Session cleanup job started (runs every 60 minutes)'
      );
    });
  });

  describe('stop', () => {
    it('should stop the job', () => {
      job.start({ logResults: false });
      expect(job.isActive()).toBe(true);
      
      job.stop();
      expect(job.isActive()).toBe(false);
      expect(consoleSpy.log).toHaveBeenCalledWith('🛑 Session cleanup job stopped');
    });

    it('should handle stop when not running', () => {
      job.stop();
      expect(consoleSpy.log).not.toHaveBeenCalledWith('🛑 Session cleanup job stopped');
    });
  });

  describe('isActive', () => {
    it('should return correct status', () => {
      expect(job.isActive()).toBe(false);
      
      job.start({ logResults: false });
      expect(job.isActive()).toBe(true);
      
      job.stop();
      expect(job.isActive()).toBe(false);
    });
  });
});

describe('startSessionCleanup helper', () => {
  it('should start in production', async () => {
    const { startSessionCleanup } = await import('../../src/jobs/session-cleanup');
    
    process.env.NODE_ENV = 'production';
    startSessionCleanup({ logResults: false });
    
    // Clean up
    const { sessionCleanupJob } = await import('../../src/jobs/session-cleanup');
    sessionCleanupJob.stop();
    
    delete process.env.NODE_ENV;
  });

  it('should start when ENABLE_CRON_JOBS is set', async () => {
    const { startSessionCleanup } = await import('../../src/jobs/session-cleanup');
    
    process.env.ENABLE_CRON_JOBS = 'true';
    startSessionCleanup({ logResults: false });
    
    // Clean up
    const { sessionCleanupJob } = await import('../../src/jobs/session-cleanup');
    sessionCleanupJob.stop();
    
    delete process.env.ENABLE_CRON_JOBS;
  });

  it('should not start in development', async () => {
    const { startSessionCleanup } = await import('../../src/jobs/session-cleanup');
    
    process.env.NODE_ENV = 'development';
    consoleSpy.log.mockClear();
    
    startSessionCleanup();
    
    expect(consoleSpy.log).toHaveBeenCalledWith(
      '📌 Session cleanup job disabled in development'
    );
    
    delete process.env.NODE_ENV;
  });
});