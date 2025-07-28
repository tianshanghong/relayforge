import { OAuthService as DatabaseOAuthService, UserService } from '@relayforge/database';
import { providerRegistry } from '../providers/registry';
import { CSRFManager } from '../utils/csrf';
import { SessionManager } from '../utils/session';
import { OAuthError } from '../utils/errors';

export class OAuthFlowService {
  private dbOAuthService: DatabaseOAuthService;
  private userService: UserService;

  constructor() {
    this.dbOAuthService = new DatabaseOAuthService();
    this.userService = new UserService();
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

    // Validate scopes
    if (tokens.scope && !oauthProvider.validateScopes(tokens.scope)) {
      throw OAuthError.insufficientScope(provider, oauthProvider.scopes);
    }

    // Get user info
    const userInfo = await oauthProvider.getUserInfo(tokens.accessToken);

    // Find or create user
    const { user, isNewUser } = await this.findOrCreateUser(
      userInfo.email,
      provider
    );

    // Store OAuth tokens
    await this.dbOAuthService.storeTokens({
      userId: user.id,
      provider,
      email: userInfo.email,
      scopes: tokens.scope?.split(' ') || oauthProvider.scopes,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: this.calculateExpiryDate(tokens.expiresIn),
    });

    // Create session
    const { sessionUrl } = await SessionManager.createSession(user.id);

    return {
      sessionUrl,
      user: {
        id: user.id,
        email: user.primaryEmail,
        credits: user.credits,
        isNewUser,
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
      // Refresh token
      if (!tokens.refreshToken) {
        throw OAuthError.invalidGrant(provider);
      }

      const oauthProvider = providerRegistry.get(provider);
      if (!oauthProvider) {
        throw new Error(`Unknown OAuth provider: ${provider}`);
      }

      const newTokens = await oauthProvider.refreshToken(tokens.refreshToken);

      // Find the connection to update
      const connection = await this.dbOAuthService.getUserConnections(userId);
      const conn = connection.find(c => c.provider === provider);
      
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

    return tokens.accessToken;
  }

  /**
   * Private helper methods
   */
  private async findOrCreateUser(email: string, provider: string) {
    // Check if user exists with this email
    const existingUser = await this.userService.findUserByEmail(email);

    if (existingUser) {
      // User exists - check if it's a new OAuth connection
      const connections = await this.dbOAuthService.getUserConnections(
        existingUser.id
      );
      const hasThisConnection = connections.some(
        (c) => c.provider === provider && c.email === email
      );

      return {
        user: existingUser,
        isNewUser: false,
        isNewConnection: !hasThisConnection,
      };
    }

    // Create new user with $5 free credits
    const newUser = await this.userService.createUser({ email, provider, initialCredits: 500 });

    return {
      user: newUser,
      isNewUser: true,
      isNewConnection: true,
    };
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
}

// Singleton instance
export const oauthFlowService = new OAuthFlowService();