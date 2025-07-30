import { beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    execSync(`npx prisma db push --skip-generate`, {
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'inherit', // Show output for debugging
    });
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
});

beforeEach(async () => {
  try {
    // Clean all tables before each test using Prisma's deleteMany
    // This avoids table lock issues
    await prisma.$transaction([
      prisma.usage.deleteMany(),
      prisma.session.deleteMany(),
      prisma.oAuthConnection.deleteMany(),
      prisma.linkedEmail.deleteMany(),
      prisma.user.deleteMany(),
      prisma.servicePricing.deleteMany(),
    ]);
    
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