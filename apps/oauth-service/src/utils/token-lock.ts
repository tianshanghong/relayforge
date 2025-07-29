/**
 * Simple in-memory lock manager for token refresh operations
 * Prevents race conditions when multiple requests try to refresh the same token
 */
export class TokenRefreshLock {
  private locks: Map<string, Promise<string>> = new Map();

  /**
   * Get lock key for a user-provider combination
   */
  private getLockKey(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }

  /**
   * Check if a refresh is already in progress
   */
  isRefreshing(userId: string, provider: string): boolean {
    return this.locks.has(this.getLockKey(userId, provider));
  }

  /**
   * Get the existing refresh promise if one exists
   */
  getRefreshPromise(userId: string, provider: string): Promise<string> | undefined {
    return this.locks.get(this.getLockKey(userId, provider));
  }

  /**
   * Set a refresh promise for a user-provider combination
   */
  setRefreshPromise(userId: string, provider: string, promise: Promise<string>): void {
    const key = this.getLockKey(userId, provider);
    this.locks.set(key, promise);

    // Clean up the lock after the promise resolves or rejects
    promise.finally(() => {
      this.locks.delete(key);
    });
  }

  /**
   * Clear all locks (useful for testing)
   */
  clear(): void {
    this.locks.clear();
  }
}

// Export singleton instance
export const tokenRefreshLock = new TokenRefreshLock();