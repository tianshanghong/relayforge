-- AlterTable
ALTER TABLE "oauth_connections" ADD COLUMN     "isHealthy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastRefreshAttempt" TIMESTAMP(3),
ADD COLUMN     "lastRefreshError" TEXT,
ADD COLUMN     "refreshFailureCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "oauth_connections_isHealthy_lastUsedAt_idx" ON "oauth_connections"("isHealthy", "lastUsedAt");

-- CreateIndex
CREATE INDEX "oauth_connections_expiresAt_isHealthy_idx" ON "oauth_connections"("expiresAt", "isHealthy");
