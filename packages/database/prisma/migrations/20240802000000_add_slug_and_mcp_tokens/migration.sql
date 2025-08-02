-- AlterTable
ALTER TABLE "users" ADD COLUMN "slug" TEXT;

-- CreateTable
CREATE TABLE "mcp_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tokens_tokenHash_key" ON "mcp_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_tokens_tokenHash_idx" ON "mcp_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_tokens_userId_idx" ON "mcp_tokens"("userId");

-- CreateIndex
CREATE INDEX "mcp_tokens_createdAt_idx" ON "mcp_tokens"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_slug_key" ON "users"("slug");

-- CreateIndex
CREATE INDEX "users_slug_idx" ON "users"("slug");

-- AddForeignKey
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;