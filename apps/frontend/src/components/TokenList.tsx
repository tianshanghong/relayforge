import { useState } from 'react';
import { McpToken } from '../types/token.types';

interface TokenListProps {
  tokens: McpToken[];
  onRevoke: (tokenId: string) => Promise<void>;
}

export function TokenList({ tokens, onRevoke }: TokenListProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const handleRevoke = async (tokenId: string) => {
    try {
      setRevokingId(tokenId);
      await onRevoke(tokenId);
      setConfirmRevokeId(null);
    } catch (error) {
      // Error is handled by parent
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (tokens.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <p className="text-gray-500">No tokens yet. Create your first token to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tokens.map((token) => (
        <div key={token.id} className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{token.name}</h3>
              <p className="text-sm text-gray-500 mt-1 font-mono">{token.prefix}...</p>
              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <p>Created: {formatDate(token.createdAt)}</p>
                <p>
                  Last used: {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}
                </p>
              </div>
            </div>
            
            <div className="ml-4">
              {confirmRevokeId === token.id ? (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-red-600">Are you sure?</span>
                  <button
                    onClick={() => handleRevoke(token.id)}
                    disabled={revokingId === token.id}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {revokingId === token.id ? 'Revoking...' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmRevokeId(null)}
                    className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400 transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRevokeId(token.id)}
                  disabled={revokingId !== null}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  Revoke
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}