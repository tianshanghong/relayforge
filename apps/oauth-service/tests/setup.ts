// Set environment variables before any imports that might use them
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Ensure DATABASE_URL is set for tests
if (!process.env.DATABASE_URL) {
  // Use the local dev database for tests if available (port 5433)
  // Otherwise use default postgres port 5432 for CI
  const port = process.env.CI ? '5432' : '5433';
  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/relayforge_dev`;
}

// Import after setting env vars
import { execSync } from 'child_process';
import path from 'path';

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