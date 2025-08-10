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
  await prisma.$transaction(async (tx) => {
    await tx.usage.deleteMany();
    await tx.session.deleteMany();
    await tx.oAuthConnection.deleteMany();
    await tx.mcpToken.deleteMany();
    await tx.linkedEmail.deleteMany();
    await tx.user.deleteMany();
    await tx.servicePricing.deleteMany();
  });
  
  resetTestHelpers();
};