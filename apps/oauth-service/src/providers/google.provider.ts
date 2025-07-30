import { OAuth2Client } from 'google-auth-library';
import { OAuthProvider, TokenSet, UserInfo } from './base.provider';
import { OAuthError } from '../utils/errors';
import { config } from '../config';

export class GoogleOAuthProvider implements OAuthProvider {
  name = 'google';
  authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  tokenUrl = 'https://oauth2.googleapis.com/token';
  scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar',
  ];

  private client: OAuth2Client;

  constructor(
    public clientId: string,
    public clientSecret: string,
    private redirectUri: string
  ) {
    this.client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri,
    });
  }

  getAuthorizationUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    // Add PKCE parameters if provided
    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    return `${this.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string, codeVerifier?: string): Promise<TokenSet> {
    try {
      const { tokens } = await this.client.getToken({
        code,
        codeVerifier
      });

      if (!tokens.access_token) {
        throw OAuthError.invalidGrant(this.name);
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresIn: tokens.expiry_date 
          ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
          : undefined,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if ('response' in error && (error as {response?: {data?: {error?: string}}}).response?.data?.error === 'invalid_grant') {
          throw OAuthError.invalidGrant(this.name);
        }
        throw OAuthError.providerError(this.name, error.message);
      }
      throw OAuthError.providerError(this.name, 'Unknown error occurred');
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    try {
      this.client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await this.client.refreshAccessToken();

      if (!credentials.access_token) {
        throw OAuthError.invalidGrant(this.name);
      }

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || undefined,
        expiresIn: credentials.expiry_date
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : undefined,
        tokenType: credentials.token_type || 'Bearer',
        scope: credentials.scope,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message?.includes('invalid_grant')) {
          throw OAuthError.invalidGrant(this.name);
        }
        throw OAuthError.providerError(this.name, error.message);
      }
      throw OAuthError.providerError(this.name, 'Unknown error occurred');
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        id: string;
        email: string;
        name?: string;
        picture?: string;
        verified_email?: boolean;
      };

      return {
        id: data.id,
        email: data.email,
        name: data.name,
        picture: data.picture,
        emailVerified: data.verified_email,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw OAuthError.providerError(this.name, error.message);
      }
      throw OAuthError.providerError(this.name, 'Unknown error occurred');
    }
  }

  validateScopes(grantedScopes: string): boolean {
    if (!grantedScopes) return false;
    
    const granted = grantedScopes.split(' ');
    const requiredScopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
    ];

    return requiredScopes.every(scope => granted.includes(scope));
  }
}

// Factory function
export function createGoogleProvider(): GoogleOAuthProvider {
  return new GoogleOAuthProvider(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
  );
}