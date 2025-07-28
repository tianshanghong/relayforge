import { beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { testHelpers } from '../helpers';

const prisma = new PrismaClient();

// Load environment variables
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/relayforge_perf_test?schema=public';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Performance test database
const perfDbName = 'relayforge_perf_test';
const perfDatabaseUrl = process.env.DATABASE_URL;

beforeAll(async () => {
  // Create performance test database
  try {
    const rootUrl = new URL(process.env.DATABASE_URL!);
    rootUrl.pathname = '/postgres';
    
    // Create database if it doesn't exist
    execSync(`psql "${rootUrl.toString()}" -c "CREATE DATABASE ${perfDbName}" 2>/dev/null || true`);
    
    // Push schema to test database
    execSync(`npx prisma db push --skip-generate`, {
      env: { ...process.env, DATABASE_URL: perfDatabaseUrl },
      stdio: 'ignore',
    });
    
    // Clean database once at start
    await testHelpers.cleanDatabase();
    
    console.log('Performance test database ready');
  } catch (error) {
    console.error('Failed to create performance test database:', error);
    throw error;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  
  // Optionally drop performance test database
  // We keep it for debugging purposes
  console.log('Performance tests completed');
});