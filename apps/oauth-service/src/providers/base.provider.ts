export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

export interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  
  // Generate authorization URL
  getAuthorizationUrl(state: string, codeChallenge?: string): string;
  
  // Exchange authorization code for tokens
  exchangeCode(code: string, codeVerifier?: string): Promise<TokenSet>;
  
  // Refresh access token
  refreshToken(refreshToken: string): Promise<TokenSet>;
  
  // Get user information
  getUserInfo(accessToken: string): Promise<UserInfo>;
  
  // Validate required scopes
  validateScopes(grantedScopes: string): boolean;
}