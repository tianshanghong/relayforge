import { prisma } from '@relayforge/database';
import type { User } from '@prisma/client';

let userCounter = 0;

export const resetTestHelpers = () => {
  userCounter = 0;
};

export const createTestUser = async (
  email?: string,
  credits = 500,
  additionalData?: any
): Promise<User> => {
  const uniqueEmail = email || `test-user-${++userCounter}@example.com`;
  const randomId = Math.random().toString(36).substring(7);
  
  return prisma.user.create({
    data: {
      primaryEmail: uniqueEmail,
          slug: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      slug: `test-oauth-${userCounter}-${randomId}`,
      credits,
      linkedEmails: {
        create: {
          email: uniqueEmail,
          provider: 'test',
          isPrimary: true,
        },
      },
      ...additionalData,
    },
  });
};

export const cleanupTestData = async () => {
  // Clean in the correct order to respect foreign key constraints
  await prisma.$transaction([
    prisma.usage.deleteMany(),
    prisma.session.deleteMany(),
    prisma.oAuthConnection.deleteMany(),
    prisma.mcpToken.deleteMany(),
    prisma.linkedEmail.deleteMany(),
    prisma.user.deleteMany(),
    prisma.servicePricing.deleteMany(),
  ]);
  
  resetTestHelpers();
};