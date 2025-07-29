import { prisma } from '../index';
import { crypto } from '../crypto';
import type { User, LinkedEmail } from '@prisma/client';

export interface CreateUserInput {
  email: string;
  provider: string;
  initialCredits?: number;
}

export interface LinkEmailInput {
  userId: string;
  email: string;
  provider: string;
}

export interface CreateSessionInput {
  userId: string;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  };
  expiresAt?: Date;
}

export class UserService {
  /**
   * Create a new user or return existing user if email already exists
   */
  async createUser(input: CreateUserInput): Promise<User> {
    const { email, provider, initialCredits = 500 } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email exists in any linked account
    const existingLinkedEmail = await prisma.linkedEmail.findUnique({
      where: { email: normalizedEmail },
      include: { user: true },
    });

    if (existingLinkedEmail) {
      return existingLinkedEmail.user;
    }

    // Create new user with linked email
    const user = await prisma.user.create({
      data: {
        primaryEmail: normalizedEmail,
        credits: initialCredits,
        linkedEmails: {
          create: {
            email: normalizedEmail,
            provider,
            isPrimary: true,
          },
        },
      },
    });

    return user;
  }

  /**
   * Find user by any linked email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    
    const linkedEmail = await prisma.linkedEmail.findUnique({
      where: { email: normalizedEmail },
      include: { user: true },
    });

    return linkedEmail?.user || null;
  }

  /**
   * Find user by ID
   */
  async findUserById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id: userId },
    });
  }

  /**
   * Link a new email to existing user account
   */
  async linkEmail(input: LinkEmailInput): Promise<LinkedEmail> {
    const { userId, email, provider } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already linked to another user
    const existingLinkedEmail = await prisma.linkedEmail.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingLinkedEmail && existingLinkedEmail.userId !== userId) {
      throw new Error(`Email ${email} is already linked to another account`);
    }

    if (existingLinkedEmail) {
      return existingLinkedEmail;
    }

    // Link the email
    return prisma.linkedEmail.create({
      data: {
        userId,
        email: normalizedEmail,
        provider,
        isPrimary: false,
      },
    });
  }

  /**
   * Update user's primary email
   */
  async updatePrimaryEmail(userId: string, newPrimaryEmail: string): Promise<User> {
    const normalizedEmail = newPrimaryEmail.toLowerCase().trim();

    // Verify the email is linked to this user
    const linkedEmail = await prisma.linkedEmail.findUnique({
      where: { email: normalizedEmail },
    });

    if (!linkedEmail || linkedEmail.userId !== userId) {
      throw new Error('Email must be linked to the user before setting as primary');
    }

    // Update user's primary email and linked email flags
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { primaryEmail: normalizedEmail },
      }),
      // Set all emails to non-primary
      prisma.linkedEmail.updateMany({
        where: { userId },
        data: { isPrimary: false },
      }),
      // Set new primary
      prisma.linkedEmail.update({
        where: { email: normalizedEmail },
        data: { isPrimary: true },
      }),
    ]);

    return user;
  }

  /**
   * Create a new session for a user
   */
  async createSession(input: CreateSessionInput): Promise<string> {
    const { userId, metadata, expiresAt } = input;
    const sessionId = crypto.generateSessionId();
    
    await prisma.session.create({
      data: {
        sessionId,
        userId,
        expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        metadata,
      },
    });

    return sessionId;
  }

  /**
   * Validate if a session is still active
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const session = await prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      return false;
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      return false;
    }

    // Only update last accessed time if it's been more than 1 hour
    const ONE_HOUR = 60 * 60 * 1000;
    const lastAccessed = session.lastAccessedAt?.getTime() || 0;
    const now = Date.now();
    
    if (now - lastAccessed > ONE_HOUR) {
      await prisma.session.update({
        where: { sessionId },
        data: { lastAccessedAt: new Date() },
      });
    }

    return true;
  }

  /**
   * Get user by session ID
   */
  async getUserBySessionId(sessionId: string): Promise<User | null> {
    const session = await prisma.session.findUnique({
      where: { sessionId },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      return null;
    }

    // Update last accessed time
    await prisma.session.update({
      where: { sessionId },
      data: { lastAccessedAt: new Date() },
    });

    return session.user;
  }

  /**
   * Get all linked emails for a user
   */
  async getLinkedEmails(userId: string): Promise<LinkedEmail[]> {
    return prisma.linkedEmail.findMany({
      where: { userId },
      orderBy: [
        { isPrimary: 'desc' },
        { linkedAt: 'asc' },
      ],
    });
  }

  /**
   * Check and deduct credits for a service call
   */
  async deductCredits(userId: string, service: string): Promise<boolean> {
    // Get service pricing
    const pricing = await prisma.servicePricing.findUnique({
      where: { service },
    });

    if (!pricing || !pricing.active) {
      throw new Error(`Service ${service} is not available`);
    }

    // Check and deduct credits in a transaction
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
        });

        if (!user || user.credits < pricing.pricePerCall) {
          throw new Error('Insufficient credits');
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            credits: {
              decrement: pricing.pricePerCall,
            },
          },
        });
      });

      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'Insufficient credits') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Add credits to user account
   */
  async addCredits(userId: string, credits: number): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        credits: {
          increment: credits,
        },
      },
    });
  }

  /**
   * Delete expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }
}