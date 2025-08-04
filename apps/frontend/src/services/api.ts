// API configuration
const OAUTH_SERVICE_URL = import.meta.env.VITE_OAUTH_SERVICE_URL || 'http://localhost:3002';

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// Token management API
export const tokenApi = {
  async listTokens() {
    const response = await fetch(`${OAUTH_SERVICE_URL}/api/tokens`, {
      method: 'GET',
      credentials: 'include', // Include cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<{
      success: boolean;
      tokens: Array<{
        id: string;
        name: string;
        prefix: string;
        createdAt: string;
        lastUsedAt: string | null;
      }>;
    }>(response);
  },

  async createToken(name: string) {
    const response = await fetch(`${OAUTH_SERVICE_URL}/api/tokens`, {
      method: 'POST',
      credentials: 'include', // Include cookies
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    return handleResponse<{
      success: boolean;
      token: {
        id: string;
        name: string;
        prefix: string;
        createdAt: string;
        plainToken: string;
      };
    }>(response);
  },

  async revokeToken(tokenId: string) {
    const response = await fetch(`${OAUTH_SERVICE_URL}/api/tokens/${tokenId}`, {
      method: 'DELETE',
      credentials: 'include', // Include cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<{
      success: boolean;
      message: string;
    }>(response);
  },
};

// OAuth providers API
export const authApi = {
  async getProviders() {
    const response = await fetch(`${OAUTH_SERVICE_URL}/oauth/providers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<{
      providers: Array<{
        name: string;
        displayName: string;
        icon: string;
        authUrl: string;
      }>;
    }>(response);
  },
};