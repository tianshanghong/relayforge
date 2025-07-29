import { describe, it, expect, vi } from 'vitest';

// Mock the config module before importing GoogleOAuthProvider
vi.mock('../config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    OAUTH_REDIRECT_BASE_URL: 'http://localhost:3002',
    COOKIE_SECRET: 'test-cookie-secret',
    JWT_SECRET: 'test-jwt-secret'
  }
}));

import { GoogleOAuthProvider } from './google.provider';

describe('GoogleOAuthProvider', () => {
  it('should create provider instance', () => {
    const provider = new GoogleOAuthProvider(
      'test-client-id',
      'test-client-secret',
      'http://localhost:3002/oauth/google/callback'
    );

    expect(provider.name).toBe('google');
    expect(provider.clientId).toBe('test-client-id');
    expect(provider.clientSecret).toBe('test-client-secret');
  });

  it('should generate authorization URL with required parameters', () => {
    const provider = new GoogleOAuthProvider(
      'test-client-id',
      'test-client-secret',
      'http://localhost:3002/oauth/google/callback'
    );

    const state = 'test-state';
    const authUrl = provider.getAuthorizationUrl(state);

    expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl).toContain('client_id=test-client-id');
    expect(authUrl).toContain('state=test-state');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain('access_type=offline');
  });

  it('should validate required scopes correctly', () => {
    const provider = new GoogleOAuthProvider(
      'test-client-id',
      'test-client-secret',
      'http://localhost:3002/oauth/google/callback'
    );

    // Test with all required scopes
    const validScopes = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar';
    expect(provider.validateScopes(validScopes)).toBe(true);

    // Test with missing calendar scope
    const invalidScopes = 'https://www.googleapis.com/auth/userinfo.email';
    expect(provider.validateScopes(invalidScopes)).toBe(false);

    // Test with empty scopes
    expect(provider.validateScopes('')).toBe(false);
  });
});