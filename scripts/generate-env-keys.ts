#!/usr/bin/env tsx

/**
 * Generate secure keys for environment variables
 */

import { randomBytes } from 'crypto';

function generateKey(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

console.log('🔐 RelayForge Environment Key Generator\n');

console.log('# Encryption Key (for OAuth tokens)');
console.log(`ENCRYPTION_KEY=${generateKey()}`);
console.log('');

console.log('# OAuth Service Keys');
console.log(`COOKIE_SECRET=${generateKey()}`);
console.log(`JWT_SECRET=${generateKey()}`);
console.log(`ADMIN_KEY=${generateKey()}`);
console.log('');

console.log('# Service-to-Service Communication');
console.log(`INTERNAL_API_KEY=${generateKey()}`);
console.log('');

console.log('✅ Keys generated successfully!');
console.log('');
console.log('📋 Copy these values to your .env files');
console.log('⚠️  Keep these keys secure and never commit them to git');
console.log('');
console.log('💡 Tips:');
console.log('- Use different keys for development and production');
console.log('- Rotate keys regularly');
console.log('- Store production keys in a secure secret management system');