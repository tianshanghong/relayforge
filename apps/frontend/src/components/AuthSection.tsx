import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

interface OAuthProvider {
  name: string;
  displayName: string;
  icon: string;
  authUrl: string;
}

interface UserSession {
  email: string;
  credits: number;
  mcpUrl: string;
  mcpToken?: string; // Only present for new users
}

export function AuthSection() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for session from URL params (after OAuth redirect)
    const params = new URLSearchParams(window.location.search);
    const mcpUrl = params.get('mcp_url');
    const mcpToken = params.get('mcp_token'); // Only for new users
    const email = params.get('email');
    const credits = params.get('credits');
    
    if (mcpUrl && email && credits) {
      const newSession: UserSession = {
        email,
        credits: parseInt(credits),
        mcpUrl,
        ...(mcpToken && { mcpToken })
      };
      setSession(newSession);
      
      // Only store non-sensitive data in localStorage
      const storedSession = { email, credits: newSession.credits, mcpUrl };
      localStorage.setItem('relayforge_session', JSON.stringify(storedSession));
      
      // Clean URL (especially important to remove token from URL)
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Check localStorage for existing session
      const stored = localStorage.getItem('relayforge_session');
      if (stored) {
        setSession(JSON.parse(stored));
      }
    }

    // Fetch OAuth providers
    authApi.getProviders()
      .then(data => {
        setProviders(data.providers || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch providers:', err);
        setLoading(false);
      });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('relayforge_session');
    setSession(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Your Account</h3>
        <div className="space-y-4">
          <div>
            <p className="text-gray-600">Logged in as</p>
            <p className="font-semibold text-lg">{session.email}</p>
          </div>
          <div>
            <p className="text-gray-600">Credits</p>
            <p className="font-semibold text-lg">${(session.credits / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-600">Your MCP URL</p>
            <div className="mt-2 p-3 bg-gray-100 rounded-lg">
              <code className="text-sm break-all">{session.mcpUrl}</code>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Use this URL in your Claude or Cursor configuration
            </p>
          </div>
          {session.mcpToken && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 font-semibold mb-2">⚠️ Save your token!</p>
              <p className="text-sm text-yellow-700 mb-3">
                This token is shown only once. Save it securely - you'll need it for authentication.
              </p>
              <div className="p-3 bg-white rounded border border-yellow-300">
                <code className="text-sm break-all font-mono">{session.mcpToken}</code>
              </div>
              <p className="text-sm text-yellow-700 mt-3">
                Add to your MCP client config:<br/>
                <code className="text-xs">Authorization: Bearer {session.mcpToken}</code>
              </p>
            </div>
          )}
          <div className="mt-4 flex space-x-3">
            <button
              onClick={() => navigate('/tokens')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Manage Tokens
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <h3 className="text-2xl font-bold text-gray-900 mb-6">Get Started</h3>
      <p className="text-gray-600 mb-6">
        Connect your Google account to get access to all MCP services with a single URL.
        You'll receive $5.00 in free credits to start!
      </p>
      
      <div className="space-y-3">
        {providers.map((provider) => {
          const oauthServiceUrl = import.meta.env.VITE_OAUTH_SERVICE_URL || 'http://localhost:3002';
          return (
            <a
              key={provider.name}
              href={`${oauthServiceUrl}${provider.authUrl}`}
              className="flex items-center justify-center w-full px-6 py-3 border border-gray-300 rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
            <img
              src={provider.icon}
              alt={provider.displayName}
              className="w-5 h-5 mr-3"
            />
              Continue with {provider.displayName}
            </a>
          );
        })}
      </div>
      
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">What you get:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✓ One MCP URL for all services</li>
          <li>✓ We handle OAuth for Google, GitHub, Slack</li>
          <li>✓ You provide API keys for OpenAI, Anthropic, etc.</li>
          <li>✓ Pay only for what you use</li>
        </ul>
      </div>
    </div>
  );
}