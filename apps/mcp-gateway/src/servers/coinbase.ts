import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServerHandler } from '@relayforge/mcp-adapter';
import { MCPRequest, MCPResponse } from '@relayforge/shared';
import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  CoinbaseAccount,
  CoinbaseTransaction,
  CoinbaseExchangeRates,
  CoinbaseApiResponse,
  CoinbaseError,
} from '../types/coinbase.types.js';

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
    // Handle escaped newlines in private key
    this.apiPrivateKey = env['COINBASE_API_PRIVATE_KEY']?.replace(/\\n/g, '\n');
    
    if (this.apiKeyName && this.apiPrivateKey) {
      this.initializeClient();
    }
  }
  
  /**
   * Set credentials from headers (alternative to environment)
   */
  setCredentials(apiKeyName: string, apiPrivateKey: string): void {
    this.apiKeyName = apiKeyName;
    this.apiPrivateKey = apiPrivateKey.replace(/\\n/g, '\n');
    
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

    // Add request interceptor for JWT authentication
    this.client.interceptors.request.use((config) => {
      const method = config.method?.toUpperCase() || 'GET';
      const path = config.url || '';
      
      // Generate JWT token for this request
      const token = this.generateJWT(path, method);
      
      config.headers['Authorization'] = `Bearer ${token}`;
      config.headers['CB-VERSION'] = '2024-01-01'; // API version
      
      return config;
    });
  }

  /**
   * Generate a JWT token for Coinbase CDP API authentication
   */
  private generateJWT(path: string, method: string): string {
    if (!this.apiPrivateKey) {
      throw new Error('Private key not configured');
    }
    
    // Extract base path without query parameters
    const basePath = path.split('?')[0];
    const domain = 'api.coinbase.com';
    const fullUri = `${method} ${domain}${basePath}`;
    const now = Math.floor(Date.now() / 1000);
    
    // JWT header fields
    const header = {
      alg: 'ES256',
      kid: this.apiKeyName,
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    // JWT payload fields
    const payload = {
      iss: 'cdp',              // Coinbase Developer Platform
      sub: this.apiKeyName,
      exp: now + 120,          // Valid for 2 minutes
      nbf: now,
      uri: fullUri
    };
    
    try {
      // Sign with ES256 algorithm using EC private key
      const token = jwt.sign(payload, this.apiPrivateKey.replace(/\\n/g, '\n'), {
        algorithm: 'ES256',
        header
      });
      return token;
    } catch (error) {
      throw new Error(`Failed to generate JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
        tools: this.getToolDefinitions(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.executeTool(
        request.params.name,
        request.params.arguments as Record<string, unknown>
      );
    });
  }

  /**
   * List all accounts (with pagination support)
   */
  private async listAccounts() {
    this.ensureClient();
    
    try {
      let allAccounts: CoinbaseAccount[] = [];
      let nextUri: string | null = '/v2/accounts?limit=100';
      
      // Fetch all pages
      while (nextUri) {
        const response: AxiosResponse<CoinbaseApiResponse<CoinbaseAccount[]>> = await this.client!.get<CoinbaseApiResponse<CoinbaseAccount[]>>(nextUri);
        const accounts = response.data.data;
        allAccounts = allAccounts.concat(Array.isArray(accounts) ? accounts : [accounts as any]);
        
        // Get next page URL if it exists
        nextUri = response.data.pagination?.next_uri || null;
      }
      
      // Format account data for display
      const formattedAccounts = allAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency.code,
        balance: account.balance.amount,
        native_balance: account.native_balance?.amount,
        native_currency: account.native_balance?.currency,
        type: account.type,
      }));
      
      // Sort by balance (descending) to show non-zero balances first
      formattedAccounts.sort((a, b) => {
        const balA = parseFloat(a.balance) || 0;
        const balB = parseFloat(b.balance) || 0;
        return balB - balA;
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedAccounts, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list accounts: ${this.getErrorMessage(error)}`
      );
    }
  }

  /**
   * Get specific account details
   */
  private async getAccount({ account_id }: { account_id: string }) {
    this.ensureClient();
    
    try {
      const response = await this.client!.get<CoinbaseApiResponse<CoinbaseAccount>>(`/v2/accounts/${account_id}`);
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
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get account: ${this.getErrorMessage(error)}`
      );
    }
  }

  /**
   * List transactions for an account
   */
  private async listTransactions({ account_id, limit = 25 }: { account_id: string; limit?: number }) {
    this.ensureClient();
    
    try {
      const response = await this.client!.get<CoinbaseApiResponse<CoinbaseTransaction[]>>(
        `/v2/accounts/${account_id}/transactions`,
        { params: { limit } }
      );
      const transactions = response.data.data;
      
      // Format transaction data
      const formattedTransactions = transactions.map((tx) => ({
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
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list transactions: ${this.getErrorMessage(error)}`
      );
    }
  }

  /**
   * Get exchange rates
   */
  private async getExchangeRates({ currency = 'USD' }: { currency?: string }) {
    this.ensureClient();
    
    try {
      const response = await this.client!.get<CoinbaseApiResponse<CoinbaseExchangeRates>>(
        `/v2/exchange-rates`,
        { params: { currency } }
      );
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
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get exchange rates: ${this.getErrorMessage(error)}`
      );
    }
  }

  /**
   * Get error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
      const coinbaseError = error.response?.data as CoinbaseError | undefined;
      if (coinbaseError?.message) {
        return coinbaseError.message;
      }
      if (error.response?.status === 401) {
        return 'Authentication failed. Check your API credentials.';
      }
      if (error.response?.status === 403) {
        return 'Forbidden. Check your API key permissions.';
      }
      if (error.response?.status === 404) {
        return 'Resource not found.';
      }
      if (error.response?.status === 429) {
        return 'Rate limit exceeded. Please try again later.';
      }
      return error.message || 'Request failed';
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error occurred';
  }

  /**
   * Get tool definitions for the tools/list response
   */
  private getToolDefinitions() {
    return [
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
    ];
  }

  /**
   * Execute a tool by name with given arguments
   */
  private async executeTool(toolName: string, args: Record<string, unknown> = {}): Promise<any> {
    switch (toolName) {
      case 'coinbase_list_accounts':
        return await this.listAccounts();
      case 'coinbase_get_account':
        return await this.getAccount(args as { account_id: string });
      case 'coinbase_list_transactions':
        return await this.listTransactions(args as { account_id: string; limit?: number });
      case 'coinbase_get_exchange_rates':
        return await this.getExchangeRates(args as { currency?: string });
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
  }

  /**
   * Handle MCP request - bridge between MCP protocol and SDK Server
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;
    const responseId = id || 1;
    
    // Check for credentials in params (for tools/call)
    if (method === 'tools/call' && params?.arguments) {
      const args = params.arguments as Record<string, any>;
      if (args._coinbase_api_key_name && args._coinbase_private_key) {
        // Set credentials from parameters
        this.setCredentials(args._coinbase_api_key_name, args._coinbase_private_key);
        // Remove credentials from arguments before processing
        delete args._coinbase_api_key_name;
        delete args._coinbase_private_key;
      }
    }

    try {
      // Handle tools/list request
      if (method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id: responseId,
          result: {
            tools: this.getToolDefinitions(),
          },
        };
      }

      // Handle tools/call request
      if (method === 'tools/call') {
        const toolName = params?.name as string;
        const toolArgs = params?.arguments || {};
        const result = await this.executeTool(toolName, toolArgs as Record<string, unknown>);
        return { jsonrpc: '2.0', id: responseId, result };
      }

      // Handle direct method calls (backward compatibility with prefixed methods)
      if (method.startsWith('coinbase_')) {
        const result = await this.executeTool(method, params as Record<string, unknown>);
        return { jsonrpc: '2.0', id: responseId, result };
      }

      // Method not found
      return {
        jsonrpc: '2.0',
        id: responseId,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
    } catch (error) {
      const errorCode = error instanceof McpError ? error.code : -32603;
      const errorMessage = error instanceof McpError ? error.message : this.getErrorMessage(error);
      
      return {
        jsonrpc: '2.0',
        id: responseId,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }
  }
}