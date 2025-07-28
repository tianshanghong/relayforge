import { describe, it, expect } from 'vitest';
import { userService, oauthService } from '../../src/services';
import { prisma } from '../../src';

describe('Account Linking Integration', () => {
  it('should handle complete account linking flow', async () => {
    // Step 1: User signs up with Google
    const user = await userService.createUser({
      email: 'alice@gmail.com',
      provider: 'google',
      initialCredits: 500,
    });
    
    expect(user.primaryEmail).toBe('alice@gmail.com');
    expect(user.credits).toBe(500);
    
    // Step 2: User connects Google OAuth
    const googleConnection = await oauthService.storeTokens({
      userId: user.id,
      provider: 'google',
      email: 'alice@gmail.com',
      scopes: ['calendar.read', 'calendar.write'],
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
    
    expect(googleConnection.provider).toBe('google');
    
    // Step 3: User tries to connect GitHub with different email
    const githubEmail = 'alice@company.com';
    
    // Check if email exists in any account
    const existingUser = await userService.findUserByEmail(githubEmail);
    expect(existingUser).toBeNull();
    
    // Link the new email
    const linkedEmail = await userService.linkEmail({
      userId: user.id,
      email: githubEmail,
      provider: 'github',
    });
    
    expect(linkedEmail.email).toBe(githubEmail);
    expect(linkedEmail.userId).toBe(user.id);
    
    // Step 4: Connect GitHub OAuth
    const githubConnection = await oauthService.storeTokens({
      userId: user.id,
      provider: 'github',
      email: githubEmail,
      scopes: ['repo', 'user'],
      accessToken: 'github-access-token',
      expiresAt: new Date(Date.now() + 7200 * 1000),
    });
    
    expect(githubConnection.email).toBe(githubEmail);
    
    // Step 5: Verify user can be found by either email
    const userByGmail = await userService.findUserByEmail('alice@gmail.com');
    const userByGithub = await userService.findUserByEmail(githubEmail);
    
    expect(userByGmail?.id).toBe(user.id);
    expect(userByGithub?.id).toBe(user.id);
    
    // Step 6: Check all linked emails
    const linkedEmails = await userService.getLinkedEmails(user.id);
    expect(linkedEmails).toHaveLength(2);
    expect(linkedEmails.map(e => e.email).sort()).toEqual([
      'alice@company.com',
      'alice@gmail.com',
    ]);
    
    // Step 7: Check OAuth connections
    const connections = await oauthService.getUserConnections(user.id);
    expect(connections).toHaveLength(2);
    
    const providerStatus = await oauthService.getProvidersStatus(user.id);
    const googleStatus = providerStatus.find(p => p.provider === 'google');
    const githubStatus = providerStatus.find(p => p.provider === 'github');
    
    expect(googleStatus?.connected).toBe(true);
    expect(googleStatus?.emails).toContain('alice@gmail.com');
    expect(githubStatus?.connected).toBe(true);
    expect(githubStatus?.emails).toContain('alice@company.com');
  });
  
  it('should prevent linking email already linked to another account', async () => {
    // Create two separate users
    const user1 = await userService.createUser({
      email: 'user1@example.com',
      provider: 'google',
    });
    
    const user2 = await userService.createUser({
      email: 'user2@example.com',
      provider: 'google',
    });
    
    // Try to link user1's email to user2's account
    await expect(
      userService.linkEmail({
        userId: user2.id,
        email: 'user1@example.com',
        provider: 'github',
      })
    ).rejects.toThrow('already linked to another account');
  });
  
  it('should handle changing primary email', async () => {
    // Create user with initial email
    const user = await userService.createUser({
      email: 'primary@example.com',
      provider: 'google',
    });
    
    // Link additional emails
    await userService.linkEmail({
      userId: user.id,
      email: 'work@company.com',
      provider: 'github',
    });
    
    await userService.linkEmail({
      userId: user.id,
      email: 'personal@email.com',
      provider: 'slack',
    });
    
    // Change primary email
    const updatedUser = await userService.updatePrimaryEmail(
      user.id,
      'work@company.com'
    );
    
    expect(updatedUser.primaryEmail).toBe('work@company.com');
    
    // Verify email flags are updated
    const emails = await userService.getLinkedEmails(user.id);
    const primaryEmail = emails.find(e => e.isPrimary);
    
    expect(primaryEmail?.email).toBe('work@company.com');
    expect(emails.filter(e => e.isPrimary)).toHaveLength(1);
  });
});