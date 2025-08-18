import { useState, useEffect } from 'react';
import { tokenApi } from '../services/api';
import { McpToken } from '../types/token.types';
import { UI_FEEDBACK_TIMEOUT, TOKEN_NAME_MAX_LENGTH } from '../constants/ui.constants';

interface CreateTokenModalProps {
  onClose: () => void;
  onTokenCreated: (token: McpToken) => void;
}

export function CreateTokenModal({ onClose, onTokenCreated }: CreateTokenModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newTokenInfo, setNewTokenInfo] = useState<McpToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Token name is required');
      return;
    }

    // Prevent double submission
    if (isSubmitted || creating) {
      return;
    }

    try {
      setIsSubmitted(true);
      setCreating(true);
      setError(null);
      const response = await tokenApi.createToken(name.trim());
      setNewToken(response.token.plainToken || null);
      // Store the token info but DON'T call onTokenCreated yet
      // We'll call it when the user clicks "Done"
      setNewTokenInfo({
        id: response.token.id,
        name: response.token.name,
        prefix: response.token.prefix,
        createdAt: response.token.createdAt,
        lastUsedAt: null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create token';
      // Check if it's a duplicate name error
      if (errorMessage.includes('already exists')) {
        setError('A token with this name already exists. Please choose a different name.');
        // Only allow retry for known validation errors
        setIsSubmitted(false);
      } else if (errorMessage.startsWith('400') || errorMessage.startsWith('401') || errorMessage.startsWith('403') || errorMessage.includes('Invalid')) {
        setError(errorMessage);
        // Allow retry for client errors (4xx)
        setIsSubmitted(false);
      } else {
        // For network errors or 5xx errors, keep isSubmitted=true to prevent duplicates
        setError(`${errorMessage}. If the token was created, it will appear in your list after refreshing.`);
        // Don't reset isSubmitted to prevent potential duplicate creation
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!newToken) return;
    
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = newToken;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
    }
  };

  // Reset copied state after feedback timeout
  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT);
      return () => clearTimeout(timeout);
    }
  }, [copied]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {!newToken ? (
          // Create token form
          <form onSubmit={handleSubmit}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Token</h2>
              
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="token-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Token Name
                </label>
                <input
                  id="token-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Claude Desktop"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                  maxLength={TOKEN_NAME_MAX_LENGTH}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Give your token a descriptive name to remember where it's used
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !name.trim() || isSubmitted}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Token'}
              </button>
            </div>
          </form>
        ) : (
          // Show new token
          <div className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Token Created!</h2>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <p className="text-yellow-800 font-semibold mb-2">⚠️ Important</p>
              <p className="text-sm text-yellow-700">
                This token will only be shown once. Make sure to copy it now and store it securely.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your New Token
              </label>
              <div className="relative">
                <div className="p-3 bg-gray-100 rounded-lg font-mono text-sm break-all pr-12">
                  {newToken}
                </div>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 p-2 text-gray-600 hover:text-gray-900 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 font-semibold mb-1">Add to your MCP client:</p>
              <code className="text-xs text-blue-700">Authorization: Bearer {newToken}</code>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  // Add the new token to the list before closing
                  if (newTokenInfo) {
                    onTokenCreated(newTokenInfo);
                  }
                  onClose();
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}