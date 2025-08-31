/**
 * Unified Service Metadata
 * Single source of truth for all MCP service information
 */

export type ServiceCategory = 'Productivity' | 'Development' | 'Communication' | 'AI & ML' | 'Finance' | 'Demo';
export type AuthType = 'oauth' | 'api-key' | 'none';

export interface ServiceMetadata {
  id: string;
  displayName: string;
  description: string;
  category: ServiceCategory;
  features: string[];
  icon: string;
  pricePerCall: number; // in cents
  authType: AuthType;
  oauthProvider?: string; // For OAuth services (e.g., 'google', 'github')
  requiredEnvVars?: string[]; // For API key services (e.g., ['OPENAI_API_KEY'])
  active: boolean; // Whether the service is currently available
}

/**
 * Complete service registry
 * Only includes implemented services
 */
export const SERVICE_REGISTRY: Record<string, ServiceMetadata> = {
  'google-calendar': {
    id: 'google-calendar',
    displayName: 'Google Calendar',
    description: 'Access and manage Google Calendar events, create meetings, check availability, and sync schedules.',
    category: 'Productivity',
    features: [
      'Create events',
      'List events', 
      'Update events',
      'Delete events',
      'Check availability',
      'Multi-calendar support'
    ],
    icon: '📅',
    pricePerCall: 2,
    authType: 'oauth',
    oauthProvider: 'google',
    active: true
  },
  
  'coinbase': {
    id: 'coinbase',
    displayName: 'Coinbase',
    description: 'Access Coinbase accounts, portfolios, transactions, and cryptocurrency market data using CDP API.',
    category: 'Finance',
    features: [
      'View accounts',
      'Portfolio tracking',
      'Transaction history',
      'Market data',
      'Wallet balances'
    ],
    icon: '₿',
    pricePerCall: 1,
    authType: 'api-key',
    requiredEnvVars: ['Coinbase-API-Key-Name', 'Coinbase-API-Private-Key'],
    active: true
  },
  
  'hello-world': {
    id: 'hello-world',
    displayName: 'Hello World Demo',
    description: 'A simple demo server that responds with greetings. Perfect for testing your MCP client setup.',
    category: 'Demo',
    features: [
      'Simple greetings',
      'Echo messages',
      'Test connectivity',
      'No authentication required'
    ],
    icon: '👋',
    pricePerCall: 0,
    authType: 'none',
    active: true
  }
};

/**
 * Helper functions for working with service metadata
 */

export function getService(id: string): ServiceMetadata | undefined {
  return SERVICE_REGISTRY[id];
}

export function getActiveServices(): ServiceMetadata[] {
  return Object.values(SERVICE_REGISTRY).filter(service => service.active);
}

export function getServicesByCategory(category: ServiceCategory): ServiceMetadata[] {
  return Object.values(SERVICE_REGISTRY).filter(service => service.category === category);
}

export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  if (cents < 1) return `$${(cents / 100).toFixed(3)} per call`;
  return `$${(cents / 100).toFixed(2)} per call`;
}

export function getServiceCategories(): ServiceCategory[] {
  // Only return categories that have active services
  const activeCategories = new Set(
    Object.values(SERVICE_REGISTRY)
      .filter(service => service.active)
      .map(service => service.category)
  );
  return Array.from(activeCategories);
}