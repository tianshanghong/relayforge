#!/usr/bin/env tsx

/**
 * Validate environment variables for all services
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Load root .env
const rootEnvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

// Define schemas for each service
const rootEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-f]{64}$/i)
});

const oauthServiceSchema = z.object({
  PORT: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  COOKIE_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string(),
  FRONTEND_URL: z.string().url(),
  MCP_BASE_URL: z.string().url(),
  SESSION_DURATION_DAYS: z.string().optional(),
  ADMIN_KEY: z.string().min(32).optional(),
  // At least one OAuth provider must be configured
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
}).refine(
  (data) => data.GOOGLE_CLIENT_ID || data.GITHUB_CLIENT_ID || data.SLACK_CLIENT_ID,
  { message: 'At least one OAuth provider must be configured' }
);

const mcpGatewaySchema = z.object({
  PORT: z.string().optional(),
  HOST: z.string().optional(),
});

const frontendSchema = z.object({
  VITE_OAUTH_SERVICE_URL: z.string().url(),
  VITE_MCP_GATEWAY_URL: z.string().url(),
});

// Validation functions
function validateEnv(
  name: string,
  envPath: string,
  schema: z.ZodSchema,
  inheritedEnv: Record<string, string> = {}
): boolean {
  log(`\n📁 Validating ${name}...`, 'cyan');
  
  if (!fs.existsSync(envPath)) {
    log(`  ❌ ${envPath} not found`, 'red');
    log(`     Run: cp ${envPath}.example ${envPath}`, 'yellow');
    return false;
  }

  // Load env file
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  const combinedEnv = { ...inheritedEnv, ...envConfig };

  try {
    schema.parse(combinedEnv);
    log(`  ✅ All required variables are set`, 'green');
    
    // Additional checks
    if (combinedEnv.ENCRYPTION_KEY) {
      const weakKeys = [
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      ];
      if (weakKeys.includes(combinedEnv.ENCRYPTION_KEY.toLowerCase())) {
        log(`  ⚠️  Warning: Using example encryption key. Generate a secure key for production!`, 'yellow');
      }
    }
    
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      log(`  ❌ Validation failed:`, 'red');
      error.errors.forEach((err) => {
        log(`     - ${err.path.join('.')}: ${err.message}`, 'red');
      });
    } else {
      log(`  ❌ Unexpected error: ${error}`, 'red');
    }
    return false;
  }
}

// Test database connection
async function testDatabaseConnection(): Promise<boolean> {
  log('\n🔌 Testing database connection...', 'cyan');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    log('  ❌ DATABASE_URL not set', 'red');
    return false;
  }

  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.$disconnect();
    log('  ✅ Database connection successful', 'green');
    return true;
  } catch (error) {
    log(`  ❌ Database connection failed: ${error}`, 'red');
    log('     Make sure PostgreSQL is running and DATABASE_URL is correct', 'yellow');
    return false;
  }
}

// Main validation
async function main() {
  log('🔍 RelayForge Environment Validator', 'blue');
  log('===================================', 'blue');
  
  let allValid = true;

  // Validate root env
  const rootValid = validateEnv(
    'Root Environment',
    rootEnvPath,
    rootEnvSchema
  );
  allValid = allValid && rootValid;

  if (rootValid) {
    // Get root env for inheritance
    const rootEnv = dotenv.parse(fs.readFileSync(rootEnvPath));
    
    // Validate service envs
    allValid = validateEnv(
      'OAuth Service',
      path.join(process.cwd(), 'apps/oauth-service/.env'),
      oauthServiceSchema,
      rootEnv
    ) && allValid;

    allValid = validateEnv(
      'MCP Gateway',
      path.join(process.cwd(), 'apps/mcp-gateway/.env'),
      mcpGatewaySchema,
      rootEnv
    ) && allValid;

    allValid = validateEnv(
      'Frontend',
      path.join(process.cwd(), 'apps/frontend/.env'),
      frontendSchema,
      rootEnv
    ) && allValid;

    // Test database connection
    const dbValid = await testDatabaseConnection();
    allValid = allValid && dbValid;
  }

  // Summary
  log('\n' + '='.repeat(50), 'blue');
  if (allValid) {
    log('✅ All environment variables are properly configured!', 'green');
    log('\nYou can now run: pnpm dev', 'green');
    process.exit(0);
  } else {
    log('❌ Environment validation failed', 'red');
    log('\nPlease fix the errors above and run this script again', 'yellow');
    process.exit(1);
  }
}

main().catch((error) => {
  log(`Unexpected error: ${error}`, 'red');
  process.exit(1);
});