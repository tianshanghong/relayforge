/**
 * Type definitions for Coinbase API v2 responses
 */

export interface CoinbaseCurrency {
  code: string;
  name: string;
  color: string;
  exponent: number;
  type: string;
  address_regex?: string;
}

export interface CoinbaseBalance {
  amount: string;
  currency: string;
}

export interface CoinbaseAccount {
  id: string;
  name: string;
  primary: boolean;
  type: string;
  currency: CoinbaseCurrency;
  balance: CoinbaseBalance;
  native_balance?: CoinbaseBalance;
  created_at: string;
  updated_at: string;
  resource: string;
  resource_path: string;
}

export interface CoinbaseTransaction {
  id: string;
  type: string;
  status: string;
  amount: CoinbaseBalance;
  native_amount?: CoinbaseBalance;
  description?: string;
  created_at: string;
  updated_at: string;
  resource: string;
  resource_path: string;
  details?: {
    title?: string;
    subtitle?: string;
    payment_method_name?: string;
  };
  network?: {
    status: string;
    hash?: string;
    confirmation_url?: string;
  };
}

export interface CoinbaseExchangeRates {
  currency: string;
  rates: Record<string, string>;
}

export interface CoinbaseApiResponse<T> {
  data: T;
  pagination?: {
    ending_before?: string;
    starting_after?: string;
    limit: number;
    order: string;
    previous_uri?: string;
    next_uri?: string;
  };
}

export interface CoinbaseError {
  id: string;
  message: string;
  errors?: Array<{
    id: string;
    message: string;
    field?: string;
  }>;
}