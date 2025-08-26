// API Configuration
// This file centralizes all API-related configuration for the frontend

// Get API base URL from environment or use default
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.DEV ? 'http://localhost:3002' : window.location.origin.replace('www.', 'api.'));

// OAuth service URL (might be same as API_BASE_URL)
export const OAUTH_SERVICE_URL = import.meta.env.VITE_OAUTH_SERVICE_URL || API_BASE_URL;

// Helper to construct full API URLs
export const getApiUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};

// Helper to construct MCP server URLs
export const getMcpServerUrl = (userSlug: string) => {
  return `${API_BASE_URL}/mcp/u/${userSlug}`;
};