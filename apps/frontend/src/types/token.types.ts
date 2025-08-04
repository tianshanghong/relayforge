export interface McpToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  plainToken?: string; // Only present when first created
}

export interface CreateTokenResponse {
  success: boolean;
  token: McpToken;
}

export interface ListTokensResponse {
  success: true;
  tokens: McpToken[];
}

export interface DeleteTokenResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ApiError {
  success: false;
  error: string;
  message?: string;
}