import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService, oauthService, usageService } from '../../src/services';
import { prisma } from '../../src';
import { testHelpers } from '../helpers';

describe('OAuth Flow Integration', () => {
  beforeEach(async () => {
    await testHelpers.seedServicePricing();
  });

  it('should handle complete OAuth authentication and usage flow', async () => {
    // Step 1: User initiates OAuth flow
    const user = await userService.createUser({
      email: 'oauth-user@example.com',
      provider: 'google',
      initialCredits: 1000,
    });
    
    // Step 2: Create session for MCP connection
    const sessionId = await userService.createSession({
      userId: user.id,
      metadata: {
        userAgent: 'Claude Desktop/1.0',
        ipAddress: '127.0.0.1',
      },
    });
    
    // Step 3: Store OAuth tokens after successful authentication
    const connection = await oauthService.storeTokens({
      userId: user.id,
      provider: 'google',
      email: 'oauth-user@example.com',
      scopes: ['calendar.read', 'calendar.write', 'drive.read'],
      accessToken: 'ya29.a0AfH6SMBxx...',
      refreshToken: '1//0gxx...',
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
    });
    
    // Step 4: Client makes API call through MCP
    const canProceed = await userService.deductCredits(user.id, 'google-calendar');
    expect(canProceed).toBe(true);
    
    // Step 5: Track usage
    const usage = await usageService.trackUsage({
      userId: user.id,
      sessionId,
      service: 'google-calendar',
      method: 'createEvent',
      success: true,
    });
    
    expect(usage.credits).toBe(2); // Based on pricing
    
    // Step 6: Verify user credits were deducted
    const updatedUser = await userService.findUserById(user.id);
    expect(updatedUser?.credits).toBe(998); // 1000 - 2
    
    // Step 7: Check usage history
    const userUsage = await usageService.getUserUsage(user.id);
    expect(userUsage).toHaveLength(1);
    expect(userUsage[0].service).toBe('google-calendar');
  });
  
  it('should handle token refresh flow', async () => {
    const user = await userService.createUser({
      email: 'refresh-test@example.com',
      provider: 'google',
    });
    
    // Store initial tokens
    const connection = await oauthService.storeTokens({
      userId: user.id,
      provider: 'google',
      email: 'refresh-test@example.com',
      scopes: ['calendar.read'],
      accessToken: 'initial-access-token',
      refreshToken: 'refresh-token-123',
      expiresAt: new Date(Date.now() - 1000), // Already expired
    });
    
    // Check if token is expired
    expect(oauthService.isTokenExpired(connection)).toBe(true);
    
    // Simulate token refresh
    const newAccessToken = 'refreshed-access-token';
    const newExpiry = new Date(Date.now() + 3600 * 1000);
    
    const updated = await oauthService.updateTokens(
      connection.id,
      newAccessToken,
      undefined, // Keep same refresh token
      newExpiry
    );
    
    expect(oauthService.isTokenExpired(updated)).toBe(false);
    
    // Verify new tokens work
    const tokens = await oauthService.getTokens(user.id, 'google');
    expect(tokens?.accessToken).toBe(newAccessToken);
    expect(tokens?.refreshToken).toBe('refresh-token-123');
  });
  
  it('should handle multiple OAuth providers', async () => {
    const user = await userService.createUser({
      email: 'multi-oauth@example.com',
      provider: 'google',
    });
    
    // Connect multiple services
    const providers = [
      { provider: 'google', email: 'multi-oauth@gmail.com', scopes: ['calendar.read'] },
      { provider: 'github', email: 'multi-oauth@github.com', scopes: ['repo', 'user'] },
      { provider: 'slack', email: 'multi-oauth@slack.com', scopes: ['chat:write'] },
    ];
    
    for (const { provider, email, scopes } of providers) {
      // Link email if different
      if (email !== user.primaryEmail) {
        await userService.linkEmail({
          userId: user.id,
          email,
          provider,
        });
      }
      
      // Store OAuth connection
      await oauthService.storeTokens({
        userId: user.id,
        provider,
        email,
        scopes,
        accessToken: `${provider}-access-token`,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
    }
    
    // Check all providers are connected
    const status = await oauthService.getProvidersStatus(user.id);
    const connectedProviders = status.filter(s => s.connected);
    
    expect(connectedProviders).toHaveLength(3);
    expect(connectedProviders.map(p => p.provider).sort()).toEqual([
      'github',
      'google',
      'slack',
    ]);
    
    // Verify we can get tokens for each provider
    for (const provider of ['google', 'github', 'slack']) {
      const tokens = await oauthService.getTokens(user.id, provider);
      expect(tokens).toBeTruthy();
      expect(tokens?.accessToken).toBe(`${provider}-access-token`);
    }
  });
  
  it('should handle OAuth disconnection', async () => {
    const user = await userService.createUser({
      email: 'disconnect-test@example.com',
      provider: 'google',
    });
    
    // Connect OAuth
    await oauthService.storeTokens({
      userId: user.id,
      provider: 'google',
      email: 'disconnect-test@example.com',
      scopes: ['calendar.read'],
      accessToken: 'access-token',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
    
    // Verify connected
    let tokens = await oauthService.getTokens(user.id, 'google');
    expect(tokens).toBeTruthy();
    
    // Disconnect
    await oauthService.disconnect(user.id, 'google');
    
    // Verify disconnected
    tokens = await oauthService.getTokens(user.id, 'google');
    expect(tokens).toBeNull();
    
    const connections = await oauthService.getUserConnections(user.id);
    expect(connections).toHaveLength(0);
  });
});