import { prisma } from '../src';
import { crypto } from '../src/crypto';
import type { User, ServicePricing } from '@prisma/client';

let userCounter = 0;

export const resetTestHelpers = () => {
  userCounter = 0;
};

export const testHelpers = {
  async createUser(email?: string, credits = 500): Promise<User> {
    const uniqueEmail = email || `test${++userCounter}@example.com`;
    return prisma.user.create({
      data: {
        primaryEmail: uniqueEmail,
        credits,
        linkedEmails: {
          create: {
            email: uniqueEmail,
            provider: 'test',
            isPrimary: true,
          },
        },
      },
    });
  },

  async createServicePricing(service: string, pricePerCall = 1): Promise<ServicePricing> {
    return prisma.servicePricing.create({
      data: {
        service,
        pricePerCall,
        category: 'test',
        active: true,
      },
    });
  },

  async createSession(userId: string) {
    const sessionId = crypto.generateSessionId();
    await prisma.session.create({
      data: {
        sessionId,
        userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return sessionId;
  },

  async createOAuthConnection(userId: string, provider = 'google', email?: string) {
    // If no email provided, get the user's primary email
    if (!email) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      email = user?.primaryEmail || 'oauth@example.com';
    }
    
    return prisma.oAuthConnection.create({
      data: {
        userId,
        provider,
        email,
        scopes: ['test.read', 'test.write'],
        accessToken: crypto.encrypt('test-access-token'),
        refreshToken: crypto.encrypt('test-refresh-token'),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
  },

  async seedServicePricing() {
    const services = [
      { service: 'google-calendar', pricePerCall: 2, category: 'oauth', active: true },
      { service: 'openai', pricePerCall: 1, category: 'api-key', active: true },
      { service: 'github', pricePerCall: 1, category: 'oauth', active: true },
    ];

    for (const service of services) {
      await prisma.servicePricing.upsert({
        where: { service: service.service },
        update: { active: true },
        create: service,
      });
    }
  },

  async cleanDatabase() {
    // Delete in correct order to respect foreign key constraints
    await prisma.usage.deleteMany();
    await prisma.session.deleteMany();
    await prisma.oAuthConnection.deleteMany();
    await prisma.linkedEmail.deleteMany();
    await prisma.user.deleteMany();
    await prisma.servicePricing.deleteMany();
  },

  async cleanupExpiredSessions() {
    const deleted = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    return deleted.count;
  },
  
  resetTestHelpers,
};