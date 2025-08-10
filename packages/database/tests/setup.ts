import { beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const packageRoot = path.resolve(__dirname, '..');

// Load environment variables
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/relayforge_test?schema=public';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Generate a unique database URL for each test suite
const generateDatabaseURL = (name: string) => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  return url.toString();
};

// Test database name - use a fixed name since we're running sequentially
const testDbName = `relayforge_test`;
let testDatabaseUrl = generateDatabaseURL(testDbName);

beforeAll(async () => {
  // Create test database
  try {
    // Always use relayforge_test database
    testDatabaseUrl = generateDatabaseURL(testDbName);
    
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for running tests');
    }
    
    const rootUrl = new URL(process.env.DATABASE_URL);
    rootUrl.pathname = '/postgres';
    
    // Try to create the test database (will succeed if doesn't exist, no-op if exists)
    try {
      execSync(`psql "${rootUrl.toString()}" -c "CREATE DATABASE ${testDbName}" 2>/dev/null || true`);
    } catch (e) {
      // If psql fails, try using the test database directly
      console.log('Note: Could not create test database, will attempt to use it directly');
      
      // Verify we can connect to the test database
      try {
        execSync(`psql "${testDatabaseUrl}" -c "SELECT 1" > /dev/null 2>&1`);
      } catch (connectError) {
        throw new Error(
          `Cannot connect to test database at ${testDatabaseUrl}. ` +
          `Please ensure PostgreSQL is running and the database exists.`
        );
      }
    }
    
    // Set the test database URL
    process.env.DATABASE_URL = testDatabaseUrl;
    
    // Push schema to test database
    try {
      console.log('Setting up test database with URL:', testDatabaseUrl);
      console.log('Working directory:', packageRoot);
      console.log('Schema file exists:', require('fs').existsSync(path.join(packageRoot, 'prisma', 'schema.prisma')));
      
      // First, generate Prisma client
      console.log('Generating Prisma client...');
      execSync(`npx prisma generate`, {
        env: { ...process.env, DATABASE_URL: testDatabaseUrl },
        stdio: 'inherit',
        cwd: packageRoot,
      });
      
      // Then push schema to test database using migrate deploy
      console.log('Pushing schema to test database...');
      try {
        // Try using migrate deploy first (for existing migrations)
        execSync(`npx prisma migrate deploy`, {
          env: { ...process.env, DATABASE_URL: testDatabaseUrl },
          stdio: 'inherit',
          cwd: packageRoot,
        });
      } catch (migrateError) {
        // If migrate fails, fall back to db push
        console.log('Migrate deploy failed, falling back to db push:', migrateError.message);
        execSync(`npx prisma db push --skip-generate --accept-data-loss`, {
          env: { ...process.env, DATABASE_URL: testDatabaseUrl },
          stdio: 'inherit',
          cwd: packageRoot,
        });
      }
      
      // Verify tables were created
      const verifyQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'sessions', 'usage', 'linked_emails', 'oauth_connections', 'service_pricing')
        ORDER BY table_name;
      `;
      
      console.log('Verifying tables were created...');
      // Remove schema parameter for psql command
      const psqlUrl = testDatabaseUrl.replace('?schema=public', '');
      const tables = execSync(`psql "${psqlUrl}" -t -c "${verifyQuery}"`, {
        encoding: 'utf8',
      }).trim();
      
      console.log('Created tables:', tables.split('\n').map(t => t.trim()).filter(Boolean));
      
      if (!tables.includes('users') || !tables.includes('usage')) {
        throw new Error('Tables were not created properly. Found tables: ' + tables);
      }
    } catch (pushError) {
      console.error('Failed to push schema to test database:', pushError);
      throw new Error(`Schema push failed. Ensure DATABASE_URL is correct: ${testDatabaseUrl}`);
    }
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
});

beforeEach(async () => {
  try {
    // Clean all tables before each test using Prisma's deleteMany
    // This avoids table lock issues
    await prisma.$transaction(async (tx) => {
      await tx.usage.deleteMany();
      await tx.session.deleteMany();
      await tx.oAuthConnection.deleteMany();
      await tx.mcpToken.deleteMany();
      await tx.linkedEmail.deleteMany();
      await tx.user.deleteMany();
      await tx.servicePricing.deleteMany();
    });
    
    // Reset test helper counters
    const { resetTestHelpers } = await import('./helpers');
    resetTestHelpers();
  } catch (error) {
    console.warn('Database cleanup failed in beforeEach:', error);
    // Continue anyway - the test might still work
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  
  // Drop test database
  try {
    const rootUrl = new URL(process.env.DATABASE_URL!);
    rootUrl.pathname = '/postgres';
    
    execSync(`psql "${rootUrl.toString()}" -c "DROP DATABASE IF EXISTS ${testDbName}" 2>/dev/null || true`);
  } catch (error) {
    console.error('Failed to drop test database:', error);
  }
});