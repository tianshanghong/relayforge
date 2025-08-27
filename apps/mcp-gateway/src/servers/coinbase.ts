import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServerHandler } from '@relayforge/mcp-adapter';
import { MCPRequest, MCPResponse } from '@relayforge/shared';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

/**
 * Coinbase MCP Server - Read-only access to Coinbase accounts
 * Requires COINBASE_API_KEY_NAME and COINBASE_API_PRIVATE_KEY environment variables
 */
export class CoinbaseMCPServer implements MCPServerHandler {
  private server: Server<{ method: string }>;  
  private apiKeyName?: string;
  private apiPrivateKey?: string;
  private client?: AxiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'coinbase-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  /**
   * Set environment variables (including API credentials)
   */
  setEnvironment(env: Record<string, string>): void {
    // Extract Coinbase credentials if present
    this.apiKeyName = env['COINBASE_API_KEY_NAME'];
    this.apiPrivateKey = env['COINBASE_API_PRIVATE_KEY'];
    
    if (this.apiKeyName && this.apiPrivateKey) {
      this.initializeClient();
    }
  }

  /**
   * Initialize the Coinbase API client
   */
  private initializeClient(): void {
    this.client = axios.create({
      baseURL: 'https://api.coinbase.com',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config) => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const method = config.method?.toUpperCase() || 'GET';
      const path = config.url || '';
      const body = config.data ? JSON.stringify(config.data) : '';
      
      const message = timestamp + method + path + body;
      const signature = this.signRequest(message);
      
      config.headers['CB-ACCESS-KEY'] = this.apiKeyName;
      config.headers['CB-ACCESS-SIGN'] = signature;
      config.headers['CB-ACCESS-TIMESTAMP'] = timestamp;
      config.headers['CB-VERSION'] = '2024-01-01'; // Latest API version
      
      return config;
    });
  }

  /**
   * Sign a request using the private key
   */
  private signRequest(message: string): string {
    if (!this.apiPrivateKey) {
      throw new Error('Private key not configured');
    }
    
    // Coinbase uses JWT for API v3 (CDP API)
    // For now, implementing v2 API with HMAC
    const key = Buffer.from(this.apiPrivateKey, 'base64');
    const hmac = crypto.createHmac('sha256', key);
    const signature = hmac.update(message).digest('base64');
    
    return signature;
  }

  /**
   * Ensure the client is initialized before making requests
   */
  private ensureClient(): void {
    if (!this.client || !this.apiKeyName || !this.apiPrivateKey) {
      throw new McpError(
        ErrorCode.InternalError,
        'Coinbase API not configured. Please set COINBASE_API_KEY_NAME and COINBASE_API_PRIVATE_KEY environment variables.'
      );
    }
  }

  private setupToolHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'coinbase_list_accounts',
            description: 'List all accounts with balances',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'coinbase_get_account',
            description: 'Get details for a specific account',
            inputSchema: {
              type: 'object',
              properties: {
                account_id: {
                  type: 'string',
                  description: 'The account ID',
                },
              },
              required: ['account_id'],
            },
          },
          {
            name: 'coinbase_list_transactions',
            description: 'List transactions for an account',
            inputSchema: {
              type: 'object',
              properties: {
                account_id: {
                  type: 'string',
                  description: 'The account ID',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of transactions to return (default 25)',
                  default: 25,
                },
              },
              required: ['account_id'],
            },
          },
          {
            name: 'coinbase_get_exchange_rates',
            description: 'Get current exchange rates for a currency',
            inputSchema: {
              type: 'object',
              properties: {
                currency: {
                  type: 'string',
                  description: 'The currency code (e.g., USD, BTC)',
                  default: 'USD',
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'coinbase_list_accounts':
          return await this.listAccounts();
        
        case 'coinbase_get_account':
          return await this.getAccount(request.params.arguments as any);
        
        case 'coinbase_list_transactions':
          return await this.listTransactions(request.params.arguments as any);
        
        case 'coinbase_get_exchange_rates':
          return await this.getExchangeRates(request.params.arguments as any);
        
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  /**
   * List all accounts
   */
  private async listAccounts() {
    this.ensureClient();
    
    try {
      const response = await this.client!.get('/v2/accounts');
      const accounts = response.data.data;
      
      // Format account data for display
      const formattedAccounts = accounts.map((account: any) => ({
        id: account.id,
        name: account.name,
        currency: account.currency.code,
        balance: account.balance.amount,
        native_balance: account.native_balance?.amount,
        native_currency: account.native_balance?.currency,
        type: account.type,
      }));
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedAccounts, null, 2),
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list accounts: ${error.message}`
      );
    }
  }

  /**
   * Get specific account details
   */
  private async getAccount({ account_id }: { account_id: string }) {
    this.ensureClient();
    
    try {
      const response = await this.client!.get(`/v2/accounts/${account_id}`);
      const account = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: account.id,
              name: account.name,
              currency: account.currency.code,
              balance: account.balance.amount,
              native_balance: account.native_balance?.amount,
              native_currency: account.native_balance?.currency,
              type: account.type,
              created_at: account.created_at,
              updated_at: account.updated_at,
              resource: account.resource,
              resource_path: account.resource_path,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get account: ${error.message}`
      );
    }
  }

  /**
   * List transactions for an account
   */
  private async listTransactions({ account_id, limit = 25 }: { account_id: string; limit?: number }) {
    this.ensureClient();
    
    try {
      const response = await this.client!.get(`/v2/accounts/${account_id}/transactions`, {
        params: { limit },
      });
      const transactions = response.data.data;
      
      // Format transaction data
      const formattedTransactions = transactions.map((tx: any) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: tx.amount.amount,
        currency: tx.amount.currency,
        native_amount: tx.native_amount?.amount,
        native_currency: tx.native_amount?.currency,
        description: tx.description,
        created_at: tx.created_at,
        details: tx.details,
      }));
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedTransactions, null, 2),
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list transactions: ${error.message}`
      );
    }
  }

  /**
   * Get exchange rates
   */
  private async getExchangeRates({ currency = 'USD' }: { currency?: string }) {
    this.ensureClient();
    
    try {
      const response = await this.client!.get(`/v2/exchange-rates`, {
        params: { currency },
      });
      const rates = response.data.data;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              currency: rates.currency,
              rates: rates.rates,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get exchange rates: ${error.message}`
      );
    }
  }

  /**
   * Handle MCP request - bridge between MCP protocol and SDK Server
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;

    try {
      // Handle tools/list request
      if (method === 'tools/list') {
        const handlers = (this.server as any)._requestHandlers || (this.server as any).requestHandlers;
        if (handlers) {
          const handler = handlers.get('tools/list');
          if (handler) {
            const result = await handler({
              jsonrpc: '2.0',
              id: id || 1,
              method: 'tools/list',
              params: {},
            });
            return result as MCPResponse;
          }
        }
        
        // Fallback: Return hardcoded tool list
        return {
          jsonrpc: '2.0',
          id: id || 1,
          result: {
            tools: [
              {
                name: 'coinbase_list_accounts',
                description: 'List all accounts with balances',
                inputSchema: { type: 'object', properties: {} },
              },
              {
                name: 'coinbase_get_account',
                description: 'Get details for a specific account',
                inputSchema: {
                  type: 'object',
                  properties: {
                    account_id: { type: 'string', description: 'The account ID' },
                  },
                  required: ['account_id'],
                },
              },
              {
                name: 'coinbase_list_transactions',
                description: 'List transactions for an account',
                inputSchema: {
                  type: 'object',
                  properties: {
                    account_id: { type: 'string', description: 'The account ID' },
                    limit: { type: 'number', description: 'Maximum number of transactions to return (default 25)', default: 25 },
                  },
                  required: ['account_id'],
                },
              },
              {
                name: 'coinbase_get_exchange_rates',
                description: 'Get current exchange rates for a currency',
                inputSchema: {
                  type: 'object',
                  properties: {
                    currency: { type: 'string', description: 'The currency code (e.g., USD, BTC)', default: 'USD' },
                  },
                },
              },
            ],
          },
        };
      }

      // Handle tools/call request
      if (method === 'tools/call') {
        const handlers = (this.server as any)._requestHandlers || (this.server as any).requestHandlers;
        if (handlers) {
          const handler = handlers.get('tools/call');
          if (handler) {
            const result = await handler({
              jsonrpc: '2.0',
              id: id || 1,
              method: 'tools/call',
              params: params as any,
            });
            return result as MCPResponse;
          }
        }
        
        // Fallback to internal method handling
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        
        switch (toolName) {
          case 'coinbase_list_accounts': {
            const result = await this.listAccounts();
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          case 'coinbase_get_account': {
            const result = await this.getAccount(toolArgs as any);
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          case 'coinbase_list_transactions': {
            const result = await this.listTransactions(toolArgs as any);
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          case 'coinbase_get_exchange_rates': {
            const result = await this.getExchangeRates(toolArgs as any);
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }
      }

      // Handle direct method calls (backward compatibility with prefixed methods)
      if (method.startsWith('coinbase_')) {
        const handlers = (this.server as any)._requestHandlers || (this.server as any).requestHandlers;
        if (handlers) {
          const handler = handlers.get('tools/call');
          if (handler) {
            const result = await handler({
              jsonrpc: '2.0',
              id: id || 1,
              method: 'tools/call',
              params: {
                name: method,
                arguments: params || {},
              },
            });
            return result as MCPResponse;
          }
        }
        
        // Fallback to direct handling
        switch (method) {
          case 'coinbase_list_accounts': {
            const result = await this.listAccounts();
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          case 'coinbase_get_account': {
            const result = await this.getAccount(params as any);
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          case 'coinbase_list_transactions': {
            const result = await this.listTransactions(params as any);
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          case 'coinbase_get_exchange_rates': {
            const result = await this.getExchangeRates(params as any);
            return { jsonrpc: '2.0', id: id || 1, result };
          }
          default:
            return {
              jsonrpc: '2.0',
              id: id || 1,
              error: {
                code: -32601,
                message: `Method not found: ${method}`,
              },
            };
        }
      }

      // Method not found
      return {
        jsonrpc: '2.0',
        id: id || 1,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: id || 1,
        error: {
          code: error.code || -32603,
          message: error.message || 'Internal error',
        },
      };
    }
  }
}