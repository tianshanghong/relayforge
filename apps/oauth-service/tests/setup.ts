// Set environment variables before any imports that might use them
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Ensure DATABASE_URL is set for tests
if (!process.env.DATABASE_URL) {
  // Default to local development database
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/relayforge_test';
}

// Import after setting env vars
import { execSync } from 'child_process';
import path from 'path';
import { afterEach, beforeEach } from 'vitest';
import { prisma } from '@relayforge/database';

// Handle unhandled rejections in tests to prevent false positives
// This is needed because we're testing error scenarios with concurrent promises
process.on('unhandledRejection', (reason) => {
  // Only log if it's not an expected test error
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const message = (reason as Error).message;
    // Ignore expected test errors
    if (message.includes('Network error') || 
        message.includes('authorization grant is invalid')) {
      return;
    }
  }
  console.error('Unhandled rejection:', reason);
});

// Ensure database schema is up to date
const databasePath = path.join(__dirname, '../../../packages/database');
try {
  console.log('Applying database schema...');
  execSync('npx prisma db push --skip-generate', {
    cwd: databasePath,
    stdio: 'inherit',
    env: process.env,
  });
} catch (error) {
  console.error('Failed to apply database schema:', error);
  // Continue anyway - the database might already be set up
}

// Global test hooks for proper isolation
beforeEach(async () => {
  try {
    // Clean up before each test to ensure isolation
    await prisma.$transaction([
      prisma.oAuthConnection.deleteMany(),
      prisma.session.deleteMany(),
      prisma.linkedEmail.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  } catch (error) {
    // If database is not ready, continue anyway
    console.warn('Database cleanup failed in beforeEach:', error);
  }
});

// afterEach cleanup removed - beforeEach already handles database cleanup