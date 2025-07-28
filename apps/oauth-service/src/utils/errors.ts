export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public provider?: string
  ) {
    super(message);
    this.name = 'OAuthError';
  }

  static invalidGrant(provider: string) {
    return new OAuthError(
      'INVALID_GRANT',
      'The authorization grant is invalid, expired, or revoked',
      400,
      provider
    );
  }

  static insufficientScope(provider: string, requiredScopes: string[]) {
    return new OAuthError(
      'INSUFFICIENT_SCOPE',
      `User did not grant required permissions: ${requiredScopes.join(', ')}`,
      403,
      provider
    );
  }

  static providerError(provider: string, message: string) {
    return new OAuthError(
      'PROVIDER_ERROR',
      `OAuth provider error: ${message}`,
      502,
      provider
    );
  }

  static accountLinkingRequired(email: string) {
    return new OAuthError(
      'ACCOUNT_LINKING_REQUIRED',
      `Email ${email} is already associated with another account`,
      409
    );
  }

  static invalidState() {
    return new OAuthError(
      'INVALID_STATE',
      'Invalid or expired state parameter',
      400
    );
  }

  static missingCode() {
    return new OAuthError(
      'MISSING_CODE',
      'Authorization code is missing',
      400
    );
  }

  static userDenied() {
    return new OAuthError(
      'USER_DENIED',
      'User denied the authorization request',
      400
    );
  }
}