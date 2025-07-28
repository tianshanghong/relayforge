import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from '../src/crypto';

describe('CryptoService', () => {
  let crypto: CryptoService;

  beforeEach(() => {
    // Use a test encryption key
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    crypto = new CryptoService();
  });

  describe('constructor', () => {
    it('should throw error if ENCRYPTION_KEY is not provided', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => new CryptoService()).toThrow('ENCRYPTION_KEY environment variable is required');
    });

    it('should throw error if ENCRYPTION_KEY is wrong length', () => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef';
      expect(() => new CryptoService()).toThrow('ENCRYPTION_KEY must be 64 hex characters');
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plainText = 'Hello, World!';
      const encrypted = crypto.encrypt(plainText);
      
      expect(encrypted).not.toBe(plainText);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
      
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(plainText);
    });

    it('should produce different encrypted values for same input', () => {
      const plainText = 'test-token';
      const encrypted1 = crypto.encrypt(plainText);
      const encrypted2 = crypto.encrypt(plainText);
      
      expect(encrypted1).not.toBe(encrypted2); // Due to random IV
      expect(crypto.decrypt(encrypted1)).toBe(plainText);
      expect(crypto.decrypt(encrypted2)).toBe(plainText);
    });

    it('should handle empty strings', () => {
      const encrypted = crypto.encrypt('');
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle special characters', () => {
      const plainText = '!@#$%^&*()_+-={}[]|:";\'<>?,./\\`~';
      const encrypted = crypto.encrypt(plainText);
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(plainText);
    });

    it('should throw error for invalid encrypted text', () => {
      expect(() => crypto.decrypt('invalid-base64!')).toThrow();
    });
  });

  describe('hashEmail', () => {
    it('should hash email consistently', () => {
      const email = 'test@example.com';
      const hash1 = crypto.hashEmail(email);
      const hash2 = crypto.hashEmail(email);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex pattern
    });

    it('should normalize email before hashing', () => {
      const hash1 = crypto.hashEmail('Test@Example.COM');
      const hash2 = crypto.hashEmail('  test@example.com  ');
      const hash3 = crypto.hashEmail('test@example.com');
      
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce different hashes for different emails', () => {
      const hash1 = crypto.hashEmail('test1@example.com');
      const hash2 = crypto.hashEmail('test2@example.com');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateSessionId', () => {
    it('should generate session ID with default length', () => {
      const sessionId = crypto.generateSessionId();
      expect(sessionId).toHaveLength(36);
      expect(sessionId).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe characters
    });

    it('should generate session ID with custom length', () => {
      const sessionId = crypto.generateSessionId(48);
      expect(sessionId).toHaveLength(48);
    });

    it('should generate unique session IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(crypto.generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('hashPassword/verifyPassword', () => {
    it('should hash and verify password correctly', async () => {
      const password = 'SecurePassword123!';
      const hash = await crypto.hashPassword(password);
      
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
      
      const isValid = await crypto.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'SecurePassword123!';
      const hash = await crypto.hashPassword(password);
      
      const isValid = await crypto.verifyPassword('WrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should produce different hashes for same password', async () => {
      const password = 'TestPassword';
      const hash1 = await crypto.hashPassword(password);
      const hash2 = await crypto.hashPassword(password);
      
      expect(hash1).not.toBe(hash2); // Due to random salt
      expect(await crypto.verifyPassword(password, hash1)).toBe(true);
      expect(await crypto.verifyPassword(password, hash2)).toBe(true);
    });

    it('should handle empty password', async () => {
      const hash = await crypto.hashPassword('');
      const isValid = await crypto.verifyPassword('', hash);
      expect(isValid).toBe(true);
    });
  });
});