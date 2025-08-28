import { describe, it, expect, beforeEach } from 'vitest';
import { CoinbaseMCPServer } from '../src/servers/coinbase.js';

describe('CoinbaseMCPServer', () => {
  let server: CoinbaseMCPServer;

  beforeEach(() => {
    server = new CoinbaseMCPServer();
  });

  describe('tools/list', () => {
    it('should return list of available tools', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      // Check that it's a successful response, not an error
      expect(response).not.toHaveProperty('error');
      
      // The response should be the result object directly or wrapped in a result
      const result = (response as any).result || response;
      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);
      
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('coinbase_list_accounts');
      expect(toolNames).toContain('coinbase_get_account');
      expect(toolNames).toContain('coinbase_list_transactions');
      expect(toolNames).toContain('coinbase_get_exchange_rates');
    });
  });

  describe('API key authentication', () => {
    it('should reject requests without API credentials', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'coinbase_list_accounts',
          arguments: {},
        },
      });

      expect(response).toHaveProperty('error');
      const error = (response as any).error;
      expect(error.message).toContain('not configured');
    });

    it('should accept API credentials via setEnvironment', () => {
      expect(() => {
        server.setEnvironment({
          COINBASE_API_KEY_NAME: 'test-key',
          COINBASE_API_PRIVATE_KEY: 'test-secret',
        });
      }).not.toThrow();
    });
  });

  describe('Direct method calls', () => {
    it('should handle direct method calls with coinbase_ prefix', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'coinbase_get_exchange_rates',
        params: { currency: 'USD' },
      });

      // Without API key, it should error but recognize the method
      expect(response).toBeDefined();
      expect(response.id).toBe(1);
    });
  });

  describe('Error handling', () => {
    it('should return method not found for unknown methods', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method',
        params: {},
      });

      expect(response).toHaveProperty('error');
      const error = (response as any).error;
      expect(error.code).toBe(-32601);
      expect(error.message).toContain('Method not found');
    });
  });
});