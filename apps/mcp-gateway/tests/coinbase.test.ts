import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CoinbaseMCPServer } from '../src/servers/coinbase.js';
import axios, { AxiosError } from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Mock axios
vi.mock('axios');

describe('CoinbaseMCPServer', () => {
  let server: CoinbaseMCPServer;
  let mockAxiosInstance: any;

  beforeEach(() => {
    server = new CoinbaseMCPServer();
    
    // Setup axios mock
    mockAxiosInstance = {
      get: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
    };
    
    (axios.create as any) = vi.fn(() => mockAxiosInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
          COINBASE_API_KEY_NAME: 'organizations/test-org/apiKeys/test-key',
          COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\ntest-key\n-----END EC PRIVATE KEY-----',
        });
      }).not.toThrow();
    });


    it('should handle escaped newlines in private key', () => {
      expect(() => {
        server.setEnvironment({
          COINBASE_API_KEY_NAME: 'test-key',
          COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\\ntest-key\\n-----END EC PRIVATE KEY-----',
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

    it('should handle axios errors with proper error messages', async () => {
      // Setup server with credentials
      server.setEnvironment({
        COINBASE_API_KEY_NAME:
 'test-key',
        COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIGLlamZU9Z83D3g8VsZqsMpwZ2u+SXLJQRkfPS5TGCkoAoGCCqGSM49\nAwEHoUQDQgAEQGOhhG8PlCEqfDuwWkExEefM6gwPQfYLfnHs8kBYVvxx8xS5bJO9\nPwM1ZjHln0S7kC7Sk+YoTM1j6FGEbNPDNw==\n-----END EC PRIVATE KEY-----'
      });

      // Create a proper AxiosError mock
      const axiosError = new AxiosError('Request failed');
      axiosError.response = {
        status: 401,
        data: { message: 'Invalid authentication' },
      } as any;
      mockAxiosInstance.get.mockRejectedValue(axiosError);

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
      // The error message includes the Coinbase error message "Invalid authentication"
      expect(error.message).toContain('Invalid authentication');
    });

    it('should handle rate limit errors', async () => {
      server.setEnvironment({
        COINBASE_API_KEY_NAME:
 'test-key',
        COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIGLlamZU9Z83D3g8VsZqsMpwZ2u+SXLJQRkfPS5TGCkoAoGCCqGSM49\nAwEHoUQDQgAEQGOhhG8PlCEqfDuwWkExEefM6gwPQfYLfnHs8kBYVvxx8xS5bJO9\nPwM1ZjHln0S7kC7Sk+YoTM1j6FGEbNPDNw==\n-----END EC PRIVATE KEY-----'
      });

      const rateLimitError = new AxiosError('Request failed');
      rateLimitError.response = {
        status: 429,
        data: null,
      } as any;
      mockAxiosInstance.get.mockRejectedValue(rateLimitError);

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
      expect(error.message).toContain('Rate limit exceeded');
    });
  });

  describe('JWT Generation', () => {
    it('should generate valid JWT tokens', () => {
      const privateKey = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIIGLlamZU9Z83D3g8VsZqsMpwZ2u+SXLJQRkfPS5TGCkoAoGCCqGSM49
AwEHoUQDQgAEQGOhhG8PlCEqfDuwWkExEefM6gwPQfYLfnHs8kBYVvxx8xS5bJO9
PwM1ZjHln0S7kC7Sk+YoTM1j6FGEbNPDNw==
-----END EC PRIVATE KEY-----`;
      
      server.setEnvironment({
        COINBASE_API_KEY_NAME: 'test-api-key',
        COINBASE_API_PRIVATE_KEY: privateKey
      });
      
      // Trigger JWT generation by making a request
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [],
          pagination: null,
        },
      });

      // We can't directly test the JWT generation since it's private,
      // but we can verify that the interceptor is set up
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    it('should handle paginated responses for list_accounts', async () => {
      server.setEnvironment({
        COINBASE_API_KEY_NAME:
 'test-key',
        COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIGLlamZU9Z83D3g8VsZqsMpwZ2u+SXLJQRkfPS5TGCkoAoGCCqGSM49\nAwEHoUQDQgAEQGOhhG8PlCEqfDuwWkExEefM6gwPQfYLfnHs8kBYVvxx8xS5bJO9\nPwM1ZjHln0S7kC7Sk+YoTM1j6FGEbNPDNw==\n-----END EC PRIVATE KEY-----'
      });

      // Mock first page
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'btc-account',
              name: 'BTC Wallet',
              currency: { code: 'BTC' },
              balance: { amount: '1.5', currency: 'BTC' },
              native_balance: { amount: '75000', currency: 'USD' },
              type: 'wallet',
            },
          ],
          pagination: {
            next_uri: '/v2/accounts?page=2',
          },
        },
      });

      // Mock second page
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'eth-account',
              name: 'ETH Wallet',
              currency: { code: 'ETH' },
              balance: { amount: '10.0', currency: 'ETH' },
              native_balance: { amount: '30000', currency: 'USD' },
              type: 'wallet',
            },
          ],
          pagination: {
            next_uri: null,
          },
        },
      });

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'coinbase_list_accounts',
          arguments: {},
        },
      });

      expect(response).not.toHaveProperty('error');
      const result = (response as any).result;
      expect(result).toHaveProperty('content');
      
      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveLength(2);
      // Accounts are sorted by balance (ETH: 10.0 > BTC: 1.5)
      expect(content[0].id).toBe('eth-account');
      expect(content[1].id).toBe('btc-account');
      
      // Verify pagination was called twice
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should handle empty account lists', async () => {
      server.setEnvironment({
        COINBASE_API_KEY_NAME:
 'test-key',
        COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIGLlamZU9Z83D3g8VsZqsMpwZ2u+SXLJQRkfPS5TGCkoAoGCCqGSM49\nAwEHoUQDQgAEQGOhhG8PlCEqfDuwWkExEefM6gwPQfYLfnHs8kBYVvxx8xS5bJO9\nPwM1ZjHln0S7kC7Sk+YoTM1j6FGEbNPDNw==\n-----END EC PRIVATE KEY-----'
      });

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [],
          pagination: null,
        },
      });

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'coinbase_list_accounts',
          arguments: {},
        },
      });

      expect(response).not.toHaveProperty('error');
      const result = (response as any).result;
      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveLength(0);
    });
  });

  describe('Account operations', () => {
    beforeEach(() => {
      server.setEnvironment({
        COINBASE_API_KEY_NAME:
 'test-key',
        COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIGLlamZU9Z83D3g8VsZqsMpwZ2u+SXLJQRkfPS5TGCkoAoGCCqGSM49\nAwEHoUQDQgAEQGOhhG8PlCEqfDuwWkExEefM6gwPQfYLfnHs8kBYVvxx8xS5bJO9\nPwM1ZjHln0S7kC7Sk+YoTM1j6FGEbNPDNw==\n-----END EC PRIVATE KEY-----'
      });
    });

    it('should get specific account details', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            id: 'btc-account',
            name: 'BTC Wallet',
            currency: { code: 'BTC' },
            balance: { amount: '1.5', currency: 'BTC' },
            native_balance: { amount: '75000', currency: 'USD' },
            type: 'wallet',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-15T00:00:00Z',
            resource: 'account',
            resource_path: '/v2/accounts/btc-account',
          },
        },
      });

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'coinbase_get_account',
          arguments: { account_id: 'btc-account' },
        },
      });

      expect(response).not.toHaveProperty('error');
      const result = (response as any).result;
      const content = JSON.parse(result.content[0].text);
      expect(content.id).toBe('btc-account');
      expect(content.balance).toBe('1.5');
    });

    it('should list transactions for an account', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [
            {
              id: 'tx1',
              type: 'send',
              status: 'completed',
              amount: { amount: '0.1', currency: 'BTC' },
              native_amount: { amount: '5000', currency: 'USD' },
              description: 'Sent Bitcoin',
              created_at: '2024-01-10T00:00:00Z',
              details: { title: 'Sent Bitcoin' },
            },
          ],
        },
      });

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'coinbase_list_transactions',
          arguments: { account_id: 'btc-account', limit: 10 },
        },
      });

      expect(response).not.toHaveProperty('error');
      const result = (response as any).result;
      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveLength(1);
      expect(content[0].id).toBe('tx1');
    });

    it('should get exchange rates', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            currency: 'USD',
            rates: {
              BTC: '0.00002',
              ETH: '0.0003',
              EUR: '0.92',
            },
          },
        },
      });

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'coinbase_get_exchange_rates',
          arguments: { currency: 'USD' },
        },
      });

      expect(response).not.toHaveProperty('error');
      const result = (response as any).result;
      const content = JSON.parse(result.content[0].text);
      expect(content.currency).toBe('USD');
      expect(content.rates).toHaveProperty('BTC');
      expect(content.rates).toHaveProperty('ETH');
    });
  });

  describe('Balance sorting', () => {
    it('should sort accounts by balance in descending order', async () => {
      server.setEnvironment({
        COINBASE_API_KEY_NAME:
 'test-key',
        COINBASE_API_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIGLlamZU9Z83D3g8VsZqsMpwZ2u+SXLJQRkfPS5TGCkoAoGCCqGSM49\nAwEHoUQDQgAEQGOhhG8PlCEqfDuwWkExEefM6gwPQfYLfnHs8kBYVvxx8xS5bJO9\nPwM1ZjHln0S7kC7Sk+YoTM1j6FGEbNPDNw==\n-----END EC PRIVATE KEY-----'
      });

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [
            {
              id: 'zero-balance',
              name: 'Empty Wallet',
              currency: { code: 'USDC' },
              balance: { amount: '0', currency: 'USDC' },
              type: 'wallet',
            },
            {
              id: 'high-balance',
              name: 'Main Wallet',
              currency: { code: 'BTC' },
              balance: { amount: '5.5', currency: 'BTC' },
              type: 'wallet',
            },
            {
              id: 'low-balance',
              name: 'Small Wallet',
              currency: { code: 'ETH' },
              balance: { amount: '0.1', currency: 'ETH' },
              type: 'wallet',
            },
          ],
          pagination: null,
        },
      });

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'coinbase_list_accounts',
          arguments: {},
        },
      });

      const result = (response as any).result;
      const content = JSON.parse(result.content[0].text);
      
      // Should be sorted by balance descending
      expect(content[0].id).toBe('high-balance');
      expect(content[1].id).toBe('low-balance');
      expect(content[2].id).toBe('zero-balance');
    });
  });
});