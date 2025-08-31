import { describe, it, expect } from 'vitest';
import {
  SERVICE_REGISTRY,
  getService,
  getActiveServices,
  getServicesByCategory,
  formatPrice,
  getServiceCategories,
  type ServiceMetadata,
  type ServiceCategory,
  type AuthType
} from './metadata';

describe('Service Metadata', () => {
  describe('SERVICE_REGISTRY', () => {
    it('should contain all expected services', () => {
      expect(SERVICE_REGISTRY).toHaveProperty('google-calendar');
      expect(SERVICE_REGISTRY).toHaveProperty('coinbase');
      expect(SERVICE_REGISTRY).toHaveProperty('hello-world');
    });

    it('should have valid metadata for each service', () => {
      Object.values(SERVICE_REGISTRY).forEach(service => {
        expect(service).toHaveProperty('id');
        expect(service).toHaveProperty('displayName');
        expect(service).toHaveProperty('description');
        expect(service).toHaveProperty('category');
        expect(service).toHaveProperty('features');
        expect(service).toHaveProperty('icon');
        expect(service).toHaveProperty('pricePerCall');
        expect(service).toHaveProperty('authType');
        expect(service).toHaveProperty('active');
        
        // Validate types
        expect(typeof service.id).toBe('string');
        expect(typeof service.displayName).toBe('string');
        expect(typeof service.description).toBe('string');
        expect(Array.isArray(service.features)).toBe(true);
        expect(typeof service.icon).toBe('string');
        expect(typeof service.pricePerCall).toBe('number');
        expect(typeof service.active).toBe('boolean');
      });
    });

    it('should have correct auth configuration', () => {
      const googleCalendar = SERVICE_REGISTRY['google-calendar'];
      expect(googleCalendar.authType).toBe('oauth');
      expect(googleCalendar.oauthProvider).toBe('google');
      
      const coinbase = SERVICE_REGISTRY['coinbase'];
      expect(coinbase.authType).toBe('api-key');
      expect(coinbase.requiredEnvVars).toEqual(['Coinbase-API-Key-Name', 'Coinbase-API-Private-Key']);
      
      const helloWorld = SERVICE_REGISTRY['hello-world'];
      expect(helloWorld.authType).toBe('none');
    });

    it('should have correct pricing', () => {
      expect(SERVICE_REGISTRY['google-calendar'].pricePerCall).toBe(2);
      expect(SERVICE_REGISTRY['coinbase'].pricePerCall).toBe(1);
      expect(SERVICE_REGISTRY['hello-world'].pricePerCall).toBe(0);
    });
  });

  describe('getService', () => {
    it('should return service metadata for valid ID', () => {
      const service = getService('google-calendar');
      expect(service).toBeDefined();
      expect(service?.id).toBe('google-calendar');
      expect(service?.displayName).toBe('Google Calendar');
    });

    it('should return undefined for invalid ID', () => {
      const service = getService('non-existent-service');
      expect(service).toBeUndefined();
    });
  });

  describe('getActiveServices', () => {
    it('should return only active services', () => {
      const activeServices = getActiveServices();
      expect(Array.isArray(activeServices)).toBe(true);
      
      activeServices.forEach(service => {
        expect(service.active).toBe(true);
      });
    });

    it('should return all currently active services', () => {
      const activeServices = getActiveServices();
      const activeIds = activeServices.map(s => s.id);
      
      expect(activeIds).toContain('google-calendar');
      expect(activeIds).toContain('coinbase');
      expect(activeIds).toContain('hello-world');
    });
  });

  describe('getServicesByCategory', () => {
    it('should return services for valid category', () => {
      const productivityServices = getServicesByCategory('Productivity');
      expect(productivityServices.length).toBeGreaterThan(0);
      productivityServices.forEach(service => {
        expect(service.category).toBe('Productivity');
      });
    });

    it('should return empty array for category with no services', () => {
      const services = getServicesByCategory('NonExistentCategory' as ServiceCategory);
      expect(services).toEqual([]);
    });

    it('should correctly categorize all services', () => {
      const financeServices = getServicesByCategory('Finance');
      expect(financeServices.some(s => s.id === 'coinbase')).toBe(true);
      
      const demoServices = getServicesByCategory('Demo');
      expect(demoServices.some(s => s.id === 'hello-world')).toBe(true);
    });
  });

  describe('formatPrice', () => {
    it('should format free services correctly', () => {
      expect(formatPrice(0)).toBe('Free');
    });

    it('should format sub-cent prices correctly', () => {
      expect(formatPrice(0.5)).toBe('$0.005 per call');
      expect(formatPrice(0.1)).toBe('$0.001 per call');
    });

    it('should format cent prices correctly', () => {
      expect(formatPrice(1)).toBe('$0.01 per call');
      expect(formatPrice(2)).toBe('$0.02 per call');
      expect(formatPrice(100)).toBe('$1.00 per call');
    });

    it('should handle decimal cents correctly', () => {
      expect(formatPrice(1.5)).toBe('$0.01 per call');
      expect(formatPrice(2.99)).toBe('$0.03 per call');
      expect(formatPrice(10.49)).toBe('$0.10 per call');
      expect(formatPrice(10.50)).toBe('$0.10 per call');
      expect(formatPrice(10.51)).toBe('$0.11 per call');
    });
  });

  describe('getServiceCategories', () => {
    it('should return unique categories', () => {
      const categories = getServiceCategories();
      const uniqueCategories = new Set(categories);
      expect(categories.length).toBe(uniqueCategories.size);
    });

    it('should only return categories with active services', () => {
      const categories = getServiceCategories();
      
      categories.forEach(category => {
        const servicesInCategory = getServicesByCategory(category);
        const activeServicesInCategory = servicesInCategory.filter(s => s.active);
        expect(activeServicesInCategory.length).toBeGreaterThan(0);
      });
    });

    it('should include expected categories', () => {
      const categories = getServiceCategories();
      expect(categories).toContain('Productivity');
      expect(categories).toContain('Finance');
      expect(categories).toContain('Demo');
    });
  });

  describe('Service Metadata Integrity', () => {
    it('should have unique service IDs', () => {
      const ids = Object.keys(SERVICE_REGISTRY);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should have non-negative prices', () => {
      Object.values(SERVICE_REGISTRY).forEach(service => {
        expect(service.pricePerCall).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have valid auth types', () => {
      const validAuthTypes: AuthType[] = ['oauth', 'api-key', 'none'];
      Object.values(SERVICE_REGISTRY).forEach(service => {
        expect(validAuthTypes).toContain(service.authType);
      });
    });

    it('should have oauth provider for oauth services', () => {
      Object.values(SERVICE_REGISTRY).forEach(service => {
        if (service.authType === 'oauth') {
          expect(service.oauthProvider).toBeDefined();
          expect(typeof service.oauthProvider).toBe('string');
        }
      });
    });

    it('should have required env vars for api-key services', () => {
      Object.values(SERVICE_REGISTRY).forEach(service => {
        if (service.authType === 'api-key') {
          expect(service.requiredEnvVars).toBeDefined();
          expect(Array.isArray(service.requiredEnvVars)).toBe(true);
          expect(service.requiredEnvVars!.length).toBeGreaterThan(0);
        }
      });
    });

    it('should have at least one feature per service', () => {
      Object.values(SERVICE_REGISTRY).forEach(service => {
        expect(service.features.length).toBeGreaterThan(0);
      });
    });
  });
});