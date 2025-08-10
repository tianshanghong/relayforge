export { UserService } from './user.service.js';
export { OAuthService } from './oauth.service.js';
export { UsageService } from './usage.service.js';
export { McpTokenService, type McpTokenWithPlainText } from './mcp-token.service.js';
export { SlugGenerator } from './slug-generator.js';

// Export singleton instances for convenience
import { UserService } from './user.service.js';
import { OAuthService } from './oauth.service.js';
import { UsageService } from './usage.service.js';
import { McpTokenService } from './mcp-token.service.js';

export const userService = new UserService();
export const oauthService = new OAuthService();
export const usageService = new UsageService();
export const mcpTokenService = new McpTokenService();