import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CryptoService } from '../../src/crypto';

describe('Production Encryption Key Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should reject weak keys in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(() => new CryptoService()).toThrow(
      'Cannot use example or weak encryption keys in production'
    );
  });

  it('should reject all zeros key in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

    expect(() => new CryptoService()).toThrow(
      'Cannot use example or weak encryption keys in production'
    );
  });

  it('should reject deadbeef pattern in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    expect(() => new CryptoService()).toThrow(
      'Cannot use example or weak encryption keys in production'
    );
  });

  it('should allow weak keys in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(() => new CryptoService()).not.toThrow();
  });

  it('should allow weak keys in test environment', () => {
    process.env.NODE_ENV = 'test';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(() => new CryptoService()).not.toThrow();
  });

  it('should accept strong keys in production', () => {
    process.env.NODE_ENV = 'production';
    // A properly generated random key
    process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';

    expect(() => new CryptoService()).not.toThrow();
  });

  it('should be case-insensitive when checking weak keys', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENCRYPTION_KEY = 'DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF';

    expect(() => new CryptoService()).toThrow(
      'Cannot use example or weak encryption keys in production'
    );
  });
});