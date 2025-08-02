export { UserService } from './user.service';
export { OAuthService } from './oauth.service';
export { UsageService } from './usage.service';
export { McpTokenService } from './mcp-token.service';
export { SlugGenerator } from './slug-generator';

// Export singleton instances for convenience
import { UserService } from './user.service';
import { OAuthService } from './oauth.service';
import { UsageService } from './usage.service';
import { McpTokenService } from './mcp-token.service';

export const userService = new UserService();
export const oauthService = new OAuthService();
export const usageService = new UsageService();
export const mcpTokenService = new McpTokenService();