import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenList } from '../components/TokenList';
import { CreateTokenModal } from '../components/CreateTokenModal';
import { tokenApi } from '../services/api';

interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function TokensPage() {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Check if user is authenticated
  useEffect(() => {
    const session = localStorage.getItem('relayforge_session');
    if (!session) {
      navigate('/');
    }
  }, [navigate]);

  // Load tokens
  const loadTokens = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await tokenApi.listTokens();
      setTokens(response.tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
      // If unauthorized, redirect to home
      if (err instanceof Error && err.message.includes('401')) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const handleTokenCreated = (newToken: Token) => {
    setTokens([newToken, ...tokens]);
    setShowCreateModal(false);
  };

  const handleTokenRevoked = async (tokenId: string) => {
    try {
      await tokenApi.revokeToken(tokenId);
      setTokens(tokens.filter(t => t.id !== tokenId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/')}
              className="text-blue-600 hover:text-blue-800 mb-4 flex items-center"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-900">API Tokens</h1>
            <p className="text-gray-600 mt-2">
              Manage your MCP bearer tokens for API access
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Create Token Button */}
          <div className="mb-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Create New Token
            </button>
          </div>

          {/* Token List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <TokenList 
              tokens={tokens} 
              onRevoke={handleTokenRevoked}
            />
          )}

          {/* Create Token Modal */}
          {showCreateModal && (
            <CreateTokenModal
              onClose={() => setShowCreateModal(false)}
              onTokenCreated={handleTokenCreated}
            />
          )}
        </div>
      </div>
    </div>
  );
}