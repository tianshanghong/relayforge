import { PrismaClient } from '@prisma/client';
import { CryptoService } from '../src/crypto';

const prisma = new PrismaClient();
const crypto = new CryptoService();

async function main() {
  console.log('🌱 Starting database seed...');

  // Seed service pricing
  const services = [
    // OAuth services
    { service: 'google-calendar', pricePerCall: 2, category: 'oauth', active: true }, // MVP
    { service: 'google-drive', pricePerCall: 3, category: 'oauth', active: false },
    { service: 'google-gmail', pricePerCall: 2, category: 'oauth', active: false },
    { service: 'github', pricePerCall: 1, category: 'oauth', active: false },
    { service: 'slack', pricePerCall: 2, category: 'oauth', active: false },
    { service: 'microsoft-graph', pricePerCall: 2, category: 'oauth', active: false },
    { service: 'notion', pricePerCall: 3, category: 'oauth', active: false },
    { service: 'linear', pricePerCall: 2, category: 'oauth', active: false },
    
    // Client-key services
    { service: 'coinbase', pricePerCall: 1, category: 'api-key', active: true },
    { service: 'openai', pricePerCall: 0.5, category: 'api-key', active: false },
    { service: 'anthropic', pricePerCall: 0.5, category: 'api-key', active: false },
    { service: 'stripe', pricePerCall: 1, category: 'api-key', active: false },
    { service: 'sendgrid', pricePerCall: 0.5, category: 'api-key', active: false },
    { service: 'twilio', pricePerCall: 1, category: 'api-key', active: false },
    { service: 'sentry', pricePerCall: 0.5, category: 'api-key', active: false },
    { service: 'datadog', pricePerCall: 1, category: 'api-key', active: false },
    { service: 'pagerduty', pricePerCall: 1, category: 'api-key', active: false },
  ];

  for (const service of services) {
    await prisma.servicePricing.upsert({
      where: { service: service.service },
      update: {
        pricePerCall: service.pricePerCall,
        category: service.category,
        active: service.active,
      },
      create: {
        service: service.service,
        pricePerCall: service.pricePerCall,
        category: service.category,
        active: service.active,
      },
    });
  }

  console.log(`✅ Seeded ${services.length} service pricing entries`);

  // Create test users (only in development)
  if (process.env.NODE_ENV !== 'production') {
    // Test user 1: Alice with multiple linked emails
    const alice = await prisma.user.upsert({
      where: { primaryEmail: 'alice@example.com' },
      update: {},
      create: {
        primaryEmail: 'alice@example.com',
        slug: 'test-alice-123',
        credits: 500, // $5.00 in credits
      },
    });

    // Link additional emails for Alice
    await prisma.linkedEmail.upsert({
      where: { email: 'alice@example.com' },
      update: {},
      create: {
        userId: alice.id,
        email: 'alice@example.com',
        provider: 'google',
        isPrimary: true,
      },
    });

    await prisma.linkedEmail.upsert({
      where: { email: 'alice@company.com' },
      update: {},
      create: {
        userId: alice.id,
        email: 'alice@company.com',
        provider: 'github',
        isPrimary: false,
      },
    });

    // Create OAuth connections for Alice
    const googleToken = crypto.encrypt('fake-google-access-token');
    const githubToken = crypto.encrypt('fake-github-access-token');

    await prisma.oAuthConnection.upsert({
      where: {
        userId_provider_email: {
          userId: alice.id,
          provider: 'google',
          email: 'alice@example.com',
        },
      },
      update: {},
      create: {
        userId: alice.id,
        provider: 'google',
        email: 'alice@example.com',
        scopes: ['calendar.read', 'calendar.write', 'drive.read'],
        accessToken: googleToken,
        refreshToken: crypto.encrypt('fake-google-refresh-token'),
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      },
    });

    await prisma.oAuthConnection.upsert({
      where: {
        userId_provider_email: {
          userId: alice.id,
          provider: 'github',
          email: 'alice@company.com',
        },
      },
      update: {},
      create: {
        userId: alice.id,
        provider: 'github',
        email: 'alice@company.com',
        scopes: ['repo', 'user'],
        accessToken: githubToken,
        expiresAt: new Date(Date.now() + 7200 * 1000), // 2 hours from now
      },
    });

    // Create a session for Alice
    const sessionId = crypto.generateSessionId();
    await prisma.session.create({
      data: {
        sessionId,
        userId: alice.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        metadata: {
          userAgent: 'Claude Desktop/1.0',
          ipAddress: '127.0.0.1',
        },
      },
    });

    console.log(`✅ Created test user: alice@example.com with session: ${sessionId}`);

    // Test user 2: Bob with single email
    const bob = await prisma.user.upsert({
      where: { primaryEmail: 'bob@example.com' },
      update: {},
      create: {
        primaryEmail: 'bob@example.com',
        slug: 'test-bob-456',
        credits: 100, // $1.00 in credits
      },
    });

    await prisma.linkedEmail.upsert({
      where: { email: 'bob@example.com' },
      update: {},
      create: {
        userId: bob.id,
        email: 'bob@example.com',
        provider: 'google',
        isPrimary: true,
      },
    });

    console.log('✅ Created test user: bob@example.com');
  }

  console.log('🎉 Database seed completed!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });