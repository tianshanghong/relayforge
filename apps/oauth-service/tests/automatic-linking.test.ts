import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthFlowService } from '../src/services/oauth.service';
import { prisma } from '@relayforge/database';
import { CSRFManager } from '../src/utils/csrf';
import { providerRegistry } from '../src/providers/registry';

describe('Automatic Email Linking', () => {
  let oauthService: OAuthFlowService;
  
  beforeEach(async () => {
    oauthService = new OAuthFlowService();
    
    // Cleanup database
    await prisma.usage.deleteMany();
    await prisma.session.deleteMany();
    await prisma.oAuthConnection.deleteMany();
    await prisma.linkedEmail.deleteMany();
    await prisma.user.deleteMany();
  });

  it('should automatically link new email when user is authenticated', async () => {
    // Create initial user with Google account
    const initialUser = await prisma.user.create({
      data: {
        primaryEmail: 'user@gmail.com',
        credits: 500,
        linkedEmails: {
          create: {
            email: 'user@gmail.com',
            provider: 'google',
            isPrimary: true,
          },
        },
      },
    });

    // Create an active session for the user
    const session = await prisma.session.create({
      data: {
        sessionId: 'test-session-123',
        userId: initialUser.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Mock OAuth provider for GitHub
    const mockGitHubProvider = {
      getAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'github-access-token',
        refreshToken: 'github-refresh-token',
        expiresIn: 3600,
        scope: 'user repo',
      }),
      getUserInfo: vi.fn().mockResolvedValue({
        id: 'github-123',
        email: 'user@company.com', // Different email
        name: 'Test User',
      }),
      validateScopes: vi.fn().mockReturnValue(true),
      scopes: ['user', 'repo'],
    };

    // Register mock provider
    providerRegistry._registerForTesting('github', mockGitHubProvider as any);

    // Generate valid CSRF state
    const state = CSRFManager.createState('github');

    // Handle OAuth callback with existing session
    const result = await oauthService.handleCallback(
      'github',
      'test-code',
      state,
      undefined,
      session.sessionId // User is authenticated
    );

    // Verify user is the same
    expect(result.user.id).toBe(initialUser.id);
    expect(result.user.isNewUser).toBe(false);

    // Verify new email was linked
    const linkedEmails = await prisma.linkedEmail.findMany({
      where: { userId: initialUser.id },
      orderBy: { email: 'asc' },
    });

    expect(linkedEmails).toHaveLength(2);
    expect(linkedEmails.map(e => e.email)).toEqual([
      'user@company.com',
      'user@gmail.com',
    ]);

    // Verify OAuth connection was created
    const connections = await prisma.oAuthConnection.findMany({
      where: { userId: initialUser.id },
    });

    expect(connections).toHaveLength(1);
    expect(connections[0].provider).toBe('github');
    expect(connections[0].email).toBe('user@company.com');

    // Verify no new user was created
    const userCount = await prisma.user.count();
    expect(userCount).toBe(1);

    // Verify user didn't get additional credits
    const updatedUser = await prisma.user.findUnique({
      where: { id: initialUser.id },
    });
    expect(updatedUser?.credits).toBe(500); // Same as before
  });

  it('should reject linking if email belongs to another user', async () => {
    // Create two separate users
    const user1 = await prisma.user.create({
      data: {
        primaryEmail: 'user1@gmail.com',
        credits: 500,
        linkedEmails: {
          create: {
            email: 'user1@gmail.com',
            provider: 'google',
            isPrimary: true,
          },
        },
      },
    });

    const user2 = await prisma.user.create({
      data: {
        primaryEmail: 'user2@company.com',
        credits: 500,
        linkedEmails: {
          create: {
            email: 'user2@company.com',
            provider: 'github',
            isPrimary: true,
          },
        },
      },
    });

    // Create session for user1
    const session = await prisma.session.create({
      data: {
        sessionId: 'user1-session',
        userId: user1.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Mock OAuth provider attempting to link user2's email
    const mockProvider = {
      getAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        expiresIn: 3600,
      }),
      getUserInfo: vi.fn().mockResolvedValue({
        id: 'oauth-123',
        email: 'user2@company.com', // This email belongs to user2!
        name: 'Test User',
      }),
      validateScopes: vi.fn().mockReturnValue(true),
      scopes: ['user'],
    };

    providerRegistry._registerForTesting('github', mockProvider as any);
    const state = CSRFManager.createState('github');

    // This should fail
    await expect(
      oauthService.handleCallback('github', 'code', state, undefined, session.sessionId)
    ).rejects.toThrow('already linked to another account');

    // Verify no changes were made
    const user1Emails = await prisma.linkedEmail.findMany({
      where: { userId: user1.id },
    });
    expect(user1Emails).toHaveLength(1);
    expect(user1Emails[0].email).toBe('user1@gmail.com');
  });

  it('should create new user when not authenticated', async () => {
    // Mock OAuth provider
    const mockProvider = {
      getAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        expiresIn: 3600,
      }),
      getUserInfo: vi.fn().mockResolvedValue({
        id: 'oauth-123',
        email: 'newuser@example.com',
        name: 'New User',
      }),
      validateScopes: vi.fn().mockReturnValue(true),
      scopes: ['user'],
    };

    providerRegistry._registerForTesting('google', mockProvider as any);
    const state = CSRFManager.createState('google');

    // Handle OAuth callback WITHOUT session
    const result = await oauthService.handleCallback(
      'google',
      'code',
      state,
      undefined,
      undefined // No existing session
    );

    // Verify new user was created
    expect(result.user.isNewUser).toBe(true);
    expect(result.user.email).toBe('newuser@example.com');
    expect(result.user.credits).toBe(500); // New user bonus

    const userCount = await prisma.user.count();
    expect(userCount).toBe(1);
  });
});