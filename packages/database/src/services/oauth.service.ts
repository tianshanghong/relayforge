import { prisma } from '../index.js';
import { crypto } from '../crypto.js';
import type { OAuthConnection } from '@prisma/client';

export interface StoreOAuthTokensInput {
  userId: string;
  provider: string;
  email: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export class OAuthService {
  /**
   * Store OAuth tokens for a user
   */
  async storeTokens(input: StoreOAuthTokensInput): Promise<OAuthConnection> {
    const {
      userId,
      provider,
      email,
      scopes,
      accessToken,
      refreshToken,
      expiresAt,
    } = input;

    // Encrypt tokens
    const encryptedAccessToken = crypto.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken
      ? crypto.encrypt(refreshToken)
      : undefined;

    // Upsert OAuth connection
    return prisma.oAuthConnection.upsert({
      where: {
        userId_provider_email: {
          userId,
          provider,
          email: email.toLowerCase().trim(),
        },
      },
      update: {
        scopes,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        provider,
        email: email.toLowerCase().trim(),
        scopes,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
      },
    });
  }

  /**
   * Get OAuth tokens for a user and provider
   */
  async getTokens(
    userId: string,
    provider: string
  ): Promise<OAuthTokens | null> {
    const connection = await prisma.oAuthConnection.findFirst({
      where: {
        userId,
        provider,
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });

    if (!connection) {
      return null;
    }

    // Update last used timestamp
    await prisma.oAuthConnection.update({
      where: { id: connection.id },
      data: { lastUsedAt: new Date() },
    });

    // Decrypt tokens
    return {
      accessToken: crypto.decrypt(connection.accessToken),
      refreshToken: connection.refreshToken
        ? crypto.decrypt(connection.refreshToken)
        : undefined,
      expiresAt: connection.expiresAt,
    };
  }

  /**
   * Get OAuth connection by user, provider, and email
   */
  async getConnection(
    userId: string,
    provider: string,
    email: string
  ): Promise<OAuthConnection | null> {
    return prisma.oAuthConnection.findUnique({
      where: {
        userId_provider_email: {
          userId,
          provider,
          email: email.toLowerCase().trim(),
        },
      },
    });
  }

  /**
   * Get all OAuth connections for a user
   */
  async getUserConnections(userId: string): Promise<OAuthConnection[]> {
    return prisma.oAuthConnection.findMany({
      where: { userId },
      orderBy: [
        { provider: 'asc' },
        { connectedAt: 'desc' },
      ],
    });
  }

  /**
   * Update OAuth tokens (e.g., after refresh)
   */
  async updateTokens(
    connectionId: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: Date
  ): Promise<OAuthConnection> {
    const encryptedAccessToken = crypto.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken
      ? crypto.encrypt(refreshToken)
      : undefined;

    return prisma.oAuthConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: encryptedAccessToken,
        ...(encryptedRefreshToken && { refreshToken: encryptedRefreshToken }),
        ...(expiresAt && { expiresAt }),
        lastUsedAt: new Date(),
        // Reset refresh tracking on successful refresh
        refreshFailureCount: 0,
        lastRefreshError: null,
        isHealthy: true,
      },
    });
  }

  /**
   * Track failed refresh attempt
   */
  async trackRefreshFailure(
    connectionId: string,
    error: string
  ): Promise<OAuthConnection> {
    const connection = await prisma.oAuthConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error('OAuth connection not found');
    }

    const newFailureCount = connection.refreshFailureCount + 1;
    const isHealthy = newFailureCount < 3; // Mark unhealthy after 3 failures

    return prisma.oAuthConnection.update({
      where: { id: connectionId },
      data: {
        lastRefreshAttempt: new Date(),
        refreshFailureCount: newFailureCount,
        lastRefreshError: error,
        isHealthy,
      },
    });
  }

  /**
   * Check if OAuth token is expired
   */
  isTokenExpired(connection: OAuthConnection): boolean {
    return connection.expiresAt < new Date();
  }

  /**
   * Disconnect OAuth provider
   */
  async disconnect(
    userId: string,
    provider: string,
    email?: string
  ): Promise<void> {
    if (email) {
      await prisma.oAuthConnection.delete({
        where: {
          userId_provider_email: {
            userId,
            provider,
            email: email.toLowerCase().trim(),
          },
        },
      });
    } else {
      // Delete all connections for this provider
      await prisma.oAuthConnection.deleteMany({
        where: {
          userId,
          provider,
        },
      });
    }
  }

  /**
   * Get available OAuth providers with their connection status
   */
  async getProvidersStatus(userId: string): Promise<
    Array<{
      provider: string;
      connected: boolean;
      emails: string[];
      lastUsed?: Date;
    }>
  > {
    const connections = await this.getUserConnections(userId);
    
    // Group by provider
    const providerMap = new Map<
      string,
      { emails: string[]; lastUsed?: Date }
    >();

    for (const conn of connections) {
      const existing = providerMap.get(conn.provider) || {
        emails: [],
        lastUsed: undefined,
      };
      
      existing.emails.push(conn.email);
      if (!existing.lastUsed || conn.lastUsedAt > existing.lastUsed) {
        existing.lastUsed = conn.lastUsedAt;
      }
      
      providerMap.set(conn.provider, existing);
    }

    // List of available providers
    const availableProviders = [
      'google',
      'github',
      'slack',
      'microsoft-graph',
      'notion',
      'linear',
    ];

    return availableProviders.map((provider) => {
      const data = providerMap.get(provider);
      return {
        provider,
        connected: !!data,
        emails: data?.emails || [],
        lastUsed: data?.lastUsed,
      };
    });
  }
}