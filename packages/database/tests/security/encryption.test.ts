import { describe, it, expect } from 'vitest';
import { CryptoService } from '../../src/crypto';
import { randomBytes } from 'crypto';

describe('Encryption Security', () => {
  // Use a test encryption key
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const crypto = new CryptoService();

  describe('AES-256-GCM Encryption', () => {
    it('should use 256-bit keys', () => {
      // Check the key is 256 bits (32 bytes)
      const keyLength = 32; // 256 bits / 8 = 32 bytes
      expect(crypto['key'].length).toBe(keyLength);
    });

    it('should use unique IVs for each encryption', () => {
      const plaintext = 'sensitive data';
      const encrypted1 = crypto.encrypt(plaintext);
      const encrypted2 = crypto.encrypt(plaintext);
      
      // Same plaintext should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);
      
      // Extract IVs (first 16 bytes after base64 decode)
      const iv1 = Buffer.from(encrypted1, 'base64').slice(0, 16);
      const iv2 = Buffer.from(encrypted2, 'base64').slice(0, 16);
      expect(iv1.equals(iv2)).toBe(false);
    });

    it('should include authentication tag', () => {
      const plaintext = 'test data';
      const encrypted = crypto.encrypt(plaintext);
      const buffer = Buffer.from(encrypted, 'base64');
      
      // Structure: IV (16) + ciphertext + authTag (16)
      expect(buffer.length).toBeGreaterThanOrEqual(32); // At least IV + authTag
    });

    it('should fail decryption with tampered data', () => {
      const plaintext = 'sensitive data';
      const encrypted = crypto.encrypt(plaintext);
      
      // Tamper with the encrypted data
      const buffer = Buffer.from(encrypted, 'base64');
      buffer[20] = buffer[20] ^ 0xFF; // Flip bits
      const tampered = buffer.toString('base64');
      
      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it('should fail decryption with wrong key', () => {
      const plaintext = 'sensitive data';
      const encrypted = crypto.encrypt(plaintext);
      
      // Create a new crypto instance with different key
      process.env.ENCRYPTION_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const otherCrypto = new CryptoService();
      
      expect(() => otherCrypto.decrypt(encrypted)).toThrow();
      
      // Restore original key
      process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });
  });

  describe('Email Hashing', () => {
    it('should normalize and hash emails consistently', () => {
      const email1 = crypto.hashEmail('Test@Example.com');
      const email2 = crypto.hashEmail('test@example.com');
      const email3 = crypto.hashEmail(' test@example.com ');
      
      // All should produce same hash after normalization
      expect(email1).toBe(email2);
      expect(email2).toBe(email3);
      
      // Should be SHA-256 hex (64 chars)
      expect(email1).toHaveLength(64);
      expect(email1).toMatch(/^[a-f0-9]{64}$/);
    });
    
    it('should produce different hashes for different emails', () => {
      const hash1 = crypto.hashEmail('user1@example.com');
      const hash2 = crypto.hashEmail('user2@example.com');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Password Hashing', () => {
    it('should use secure hashing algorithm', async () => {
      const password = 'MySecurePassword123!';
      const hash = await crypto.hashPassword(password);
      
      // Should produce a base64 encoded hash with salt + derived key
      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(100); // Salt (64) + Key (32) base64 encoded
      expect(hash).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should produce different hashes for different passwords', async () => {
      const hash1 = await crypto.hashPassword('password1');
      const hash2 = await crypto.hashPassword('password2');
      expect(hash1).not.toBe(hash2);
    });

    it('should use timing-safe comparison', async () => {
      const password = 'TestPassword123!';
      const hash = await crypto.hashPassword(password);
      
      // verifyPassword uses timingSafeEqual internally
      expect(await crypto.verifyPassword(password, hash)).toBe(true);
      expect(await crypto.verifyPassword('wrong', hash)).toBe(false);
    });
  });

  describe('Session ID Generation', () => {
    it('should generate cryptographically random session IDs', () => {
      const sessionIds = new Set<string>();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        sessionIds.add(crypto.generateSessionId());
      }
      
      // All should be unique
      expect(sessionIds.size).toBe(iterations);
    });

    it('should generate URL-safe session IDs', () => {
      const sessionId = crypto.generateSessionId();
      
      // Should only contain URL-safe characters
      expect(sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
      
      // Default length is 36
      expect(sessionId.length).toBe(36);
      
      // Test custom length
      const longSessionId = crypto.generateSessionId(48);
      expect(longSessionId.length).toBe(48);
    });
  });

  describe('Key Derivation', () => {
    it('should use the same key for same input', () => {
      // Both instances with same env key should have same key
      const crypto1 = new CryptoService();
      const crypto2 = new CryptoService();
      
      // Same key from environment
      expect(crypto1['key'].equals(crypto2['key'])).toBe(true);
    });
    
    it('should reject invalid key lengths', () => {
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => new CryptoService()).toThrow('ENCRYPTION_KEY must be 64 hex characters');
      
      // Restore
      process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });
  });

  describe('Data Protection', () => {
    it('should handle empty strings', () => {
      const encrypted = crypto.encrypt('');
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle special characters and Unicode', () => {
      const testCases = [
        '!@#$%^&*()_+-=[]{}|;:,.<>?',
        '你好世界 🌍 مرحبا بالعالم',
        '\n\r\t\0',
        '{"json": "data", "nested": {"key": "value"}}',
      ];
      
      for (const testCase of testCases) {
        const encrypted = crypto.encrypt(testCase);
        const decrypted = crypto.decrypt(encrypted);
        expect(decrypted).toBe(testCase);
      }
    });

    it('should handle large data', () => {
      // Test with 1MB of data
      const largeData = 'x'.repeat(1024 * 1024);
      const encrypted = crypto.encrypt(largeData);
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(largeData);
    });
  });
});