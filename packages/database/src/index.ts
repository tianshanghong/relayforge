export { PrismaClient } from '@prisma/client';
export type { User, LinkedEmail, OAuthConnection, Session, Usage, ServicePricing } from '@prisma/client';
export { CryptoService, crypto } from './crypto';
export * from './services';
export * from './jobs';

// Prisma client singleton
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;