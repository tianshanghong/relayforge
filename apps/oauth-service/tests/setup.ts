// Set environment variables before any imports that might use them
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Set required environment variables for tests
process.env.COOKIE_SECRET = 'test-cookie-secret-minimum-32-characters-long';
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.ADMIN_KEY = 'test-admin-key-minimum-32-characters-long';

// Ensure DATABASE_URL is set for tests
if (!process.env.DATABASE_URL) {
  // Default to local development database
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/relayforge_test';
}

// Import after setting env vars
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { afterEach, beforeEach } from 'vitest';
import { prisma } from '@relayforge/database';

// Get __dirname equivalent in ESM
const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure database schema is up to date
const databasePath = path.join(__dirname, '../../../packages/database');
try {
  console.log('Applying database schema...');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
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
    // Check if prisma.$transaction exists before using it
    if (prisma && typeof prisma.$transaction === 'function') {
      await prisma.$transaction(async (tx) => {
        await tx.oAuthConnection.deleteMany();
        await tx.session.deleteMany();
        await tx.linkedEmail.deleteMany();
        await tx.user.deleteMany();
      });
    } else {
      // Fallback to individual deletes if transaction is not available
      await prisma.oAuthConnection.deleteMany();
      await prisma.session.deleteMany();
      await prisma.linkedEmail.deleteMany();
      await prisma.user.deleteMany();
    }
  } catch (error) {
    // If database is not ready, continue anyway
    console.warn('Database cleanup failed in beforeEach:', error);
  }
});

afterEach(async () => {
  try {
    // Clean up after each test
    // Check if prisma.$transaction exists before using it
    if (prisma && typeof prisma.$transaction === 'function') {
      await prisma.$transaction(async (tx) => {
        await tx.oAuthConnection.deleteMany();
        await tx.session.deleteMany();
        await tx.linkedEmail.deleteMany();
        await tx.user.deleteMany();
      });
    } else {
      // Fallback to individual deletes if transaction is not available
      await prisma.oAuthConnection.deleteMany();
      await prisma.session.deleteMany();
      await prisma.linkedEmail.deleteMany();
      await prisma.user.deleteMany();
    }
  } catch (error) {
    // If database is not ready, continue anyway
    console.warn('Database cleanup failed in afterEach:', error);
  }
});

// Helper function to build test app
export async function build() {
  const { default: Fastify } = await import('fastify');
  const { default: cors } = await import('@fastify/cors');
  const { default: cookie } = await import('@fastify/cookie');
  const { authRoutes } = await import('../src/routes/auth.routes');
  const { accountRoutes } = await import('../src/routes/account.routes');
  const { sessionRoutes } = await import('../src/routes/session.routes');
  const { errorHandler } = await import('../src/middleware/error-handler');

  const app = Fastify({
    logger: false, // Disable logging in tests
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie, {
    secret: 'test-secret-key-for-cookies-minimum-32-chars',
  });

  // Set error handler
  app.setErrorHandler(errorHandler);

  // Register routes
  await app.register(authRoutes, { prefix: '/oauth' });
  await app.register(accountRoutes, { prefix: '/api/account' });
  await app.register(sessionRoutes);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}