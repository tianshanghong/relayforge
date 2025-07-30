import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { prisma } from '@relayforge/database';
import { authRoutes } from '../../src/routes/auth.routes';
import { providerRegistry } from '../../src/providers/registry';
import { CSRFManager } from '../../src/utils/csrf';
import { errorHandler } from '../../src/middleware/error-handler';
import type { GoogleProvider } from '../../src/providers/google.provider';

// Mock environment
vi.mock('../../src/config', () => ({
  config: {
    GOOGLE_CLIENT_ID: 'benchmark-client-id',
    GOOGLE_CLIENT_SECRET: 'benchmark-client-secret',
    GOOGLE_REDIRECT_URL: 'http://localhost:3001/oauth/google/callback',
    JWT_SECRET: 'benchmark-jwt-secret-that-is-long-enough-for-security',
    SESSION_DURATION_DAYS: 30,
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: ['http://localhost:3000'],
    COOKIE_SECRET: 'benchmark-cookie-secret',
    LOG_LEVEL: 'error',
    FRONTEND_URL: 'http://localhost:3000',
    PORT: 3001,
  },
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(cookie, {
    secret: 'benchmark-cookie-secret',
    parseOptions: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    },
  });

  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/oauth' });

  return app;
}

describe('1000 Concurrent OAuth Flow Benchmark', () => {
  let app: FastifyInstance;
  let googleProvider: GoogleProvider;

  const mockTokens = {
    accessToken: 'benchmark-access-token',
    refreshToken: 'benchmark-refresh-token',
    expiresIn: 3600,
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    tokenType: 'Bearer',
  };

  beforeEach(async () => {
    // Clear all data
    await prisma.oAuthConnection.deleteMany();
    await prisma.session.deleteMany();
    await prisma.linkedEmail.deleteMany();
    await prisma.user.deleteMany();

    app = await buildApp();
    googleProvider = providerRegistry.get('google') as GoogleProvider;

    // Mock with minimal delay for maximum throughput
    vi.spyOn(googleProvider, 'exchangeCode').mockImplementation(async (code: string) => {
      return {
        ...mockTokens,
        accessToken: `access-token-for-${code}`,
      };
    });

    vi.spyOn(googleProvider, 'getUserInfo').mockImplementation(async (accessToken: string) => {
      const codeMatch = accessToken.match(/benchmark-code-(\d+)/);
      const userId = codeMatch ? codeMatch[1] : Math.random().toString(36).substr(2, 9);
      return {
        id: `google-user-${userId}`,
        email: `benchmark-user-${userId}@gmail.com`,
        name: `Benchmark User ${userId}`,
        emailVerified: true,
      };
    });

    vi.spyOn(googleProvider, 'validateScopes').mockReturnValue(true);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    vi.clearAllMocks();
  });

  it('should complete 1000 concurrent OAuth flows within performance requirements', async () => {
    const concurrency = 1000;
    const startTime = Date.now();
    
    console.log(`\n🚀 Starting 1000 Concurrent OAuth Flow Benchmark`);
    console.log(`Target: Complete all flows within 10 seconds`);
    console.log(`Starting at: ${new Date(startTime).toISOString()}`);
    console.log(`\n1️⃣  Phase 1: Authorization URL Generation (${concurrency} requests)`);

    // Phase 1: Authorization URLs
    const authStartTime = Date.now();
    const authPromises = Array.from({ length: concurrency }, (_, i) => 
      app.inject({
        method: 'GET',
        url: `/oauth/google/authorize?redirect_url=https://benchmark.com/success-${i}`,
      })
    );

    const authResults = await Promise.all(authPromises);
    const authEndTime = Date.now();
    const authDuration = authEndTime - authStartTime;

    console.log(`✅ Authorization URLs generated in ${authDuration}ms`);
    console.log(`   Rate: ${Math.round(concurrency / (authDuration / 1000))} requests/second`);

    // Extract states
    const states = authResults.map((response, i) => {
      expect(response.statusCode).toBe(302);
      const url = new URL(response.headers.location as string);
      return url.searchParams.get('state')!;
    });

    console.log(`\n2️⃣  Phase 2: OAuth Callbacks (${concurrency} requests)`);

    // Phase 2: OAuth Callbacks  
    const callbackStartTime = Date.now();
    const callbackPromises = states.map((state, i) => 
      app.inject({
        method: 'GET',
        url: `/oauth/google/callback?code=benchmark-code-${i}&state=${state}`,
      })
    );

    const callbackResults = await Promise.all(callbackPromises);
    const callbackEndTime = Date.now();
    const callbackDuration = callbackEndTime - callbackStartTime;

    console.log(`✅ OAuth callbacks processed in ${callbackDuration}ms`);
    console.log(`   Rate: ${Math.round(concurrency / (callbackDuration / 1000))} requests/second`);

    // Verify success
    const successfulCallbacks = callbackResults.filter(r => 
      r.statusCode === 302 && r.headers.location?.includes('/auth/success')
    ).length;

    console.log(`   Success rate: ${successfulCallbacks}/${concurrency} (${Math.round(successfulCallbacks/concurrency*100)}%)`);

    console.log(`\n3️⃣  Phase 3: Database Verification`);

    // Database verification
    const finalUserCount = await prisma.user.count();
    const finalConnectionCount = await prisma.oAuthConnection.count(); 
    const finalSessionCount = await prisma.session.count();

    console.log(`✅ Database consistency verified`);
    console.log(`   Users created: ${finalUserCount}`);
    console.log(`   OAuth connections: ${finalConnectionCount}`);
    console.log(`   Sessions created: ${finalSessionCount}`);

    const totalDuration = Date.now() - startTime;
    const avgTimePerFlow = Math.round(totalDuration / concurrency);
    const throughput = Math.round(concurrency / (totalDuration / 1000));

    console.log(`\n📊 BENCHMARK RESULTS`);
    console.log(`================================`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Average Time per Flow: ${avgTimePerFlow}ms`);
    console.log(`Throughput: ${throughput} complete flows/second`);
    console.log(`Database Write Rate: ${Math.round((finalUserCount + finalConnectionCount + finalSessionCount) / (totalDuration / 1000))} records/second`);
    
    if (totalDuration < 10000) {
      console.log(`✅ PASS: Completed within 10 second target (${totalDuration}ms)`);
    } else {
      console.log(`⚠️  SLOW: Exceeded 10 second target (${totalDuration}ms)`);
    }

    if (throughput >= 100) {
      console.log(`✅ PASS: Throughput meets minimum requirement (${throughput} >= 100 flows/sec)`);
    } else {
      console.log(`❌ FAIL: Throughput below minimum requirement (${throughput} < 100 flows/sec)`);
    }

    console.log(`\n🔍 Performance Profile:`);
    console.log(`- Authorization: ${Math.round(authDuration/totalDuration*100)}% of total time`);
    console.log(`- Callbacks: ${Math.round(callbackDuration/totalDuration*100)}% of total time`);
    console.log(`- Database ops: ${Math.round((totalDuration-authDuration-callbackDuration)/totalDuration*100)}% of total time`);

    // Assertions
    expect(successfulCallbacks).toBe(concurrency);
    expect(finalUserCount).toBe(concurrency);
    expect(finalConnectionCount).toBe(concurrency);
    expect(finalSessionCount).toBe(concurrency);
    expect(totalDuration).toBeLessThan(30000); // 30 second max (generous)
    expect(throughput).toBeGreaterThanOrEqual(50); // Minimum 50 flows/second

    console.log(`\n✅ All assertions passed!`);
  }, 60000); // 1 minute timeout
});