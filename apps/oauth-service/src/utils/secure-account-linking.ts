import { prisma } from '@relayforge/database';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { TokenSet } from '../providers/base.provider';

export interface PendingLinkSession {
  id: string;
  newEmail: string;
  newProvider: string;
  encryptedTokens: string;
  expiresAt: Date;
}

export interface LinkingDecision {
  action: 'add_to_existing' | 'create_new' | 'pending_user_choice';
  existingUserId?: string;
  pendingSessionId?: string;
}

export class SecureAccountLinking {
  /**
   * Check if email already exists and handle accordingly
   * NO similarity matching - only exact email matches
   */
  static async checkExistingAccount(
    email: string,
    provider: string,
    tx: Prisma.TransactionClient
  ): Promise<LinkingDecision> {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check for EXACT email match only
    const existingUser = await tx.user.findFirst({
      where: {
        linkedEmails: {
          some: {
            email: normalizedEmail,
          },
        },
      },
      include: {
        oauthConnections: true,
      },
    });

    if (existingUser) {
      // Check if this provider is already connected
      const hasProvider = existingUser.oauthConnections.some(
        (conn) => conn.provider === provider && conn.email === normalizedEmail
      );

      if (hasProvider) {
        throw new Error('This provider is already connected to your account');
      }

      // Email exists - add provider to existing account
      return {
        action: 'add_to_existing',
        existingUserId: existingUser.id,
      };
    }

    // New email - user must decide
    return {
      action: 'pending_user_choice',
    };
  }

  /**
   * Create a temporary session for pending account creation/linking
   */
  static async createPendingSession(
    _email: string,
    _provider: string,
    _tokens: TokenSet
  ): Promise<string> {
    const sessionId = crypto.randomBytes(32).toString('base64url');
    
    // TODO: Store pending session in Redis or temporary table
    // Would store: {
    //   id: sessionId,
    //   newEmail: _email,
    //   newProvider: _provider,
    //   encryptedTokens: encrypt(_tokens),
    //   expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    // }
    
    return sessionId;
  }

  /**
   * Link accounts after user proves ownership of both
   */
  static async linkVerifiedAccounts(
    _primaryUserId: string,
    _pendingSessionId: string,
    _tx: Prisma.TransactionClient
  ): Promise<void> {
    // TODO: Retrieve pending session from storage
    // const pendingSession = await getPendingSession(_pendingSessionId);
    
    // Verify session hasn't expired
    // if (pendingSession.expiresAt < new Date()) {
    //   throw new Error('Linking session expired');
    // }

    // The user has now proven ownership of both accounts
    // Safe to proceed with linking
    
    // Implementation would:
    // 1. Create OAuth connection with pending session data
    // 2. Add email to user's linked emails
    // 3. Delete pending session
  }

  /**
   * Merge accounts when user has authenticated with both
   * This is called ONLY after user has OAuth'd with both accounts
   */
  static async mergeVerifiedAccounts(
    keepAccountId: string,
    mergeAccountId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    // Move all OAuth connections
    await tx.oAuthConnection.updateMany({
      where: { userId: mergeAccountId },
      data: { userId: keepAccountId },
    });

    // Move all linked emails
    const emailsToMove = await tx.linkedEmail.findMany({
      where: { userId: mergeAccountId },
    });

    for (const email of emailsToMove) {
      // Check if email already exists on keep account
      const exists = await tx.linkedEmail.findFirst({
        where: {
          userId: keepAccountId,
          email: email.email,
        },
      });

      if (!exists) {
        await tx.linkedEmail.update({
          where: { id: email.id },
          data: { userId: keepAccountId },
        });
      } else {
        // Delete duplicate
        await tx.linkedEmail.delete({
          where: { id: email.id },
        });
      }
    }

    // Merge credits
    const mergeUser = await tx.user.findUnique({
      where: { id: mergeAccountId },
    });

    if (mergeUser && mergeUser.credits > 0) {
      await tx.user.update({
        where: { id: keepAccountId },
        data: {
          credits: { increment: mergeUser.credits },
        },
      });
    }

    // Transfer sessions
    await tx.session.updateMany({
      where: { userId: mergeAccountId },
      data: { userId: keepAccountId },
    });

    // Delete merged account
    await tx.user.delete({
      where: { id: mergeAccountId },
    });
  }
}

/**
 * Example OAuth callback flow
 */
export async function handleOAuthCallbackSecurely(
  provider: string,
  email: string,
  tokens: TokenSet
) {
  return await prisma.$transaction(async (tx) => {
    const decision = await SecureAccountLinking.checkExistingAccount(
      email,
      provider,
      tx
    );

    switch (decision.action) {
      case 'add_to_existing':
        // Email matches existing account - add provider
        // User has proven ownership via OAuth
        return {
          type: 'provider_added',
          userId: decision.existingUserId,
          message: `${provider} has been added to your account`,
        };

      case 'pending_user_choice': {
        // New email - create pending session
        const sessionId = await SecureAccountLinking.createPendingSession(
          email,
          provider,
          tokens
        );

        return {
          type: 'pending_choice',
          pendingSessionId: sessionId,
          message: 'Choose to create new account or link to existing',
        };
      }
        
      default:
        throw new Error('Unknown decision action');
    }
  });
}