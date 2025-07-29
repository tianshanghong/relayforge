import { OAuthService as DatabaseOAuthService, prisma, crypto } from '@relayforge/database';
import { providerRegistry } from '../providers/registry';
import { CSRFManager } from '../utils/csrf';
import { SessionManager } from '../utils/session';
import { OAuthError } from '../utils/errors';
import { tokenRefreshLock } from '../utils/token-lock';

export class OAuthFlowService {
  private dbOAuthService: DatabaseOAuthService;

  constructor() {
    this.dbOAuthService = new DatabaseOAuthService();
  }

  /**
   * Initiate OAuth flow
   */
  async initiateOAuth(provider: string, redirectUrl?: string): Promise<string> {
    const oauthProvider = providerRegistry.get(provider);
    if (!oauthProvider) {
      throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    // Generate state with CSRF token
    const state = CSRFManager.createState(provider, redirectUrl);

    // Get authorization URL
    const authUrl = oauthProvider.getAuthorizationUrl(state);

    return authUrl;
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(
    provider: string,
    code: string | undefined,
    state: string | undefined,
    error?: string
  ): Promise<{
    sessionUrl: string;
    user: {
      id: string;
      email: string;
      credits: number;
      isNewUser: boolean;
    };
  }> {
    // Handle user denial
    if (error === 'access_denied') {
      throw OAuthError.userDenied();
    }

    // Validate required parameters
    if (!code) {
      throw OAuthError.missingCode();
    }

    if (!state) {
      throw OAuthError.invalidState();
    }

    // Validate CSRF state
    let statePayload;
    try {
      statePayload = CSRFManager.validateState(state);
    } catch (error) {
      throw OAuthError.invalidState();
    }

    // Verify provider matches
    if (statePayload.provider !== provider) {
      throw OAuthError.invalidState();
    }

    // Get provider
    const oauthProvider = providerRegistry.get(provider);
    if (!oauthProvider) {
      throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    // Exchange code for tokens
    const tokens = await oauthProvider.exchangeCode(code);

    // Validate scopes - make validation mandatory
    const receivedScopes = tokens.scope || '';
    if (!oauthProvider.validateScopes(receivedScopes)) {
      throw OAuthError.insufficientScope(provider, oauthProvider.scopes);
    }

    // Get user info
    const userInfo = await oauthProvider.getUserInfo(tokens.accessToken);

    // Use transaction to ensure atomicity of user creation and OAuth token storage
    const result = await prisma.$transaction(async (tx) => {
      // Find or create user within transaction
      const { user, isNewUser } = await this.findOrCreateUserInTransaction(
        userInfo.email,
        provider,
        tx
      );

      // Store OAuth tokens within same transaction
      await this.storeTokensInTransaction({
        userId: user.id,
        provider,
        email: userInfo.email,
        scopes: (receivedScopes || tokens.scope)?.split(' ') || oauthProvider.scopes,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        expiresAt: this.calculateExpiryDate(tokens.expiresIn),
      }, tx);

      return { user, isNewUser };
    });

    // Create session (outside transaction as it's independent)
    const { sessionUrl } = await SessionManager.createSession(result.user.id);

    return {
      sessionUrl,
      user: {
        id: result.user.id,
        email: result.user.primaryEmail,
        credits: result.user.credits,
        isNewUser: result.isNewUser,
      },
    };
  }

  /**
   * Get valid access token (with auto-refresh)
   */
  async getValidToken(userId: string, provider: string): Promise<string> {
    const tokens = await this.dbOAuthService.getTokens(userId, provider);
    if (!tokens) {
      throw new Error('No OAuth connection found');
    }

    // Check if token is expired
    if (tokens.expiresAt && tokens.expiresAt < new Date()) {
      // Check if a refresh is already in progress for this user-provider combination
      const existingRefresh = tokenRefreshLock.getRefreshPromise(userId, provider);
      if (existingRefresh) {
        // Wait for the existing refresh to complete
        return existingRefresh;
      }

      // No refresh in progress, start a new one
      const refreshPromise = this.performTokenRefresh(userId, provider, tokens.refreshToken || null);
      tokenRefreshLock.setRefreshPromise(userId, provider, refreshPromise);
      
      return refreshPromise;
    }

    return tokens.accessToken;
  }

  /**
   * Perform token refresh with proper error handling
   */
  private async performTokenRefresh(
    userId: string,
    provider: string,
    refreshToken: string | null
  ): Promise<string> {
    if (!refreshToken) {
      throw OAuthError.invalidGrant(provider);
    }

    const oauthProvider = providerRegistry.get(provider);
    if (!oauthProvider) {
      throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    const newTokens = await oauthProvider.refreshToken(refreshToken);

    // Find the connection to update
    const connections = await this.dbOAuthService.getUserConnections(userId);
    const conn = connections.find(c => c.provider === provider);
    
    if (!conn) {
      throw new Error('OAuth connection not found');
    }

    // Update tokens
    await this.dbOAuthService.updateTokens(
      conn.id,
      newTokens.accessToken,
      newTokens.refreshToken,
      this.calculateExpiryDate(newTokens.expiresIn)
    );

    return newTokens.accessToken;
  }


  private calculateExpiryDate(expiresIn?: number): Date {
    if (!expiresIn) {
      // Default to 1 hour if not provided
      expiresIn = 3600;
    }

    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
    return expiryDate;
  }

  /**
   * Transaction-aware version of findOrCreateUser
   */
  private async findOrCreateUserInTransaction(
    email: string,
    provider: string,
    tx: any
  ) {
    // Check if user exists with this email
    const existingUser = await tx.user.findFirst({
      where: {
        linkedEmails: {
          some: {
            email: email.toLowerCase(),
          },
        },
      },
      include: {
        linkedEmails: true,
      },
    });

    if (existingUser) {
      // User exists - check if it's a new OAuth connection
      const connections = await tx.oAuthConnection.findMany({
        where: { userId: existingUser.id },
      });
      const hasThisConnection = connections.some(
        (c: any) => c.provider === provider && c.email === email
      );

      return {
        user: existingUser,
        isNewUser: false,
        isNewConnection: !hasThisConnection,
      };
    }

    // Create new user with $5 free credits within transaction
    const newUser = await tx.user.create({
      data: {
        primaryEmail: email,
        credits: 500, // $5.00 in cents
        linkedEmails: {
          create: {
            email: email.toLowerCase(),
            provider,
            isPrimary: true,
            verifiedAt: new Date(),
          },
        },
      },
      include: {
        linkedEmails: true,
      },
    });

    return {
      user: newUser,
      isNewUser: true,
      isNewConnection: true,
    };
  }

  /**
   * Transaction-aware version of storeTokens
   */
  private async storeTokensInTransaction(
    data: {
      userId: string;
      provider: string;
      email: string;
      scopes: string[];
      accessToken: string;
      refreshToken: string | null;
      expiresAt: Date;
    },
    tx: any
  ) {
    // Check if connection already exists
    const existing = await tx.oAuthConnection.findFirst({
      where: {
        userId: data.userId,
        provider: data.provider,
        email: data.email,
      },
    });

    if (existing) {
      // Update existing connection
      await tx.oAuthConnection.update({
        where: { id: existing.id },
        data: {
          scopes: data.scopes,
          accessToken: await crypto.encrypt(data.accessToken),
          refreshToken: data.refreshToken
            ? await crypto.encrypt(data.refreshToken)
            : null,
          expiresAt: data.expiresAt,
          lastUsedAt: new Date(),
        },
      });
    } else {
      // Create new connection
      await tx.oAuthConnection.create({
        data: {
          userId: data.userId,
          provider: data.provider,
          email: data.email,
          scopes: data.scopes,
          accessToken: await crypto.encrypt(data.accessToken),
          refreshToken: data.refreshToken
            ? await crypto.encrypt(data.refreshToken)
            : null,
          expiresAt: data.expiresAt,
        },
      });
    }
  }
}

// Singleton instance
export const oauthFlowService = new OAuthFlowService();