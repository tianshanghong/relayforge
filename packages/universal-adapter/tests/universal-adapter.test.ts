import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UniversalAdapter } from '../src/universal-adapter';
import { MCPService, ServiceDefinition, OAuthClient } from '../src/types';
import { MCPRequest, MCPResponse } from '@relayforge/shared';

describe('UniversalAdapter', () => {
  let mockService: MCPService;
  let mockOAuthClient: OAuthClient;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset environment
    delete process.env.TEST_API_KEY;
    
    // Create mock service
    mockService = {
      handleRequest: vi.fn(),
      setAccessToken: vi.fn(),
      setApiKey: vi.fn(),
      getTools: vi.fn(),
      initialize: vi.fn(),
      destroy: vi.fn()
    };
    
    // Create mock OAuth client
    mockOAuthClient = {
      getToken: vi.fn()
    };
  });
  
  describe('OAuth Services', () => {
    it('should inject OAuth token before handling request', async () => {
      const definition: ServiceDefinition = {
        id: 'google-calendar',
        name: 'Google Calendar',
        prefix: 'google-calendar',
        auth: 'oauth',
        provider: 'google',
        handler: 'GoogleCalendarService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition, mockOAuthClient);
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar_create-event',
        params: { title: 'Test' }
      };
      
      const mockToken = 'oauth-token-123';
      const mockResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: { success: true }
      };
      
      (mockOAuthClient.getToken as any).mockResolvedValue(mockToken);
      (mockService.handleRequest as any).mockResolvedValue(mockResponse);
      
      const response = await adapter.handleRequest(request, 'user-123');
      
      expect(mockOAuthClient.getToken).toHaveBeenCalledWith('user-123', 'google');
      expect(mockService.setAccessToken).toHaveBeenCalledWith(mockToken);
      expect(mockService.handleRequest).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });
    
    it('should return error when user ID missing for OAuth service', async () => {
      const definition: ServiceDefinition = {
        id: 'google-calendar',
        name: 'Google Calendar',
        prefix: 'google-calendar',
        auth: 'oauth',
        provider: 'google',
        handler: 'GoogleCalendarService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition, mockOAuthClient);
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'google-calendar_create-event',
        params: {}
      };
      
      const response = await adapter.handleRequest(request);
      
      expect(response.error).toBeDefined();
      expect(response.error?.message).toBe('Authentication failed');
      expect(response.error?.data).toBeDefined();
      expect((response.error?.data as any).error).toContain('User ID required');
      expect(mockService.handleRequest).not.toHaveBeenCalled();
    });
    
    it('should handle OAuth token retrieval failure', async () => {
      const definition: ServiceDefinition = {
        id: 'github',
        name: 'GitHub',
        prefix: 'github',
        auth: 'oauth',
        provider: 'github',
        handler: 'GitHubService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition, mockOAuthClient);
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'github_create-issue',
        params: {}
      };
      
      (mockOAuthClient.getToken as any).mockRejectedValue(
        new Error('OAuth token expired')
      );
      
      const response = await adapter.handleRequest(request, 'user-123');
      
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32001);
      expect(response.error?.message).toBe('Authentication failed');
      expect(mockService.handleRequest).not.toHaveBeenCalled();
    });
  });
  
  describe('API Key Services', () => {
    it('should inject API key before handling request', async () => {
      process.env.TEST_API_KEY = 'test-key-123';
      
      const definition: ServiceDefinition = {
        id: 'openai',
        name: 'OpenAI',
        prefix: 'openai',
        auth: 'api-key',
        env_var: 'TEST_API_KEY',
        handler: 'OpenAIService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition);
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'openai_complete',
        params: { prompt: 'Hello' }
      };
      
      const mockResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: { text: 'World' }
      };
      
      (mockService.handleRequest as any).mockResolvedValue(mockResponse);
      
      const response = await adapter.handleRequest(request);
      
      expect(mockService.setApiKey).toHaveBeenCalledWith('test-key-123');
      expect(mockService.handleRequest).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });
    
    it('should return error when API key not found', async () => {
      const definition: ServiceDefinition = {
        id: 'stripe',
        name: 'Stripe',
        prefix: 'stripe',
        auth: 'api-key',
        env_var: 'STRIPE_API_KEY',
        handler: 'StripeService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition);
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'stripe_create-payment',
        params: {}
      };
      
      const response = await adapter.handleRequest(request);
      
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('Internal error');
      expect(response.error?.data).toContain('API key not found');
      expect(mockService.handleRequest).not.toHaveBeenCalled();
    });
  });
  
  describe('No-Auth Services', () => {
    it('should handle request without authentication', async () => {
      const definition: ServiceDefinition = {
        id: 'weather',
        name: 'Weather',
        prefix: 'weather',
        auth: 'none',
        handler: 'WeatherService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition);
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'weather_get-current',
        params: { city: 'London' }
      };
      
      const mockResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: { temp: 20, condition: 'sunny' }
      };
      
      (mockService.handleRequest as any).mockResolvedValue(mockResponse);
      
      const response = await adapter.handleRequest(request);
      
      expect(mockService.setAccessToken).not.toHaveBeenCalled();
      expect(mockService.setApiKey).not.toHaveBeenCalled();
      expect(mockService.handleRequest).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });
  });
  
  describe('Configuration Validation', () => {
    it('should throw error for OAuth service without provider', () => {
      const definition: ServiceDefinition = {
        id: 'bad-oauth',
        name: 'Bad OAuth',
        prefix: 'bad',
        auth: 'oauth',
        handler: 'BadService'
      };
      
      expect(() => {
        new UniversalAdapter(mockService, definition, mockOAuthClient);
      }).toThrow('OAuth service bad-oauth missing provider');
    });
    
    it('should throw error for API key service without env_var', () => {
      const definition: ServiceDefinition = {
        id: 'bad-api',
        name: 'Bad API',
        prefix: 'bad',
        auth: 'api-key',
        handler: 'BadService'
      };
      
      expect(() => {
        new UniversalAdapter(mockService, definition);
      }).toThrow('API key service bad-api missing env_var');
    });
    
    it('should throw error for OAuth service without OAuth client', () => {
      const definition: ServiceDefinition = {
        id: 'google-calendar',
        name: 'Google Calendar',
        prefix: 'google-calendar',
        auth: 'oauth',
        provider: 'google',
        handler: 'GoogleCalendarService'
      };
      
      expect(() => {
        new UniversalAdapter(mockService, definition);
      }).toThrow('OAuth service google-calendar requires OAuth client');
    });
  });
  
  describe('Service Lifecycle', () => {
    it('should initialize service when initialize is called', async () => {
      const definition: ServiceDefinition = {
        id: 'test',
        name: 'Test',
        prefix: 'test',
        auth: 'none',
        handler: 'TestService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition);
      await adapter.initialize();
      
      expect(mockService.initialize).toHaveBeenCalled();
    });
    
    it('should destroy service when destroy is called', async () => {
      const definition: ServiceDefinition = {
        id: 'test',
        name: 'Test',
        prefix: 'test',
        auth: 'none',
        handler: 'TestService'
      };
      
      const adapter = new UniversalAdapter(mockService, definition);
      await adapter.destroy();
      
      expect(mockService.destroy).toHaveBeenCalled();
    });
    
    it('should get tools from service', async () => {
      const definition: ServiceDefinition = {
        id: 'test',
        name: 'Test',
        prefix: 'test',
        auth: 'none',
        handler: 'TestService'
      };
      
      const mockTools = {
        tools: [
          { name: 'tool1', description: 'Tool 1' },
          { name: 'tool2', description: 'Tool 2' }
        ]
      };
      
      (mockService.getTools as any).mockResolvedValue(mockTools);
      
      const adapter = new UniversalAdapter(mockService, definition);
      const tools = await adapter.getTools();
      
      expect(tools).toEqual(mockTools);
    });
    
    it('should return default tools when service has no getTools', async () => {
      const definition: ServiceDefinition = {
        id: 'test',
        name: 'Test Service',
        prefix: 'test',
        auth: 'none',
        handler: 'TestService'
      };
      
      const serviceWithoutTools: MCPService = {
        handleRequest: vi.fn()
      };
      
      const adapter = new UniversalAdapter(serviceWithoutTools, definition);
      const tools = await adapter.getTools();
      
      expect(tools).toEqual({
        tools: [],
        description: 'Test Service service'
      });
    });
  });
  
  describe('Helper Methods', () => {
    it('should correctly identify auth requirements', () => {
      const oauthDef: ServiceDefinition = {
        id: 'oauth',
        name: 'OAuth Service',
        prefix: 'oauth',
        auth: 'oauth',
        provider: 'google',
        handler: 'OAuthService'
      };
      
      const apiKeyDef: ServiceDefinition = {
        id: 'api',
        name: 'API Service',
        prefix: 'api',
        auth: 'api-key',
        env_var: 'API_KEY',
        handler: 'ApiService'
      };
      
      const noAuthDef: ServiceDefinition = {
        id: 'none',
        name: 'No Auth Service',
        prefix: 'none',
        auth: 'none',
        handler: 'NoAuthService'
      };
      
      const oauthAdapter = new UniversalAdapter(mockService, oauthDef, mockOAuthClient);
      const apiAdapter = new UniversalAdapter(mockService, apiKeyDef);
      const noAuthAdapter = new UniversalAdapter(mockService, noAuthDef);
      
      expect(oauthAdapter.requiresAuth()).toBe(true);
      expect(apiAdapter.requiresAuth()).toBe(true);
      expect(noAuthAdapter.requiresAuth()).toBe(false);
    });
    
    it('should return service definition', () => {
      const definition: ServiceDefinition = {
        id: 'test',
        name: 'Test Service',
        prefix: 'test',
        auth: 'none',
        handler: 'TestService',
        config: { custom: 'value' }
      };
      
      const adapter = new UniversalAdapter(mockService, definition);
      expect(adapter.getDefinition()).toEqual(definition);
    });
  });
});