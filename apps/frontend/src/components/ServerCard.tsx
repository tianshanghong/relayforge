import { API_BASE_URL, getWebSocketUrl } from '../config'
import { ServiceMetadata, formatPrice } from '@relayforge/shared'

interface ServerCardProps {
  server: ServiceMetadata
}

export function ServerCard({ server }: ServerCardProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // These will be replaced with actual user URLs when authenticated
  const serverUrl = `${API_BASE_URL}/mcp/u/{your-slug}`
  const wsUrl = `${getWebSocketUrl(API_BASE_URL)}/mcp/u/{your-slug}/ws`

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-2xl">{server.icon}</span>
          {server.displayName}
        </h3>
        <div className="flex items-center gap-2">
          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
            {server.category}
          </span>
          <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">
            Active
          </span>
        </div>
      </div>
      
      <p className="text-gray-600 mb-4">
        {server.description}
      </p>

      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Features:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          {server.features.slice(0, 3).map((feature, idx) => (
            <li key={idx}>• {feature}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            HTTP Endpoint
          </label>
          <div className="flex items-center space-x-2">
            <code className="flex-1 bg-gray-100 p-2 rounded text-sm text-gray-800 truncate">
              {serverUrl}
            </code>
            <button
              onClick={() => copyToClipboard(serverUrl)}
              className="p-2 text-gray-500 hover:text-gray-700"
              title="Copy to clipboard"
            >
              📋
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            WebSocket Endpoint
          </label>
          <div className="flex items-center space-x-2">
            <code className="flex-1 bg-gray-100 p-2 rounded text-sm text-gray-800 truncate">
              {wsUrl}
            </code>
            <button
              onClick={() => copyToClipboard(wsUrl)}
              className="p-2 text-gray-500 hover:text-gray-700"
              title="Copy to clipboard"
            >
              📋
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Price: {formatPrice(server.pricePerCall)}</span>
          <span>Auth: {server.authType === 'none' ? 'Not required' : server.authType.toUpperCase()}</span>
        </div>
      </div>
    </div>
  )
}