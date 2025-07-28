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
const testDatabaseUrl = generateDatabaseURL(testDbName);

beforeAll(async () => {
  // Create test database
  try {
    const rootUrl = new URL(process.env.DATABASE_URL!);
    const originalDb = rootUrl.pathname.slice(1).split('?')[0];
    rootUrl.pathname = '/postgres';
    
    // Create database if it doesn't exist
    execSync(`psql "${rootUrl.toString()}" -c "CREATE DATABASE ${testDbName}" 2>/dev/null || true`);
    
    // Set the test database URL
    process.env.DATABASE_URL = testDatabaseUrl;
    
    // Push schema to test database
    execSync(`npx prisma db push --skip-generate`, {
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'ignore',
    });
  } catch (error) {
    console.error('Failed to create test database:', error);
    throw error;
  }
});

beforeEach(async () => {
  // Clean all tables before each test using Prisma's deleteMany
  // This avoids table lock issues
  await prisma.usage.deleteMany();
  await prisma.session.deleteMany();
  await prisma.oAuthConnection.deleteMany();
  await prisma.linkedEmail.deleteMany();
  await prisma.user.deleteMany();
  await prisma.servicePricing.deleteMany();
  
  // Reset test helper counters
  const { resetTestHelpers } = await import('./helpers');
  resetTestHelpers();
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