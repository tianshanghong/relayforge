/**
 * Maps service prefixes to OAuth provider names
 * This configuration determines which OAuth provider to use for each service
 */
export const serviceProviderMap: Record<string, string> = {
  // Google services
  'google-calendar': 'google',
  'google-drive': 'google',
  'google-gmail': 'google',
  'google-sheets': 'google',
  'google-docs': 'google',
  
  // GitHub services
  'github': 'github',
  'github-issues': 'github',
  'github-repos': 'github',
  
  // Slack services
  'slack': 'slack',
  'slack-messages': 'slack',
  'slack-channels': 'slack',
  
  // Microsoft services (future)
  'microsoft-teams': 'microsoft',
  'microsoft-outlook': 'microsoft',
  'microsoft-onedrive': 'microsoft',
  
  // Other services (future)
  'notion': 'notion',
  'linear': 'linear',
  'jira': 'atlassian',
  'confluence': 'atlassian',
};

/**
 * Get the OAuth provider for a given service prefix
 */
export function getProviderForService(servicePrefix: string): string | undefined {
  return serviceProviderMap[servicePrefix];
}