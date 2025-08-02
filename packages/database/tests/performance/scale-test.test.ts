import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src';
import { testHelpers } from '../helpers';
import { performance } from 'perf_hooks';

// This test is skipped by default due to its resource requirements
// Remove .skip to run the full 100k user scale test
describe.skip('100k User Scale Test', () => {
  const TOTAL_USERS = 100000;
  const BATCH_SIZE = 5000;
  const TARGET_LOOKUP_TIME_MS = 10;
  
  beforeAll(async () => {
    console.log('🚀 Starting 100k user scale test setup...');
    console.log('⚠️  This will take several minutes and requires sufficient database resources');
    
    await testHelpers.cleanDatabase();
    await testHelpers.seedServicePricing();
    
    const startTime = performance.now();
    
    // Create users in batches
    for (let batch = 0; batch < TOTAL_USERS / BATCH_SIZE; batch++) {
      const users = [];
      const emails = [];
      const sessions = [];
      
      for (let i = 0; i < BATCH_SIZE; i++) {
        const userIndex = batch * BATCH_SIZE + i;
        const userId = `scale-user-${userIndex}`;
        const email = `scale-${userIndex}@example.com`;
        
        users.push({
          id: userId,
          primaryEmail: email,
          credits: 500,
        });
        
        emails.push({
          userId,
          email,
          provider: 'google',
          isPrimary: true,
        });
        
        // Create session for 10% of users
        if (i % 10 === 0) {
          sessions.push({
            sessionId: `scale-session-${userIndex}`,
            userId,
            expiresAt: new Date(Date.now() + 86400000),
          });
        }
      }
      
      await prisma.$transaction(async (tx) => {
        await tx.user.createMany({ data: users });
        await tx.linkedEmail.createMany({ data: emails });
        if (sessions.length > 0) {
          await tx.session.createMany({ data: sessions });
        }
      });
      
      console.log(`  Progress: ${((batch + 1) * BATCH_SIZE).toLocaleString()} / ${TOTAL_USERS.toLocaleString()} users`);
    }
    
    // Add OAuth connections for 5% of users
    console.log('  Adding OAuth connections...');
    const oauthBatch = [];
    for (let i = 0; i < TOTAL_USERS / 20; i++) {
      oauthBatch.push({
        userId: `scale-user-${i}`,
        provider: 'google',
        email: `scale-${i}@example.com`,
        scopes: ['calendar.read'],
        accessToken: 'encrypted-token',
        expiresAt: new Date(Date.now() + 3600000),
      });
      
      if (oauthBatch.length === 1000) {
        await prisma.oAuthConnection.createMany({ data: oauthBatch });
        oauthBatch.length = 0;
      }
    }
    
    if (oauthBatch.length > 0) {
      await prisma.oAuthConnection.createMany({ data: oauthBatch });
    }
    
    // Create usage history for active users
    console.log('  Adding usage history...');
    const usageBatch = [];
    const activeUserCount = TOTAL_USERS / 10; // 10% active users
    
    for (let i = 0; i < activeUserCount; i++) {
      const userId = `scale-user-${i * 10}`;
      const identifier = `scale-session-${i * 10}`;
      
      // Each active user has 10 usage records
      for (let j = 0; j < 10; j++) {
        usageBatch.push({
          userId,
          identifier,
          service: j % 2 === 0 ? 'google-calendar' : 'openai',
          credits: j % 2 === 0 ? 2 : 1,
          success: true,
          timestamp: new Date(Date.now() - j * 3600000), // Spread over last 10 hours
        });
      }
      
      if (usageBatch.length >= 1000) {
        await prisma.usage.createMany({ data: usageBatch });
        usageBatch.length = 0;
      }
    }
    
    if (usageBatch.length > 0) {
      await prisma.usage.createMany({ data: usageBatch });
    }
    
    const setupTime = (performance.now() - startTime) / 1000;
    console.log(`✅ Setup completed in ${setupTime.toFixed(2)} seconds`);
    
    // Get database statistics
    const stats = await prisma.$transaction([
      prisma.user.count(),
      prisma.linkedEmail.count(),
      prisma.session.count(),
      prisma.oAuthConnection.count(),
      prisma.usage.count(),
    ]);
    
    console.log('\n📊 Database Statistics:');
    console.log(`  Users: ${stats[0].toLocaleString()}`);
    console.log(`  Linked Emails: ${stats[1].toLocaleString()}`);
    console.log(`  Sessions: ${stats[2].toLocaleString()}`);
    console.log(`  OAuth Connections: ${stats[3].toLocaleString()}`);
    console.log(`  Usage Records: ${stats[4].toLocaleString()}`);
  }, 1200000); // 20 minute timeout

  afterAll(async () => {
    console.log('🧹 Cleaning up scale test data...');
    await testHelpers.cleanDatabase();
  });

  describe('Query Performance at Scale', () => {
    it('should maintain sub-10ms lookups with 100k users', async () => {
      const testCases = [
        { userId: 'scale-user-50000', email: 'scale-50000@example.com' },
        { userId: 'scale-user-99999', email: 'scale-99999@example.com' },
        { userId: 'scale-user-1', email: 'scale-1@example.com' },
        { userId: 'scale-user-25000', email: 'scale-25000@example.com' },
        { userId: 'scale-user-75000', email: 'scale-75000@example.com' },
      ];
      
      console.log('\n🔍 Testing lookup performance with 100k users:');
      
      for (const testCase of testCases) {
        // Test user lookup by ID
        const idMeasurements = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          const user = await prisma.user.findUnique({
            where: { id: testCase.userId },
          });
          const end = performance.now();
          idMeasurements.push(end - start);
          expect(user).toBeTruthy();
        }
        
        const avgIdTime = idMeasurements.reduce((a, b) => a + b, 0) / idMeasurements.length;
        console.log(`  User ${testCase.userId} by ID: ${avgIdTime.toFixed(2)}ms`);
        expect(avgIdTime).toBeLessThan(TARGET_LOOKUP_TIME_MS);
        
        // Test user lookup by email
        const emailMeasurements = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          const emails = await prisma.linkedEmail.findMany({
            where: { email: testCase.email },
            include: { user: true },
          });
          const end = performance.now();
          emailMeasurements.push(end - start);
          expect(emails.length).toBeGreaterThan(0);
        }
        
        const avgEmailTime = emailMeasurements.reduce((a, b) => a + b, 0) / emailMeasurements.length;
        console.log(`  User ${testCase.userId} by email: ${avgEmailTime.toFixed(2)}ms`);
        expect(avgEmailTime).toBeLessThan(TARGET_LOOKUP_TIME_MS);
      }
    });

    it('should handle aggregation queries efficiently', async () => {
      console.log('\n📊 Testing aggregation performance:');
      
      // Test 1: Count active sessions
      const start1 = performance.now();
      const activeSessions = await prisma.session.count({
        where: {
          expiresAt: {
            gt: new Date(),
          },
        },
      });
      const time1 = performance.now() - start1;
      console.log(`  Count active sessions: ${time1.toFixed(2)}ms (${activeSessions.toLocaleString()} sessions)`);
      expect(time1).toBeLessThan(100); // Aggregations can take longer
      
      // Test 2: Sum credits for top users
      const start2 = performance.now();
      const topUsers = await prisma.user.findMany({
        where: {
          credits: {
            gt: 450,
          },
        },
        take: 100,
        orderBy: {
          credits: 'desc',
        },
      });
      const time2 = performance.now() - start2;
      console.log(`  Find top 100 users by credits: ${time2.toFixed(2)}ms`);
      expect(time2).toBeLessThan(50);
      
      // Test 3: Usage statistics
      const start3 = performance.now();
      const usageStats = await prisma.usage.groupBy({
        by: ['service'],
        _count: {
          id: true,
        },
        _sum: {
          credits: true,
        },
        where: {
          timestamp: {
            gte: new Date(Date.now() - 86400000), // Last 24 hours
          },
        },
      });
      const time3 = performance.now() - start3;
      console.log(`  Usage statistics by service: ${time3.toFixed(2)}ms`);
      expect(time3).toBeLessThan(100);
    });

    it('should handle pagination efficiently', async () => {
      console.log('\n📄 Testing pagination performance:');
      
      const pageSizes = [10, 50, 100];
      const offsets = [0, 1000, 5000, 10000, 50000];
      
      for (const pageSize of pageSizes) {
        console.log(`  Page size: ${pageSize}`);
        
        for (const offset of offsets) {
          const start = performance.now();
          const users = await prisma.user.findMany({
            skip: offset,
            take: pageSize,
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              linkedEmails: {
                where: {
                  isPrimary: true,
                },
              },
            },
          });
          const end = performance.now();
          
          const time = end - start;
          console.log(`    Offset ${offset}: ${time.toFixed(2)}ms`);
          expect(users.length).toBe(pageSize);
          expect(time).toBeLessThan(50); // Pagination should be fast even at high offsets
        }
      }
    });

    it('should maintain performance under concurrent load', async () => {
      console.log('\n🔥 Testing concurrent query performance:');
      
      const concurrentQueries = 100;
      const queryTypes = [
        () => prisma.user.findUnique({ where: { id: `scale-user-${Math.floor(Math.random() * TOTAL_USERS)}` } }),
        () => prisma.session.findFirst({ where: { userId: `scale-user-${Math.floor(Math.random() * TOTAL_USERS)}` } }),
        () => prisma.usage.count({ where: { userId: `scale-user-${Math.floor(Math.random() * 1000)}` } }),
        () => prisma.oAuthConnection.findFirst({ where: { userId: `scale-user-${Math.floor(Math.random() * 5000)}` } }),
      ];
      
      const start = performance.now();
      const promises = [];
      
      for (let i = 0; i < concurrentQueries; i++) {
        const queryFn = queryTypes[i % queryTypes.length];
        promises.push(queryFn());
      }
      
      await Promise.all(promises);
      const totalTime = performance.now() - start;
      const avgTime = totalTime / concurrentQueries;
      
      console.log(`  ${concurrentQueries} concurrent queries completed in ${totalTime.toFixed(2)}ms`);
      console.log(`  Average time per query: ${avgTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(TARGET_LOOKUP_TIME_MS * 3); // Allow 3x for concurrent load
    });
  });

  describe('Index Effectiveness', () => {
    it('should demonstrate index usage for common queries', async () => {
      console.log('\n🔍 Verifying index effectiveness:');
      
      // These queries should all use indexes effectively
      const indexedQueries = [
        {
          name: 'User by primaryEmail',
          query: () => prisma.user.findUnique({ where: { primaryEmail: 'scale-50000@example.com' } }),
        },
        {
          name: 'LinkedEmail by email',
          query: () => prisma.linkedEmail.findUnique({ where: { email: 'scale-50000@example.com' } }),
        },
        {
          name: 'Session by sessionId',
          query: () => prisma.session.findUnique({ where: { sessionId: 'scale-session-50000' } }),
        },
        {
          name: 'OAuth by userId + provider',
          query: () => prisma.oAuthConnection.findFirst({ 
            where: { userId: 'scale-user-1000', provider: 'google' } 
          }),
        },
        {
          name: 'Usage by userId + timestamp',
          query: () => prisma.usage.findMany({ 
            where: { 
              userId: 'scale-user-1000',
              timestamp: { gte: new Date(Date.now() - 86400000) }
            },
            take: 10,
          }),
        },
      ];
      
      for (const { name, query } of indexedQueries) {
        const measurements = [];
        
        for (let i = 0; i < 5; i++) {
          const start = performance.now();
          await query();
          const end = performance.now();
          measurements.push(end - start);
        }
        
        const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
        console.log(`  ${name}: ${avgTime.toFixed(2)}ms`);
        expect(avgTime).toBeLessThan(TARGET_LOOKUP_TIME_MS);
      }
    });
  });
});