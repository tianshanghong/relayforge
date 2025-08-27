// API Configuration
// This file centralizes all API-related configuration for the frontend

/**
 * Get the API base URL with proper error handling and domain parsing
 */
export const API_BASE_URL = (() => {
  // First check for explicit environment variable
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }
  
  // Development mode fallback
  if (import.meta.env.DEV) {
    return 'http://localhost:3002';
  }
  
  // Production mode - derive from current domain
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    
    // Properly replace www. subdomain with api.
    // www.example.com -> api.example.com
    // example.com -> api.example.com  
    // app.example.com -> api.example.com
    const domain = hostname.replace(/^www\./, '');
    const apiHostname = domain.startsWith('api.') ? domain : `api.${domain}`;
    
    return `${protocol}//${apiHostname}`;
  }
  
  // Fallback for SSR or unusual environments
  console.error('Unable to determine API_BASE_URL. Please set VITE_API_BASE_URL environment variable.');
  return 'http://localhost:3002';
})();

// OAuth service URL (might be same as API_BASE_URL)
export const OAUTH_SERVICE_URL = import.meta.env.VITE_OAUTH_SERVICE_URL || API_BASE_URL;

// Helper to construct full API URLs with validation
export const getApiUrl = (path: string): string => {
  if (!path) {
    console.error('Path is required for getApiUrl');
    return API_BASE_URL;
  }
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};

// Helper to construct MCP server URLs
export const getMcpServerUrl = (userSlug: string): string => {
  if (!userSlug) {
    console.error('User slug is required for getMcpServerUrl');
    return `${API_BASE_URL}/mcp/u/`;
  }
  return getApiUrl(`/mcp/u/${userSlug}`);
};

// Helper to convert HTTP(S) URLs to WebSocket URLs
export const getWebSocketUrl = (httpUrl: string): string => {
  if (!httpUrl) {
    console.error('HTTP URL is required for getWebSocketUrl');
    return '';
  }
  
  // Convert http:// to ws:// and https:// to wss://
  return httpUrl.replace(/^https?:/, (match) => match === 'https:' ? 'wss:' : 'ws:');
};