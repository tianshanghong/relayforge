import { OAuthProvider } from './base.provider';
import { createGoogleProvider } from './google.provider';

export class ProviderRegistry {
  private providers: Map<string, OAuthProvider> = new Map();

  constructor() {
    this.registerProviders();
  }

  private registerProviders() {
    // Register Google provider
    this.providers.set('google', createGoogleProvider());

    // Future providers can be registered here
    // if (config.GITHUB_CLIENT_ID) {
    //   this.providers.set('github', createGitHubProvider());
    // }
    // if (config.SLACK_CLIENT_ID) {
    //   this.providers.set('slack', createSlackProvider());
    // }
  }

  get(name: string): OAuthProvider | undefined {
    return this.providers.get(name);
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  getAll(): Map<string, OAuthProvider> {
    return this.providers;
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();