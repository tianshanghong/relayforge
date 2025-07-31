export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'GatewayError';
    Object.setPrototypeOf(this, GatewayError.prototype);
  }
}

export class AuthenticationError extends GatewayError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class ServiceNotFoundError extends GatewayError {
  constructor(service: string) {
    super(`Service not found: ${service}`, 'SERVICE_NOT_FOUND', 404);
    this.name = 'ServiceNotFoundError';
  }
}

export class OAuthTokenError extends GatewayError {
  constructor(provider: string, reason: string, details?: any) {
    super(
      `Failed to obtain OAuth token for ${provider}: ${reason}`,
      'OAUTH_TOKEN_ERROR',
      401,
      details
    );
    this.name = 'OAuthTokenError';
  }
}

export class ProviderNotMappedError extends GatewayError {
  constructor(service: string) {
    super(
      `No OAuth provider mapped for service: ${service}`,
      'PROVIDER_NOT_MAPPED',
      500
    );
    this.name = 'ProviderNotMappedError';
  }
}