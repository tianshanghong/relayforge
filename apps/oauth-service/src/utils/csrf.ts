import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

interface StatePayload {
  csrf: string;
  provider: string;
  timestamp: number;
  redirectUrl?: string;
}

export class CSRFManager {
  private static readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  static generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static createState(provider: string, redirectUrl?: string): string {
    const payload: StatePayload = {
      csrf: this.generateToken(),
      provider,
      timestamp: Date.now(),
      redirectUrl,
    };

    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: '10m',
    });
  }

  static validateState(state: string): StatePayload {
    try {
      const payload = jwt.verify(state, config.JWT_SECRET) as StatePayload;
      
      // Additional timestamp check
      if (Date.now() - payload.timestamp > this.STATE_EXPIRY_MS) {
        throw new Error('State expired');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid state parameter');
    }
  }
}