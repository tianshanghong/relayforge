import { 
  CreateTokenResponse, 
  ListTokensResponse, 
  DeleteTokenResponse,
  ApiError
} from '../types/token.types';
import { API_MAX_RETRIES, API_RETRY_DELAY } from '../constants/ui.constants';

// API configuration
const OAUTH_SERVICE_URL = import.meta.env.VITE_OAUTH_SERVICE_URL || 'http://localhost:3002';

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' })) as ApiError;
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// Retry logic with exponential backoff
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  retries = API_MAX_RETRIES
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    // Don't retry client errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      return response;
    }
    
    // Retry on server errors (5xx) or network errors
    if (!response.ok && retries > 0) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response;
  } catch (error) {
    if (retries === 0) {
      throw error;
    }
    
    // Exponential backoff: delay * (2 ^ attempt)
    const delay = API_RETRY_DELAY * Math.pow(2, API_MAX_RETRIES - retries);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return fetchWithRetry(url, options, retries - 1);
  }
}

// Token management API
export const tokenApi = {
  async listTokens(): Promise<ListTokensResponse> {
    const response = await fetchWithRetry(`${OAUTH_SERVICE_URL}/api/tokens`, {
      method: 'GET',
      credentials: 'include', // Include cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<ListTokensResponse>(response);
  },

  async createToken(name: string): Promise<CreateTokenResponse> {
    // Don't retry POST requests by default to avoid duplicate creation
    const response = await fetch(`${OAUTH_SERVICE_URL}/api/tokens`, {
      method: 'POST',
      credentials: 'include', // Include cookies
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    return handleResponse<CreateTokenResponse>(response);
  },

  async revokeToken(tokenId: string): Promise<DeleteTokenResponse> {
    const response = await fetchWithRetry(`${OAUTH_SERVICE_URL}/api/tokens/${tokenId}`, {
      method: 'DELETE',
      credentials: 'include', // Include cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<DeleteTokenResponse>(response);
  },
};

// OAuth providers API
export const authApi = {
  async getProviders() {
    const response = await fetchWithRetry(`${OAUTH_SERVICE_URL}/oauth/providers`, {
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