import { randomBytes, createCipheriv, createDecipheriv, createHash, pbkdf2, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export class CryptoService {
  private key: Buffer;

  constructor(encryptionKey?: string) {
    const key = encryptionKey || process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    // Ensure key is 32 bytes (256 bits)
    if (key.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    
    // Prevent using example/weak keys in production
    const weakKeys = [
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      '0000000000000000000000000000000000000000000000000000000000000000',
      '1111111111111111111111111111111111111111111111111111111111111111'
    ];
    
    if (process.env.NODE_ENV === 'production' && weakKeys.includes(key.toLowerCase())) {
      throw new Error('Cannot use example or weak encryption keys in production. Please generate a secure key using: openssl rand -hex 32');
    }
    
    this.key = Buffer.from(key, 'hex');
  }

  /**
   * Encrypts a string using AES-256-GCM
   * @param text The plain text to encrypt
   * @returns Base64 encoded encrypted string with format: iv:authTag:encrypted
   */
  encrypt(text: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv, authTag, and encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted]);
    
    return combined.toString('base64');
  }

  /**
   * Decrypts a string encrypted with encrypt()
   * @param encryptedText Base64 encoded encrypted string
   * @returns The decrypted plain text
   */
  decrypt(encryptedText: string): string {
    const combined = Buffer.from(encryptedText, 'base64');
    
    // Extract components
    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);
    
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }

  /**
   * Hashes an email for secure lookups
   * @param email The email to hash
   * @returns Hex encoded hash
   */
  hashEmail(email: string): string {
    const normalizedEmail = email.toLowerCase().trim();
    return createHash('sha256')
      .update(normalizedEmail)
      .digest('hex');
  }

  /**
   * Generates a secure random session ID
   * @param length The length of the session ID (default: 36)
   * @returns A URL-safe random string
   */
  generateSessionId(length: number = 36): string {
    return randomBytes(Math.ceil(length * 3/4))
      .toString('base64url')
      .slice(0, length);
  }

  /**
   * Hashes a password using bcrypt-compatible algorithm
   * @param password The password to hash
   * @returns The hashed password
   */
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    
    return new Promise((resolve, reject) => {
      pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else {
          const hash = Buffer.concat([salt, derivedKey]).toString('base64');
          resolve(hash);
        }
      });
    });
  }

  /**
   * Verifies a password against a hash
   * @param password The password to verify
   * @param hash The hash to verify against
   * @returns True if the password matches
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const hashBuffer = Buffer.from(hash, 'base64');
    const salt = hashBuffer.slice(0, SALT_LENGTH);
    const storedKey = hashBuffer.slice(SALT_LENGTH);
    
    return new Promise((resolve, reject) => {
      pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(timingSafeEqual(storedKey, derivedKey));
      });
    });
  }
}

// Export a singleton instance
export const crypto = new CryptoService();