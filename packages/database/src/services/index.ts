export { UserService } from './user.service';
export { OAuthService } from './oauth.service';
export { UsageService } from './usage.service';

// Export singleton instances for convenience
import { UserService } from './user.service';
import { OAuthService } from './oauth.service';
import { UsageService } from './usage.service';

export const userService = new UserService();
export const oauthService = new OAuthService();
export const usageService = new UsageService();