/**
 * OAuth Client for service-to-service communication
 * Replaces direct imports from OAuth service to maintain clean service boundaries
 */
export class OAuthClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  /**
   * Fetches a valid OAuth access token for the specified provider and user
   * @param userId - The user ID to fetch the token for
   * @param provider - The OAuth provider (e.g., 'google', 'github')
   * @returns The access token
   * @throws Error if token retrieval fails
   */
  async getToken(userId: string, provider: string): Promise<string> {
    const url = `${this.baseUrl}/api/internal/tokens/${provider}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-User-Id': userId,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '' })) as { message?: string };
        
        if (response.status === 404) {
          throw new Error(`No OAuth connection found for provider: ${provider}`);
        }
        
        if (response.status === 401) {
          throw new Error(`Token refresh failed for provider: ${provider}. User may need to re-authenticate.`);
        }
        
        throw new Error(
          errorData.message || 
          `Failed to get OAuth token: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json() as { accessToken: string };
      return data.accessToken;
    } catch (error) {
      // Re-throw if it's already a processed error
      if (error instanceof Error && error.message.includes('OAuth')) {
        throw error;
      }
      
      // Handle network errors
      throw new Error(`Failed to connect to OAuth service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Health check for the OAuth service internal API
   * @returns true if the service is healthy
   */
  async healthCheck(): Promise<boolean> {
    const url = `${this.baseUrl}/api/internal/health`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }
}