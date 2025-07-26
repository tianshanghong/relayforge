interface MCPServer {
  name: string
  url: string
  websocket_url: string
}

interface ServerCardProps {
  server: MCPServer
}

export function ServerCard({ server }: ServerCardProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const serverUrl = `https://api.relayforge.xyz${server.url}`
  const wsUrl = `wss://api.relayforge.xyz${server.websocket_url}`

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900 capitalize">
          {server.name.replace(/-/g, ' ')}
        </h3>
        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">
          Active
        </span>
      </div>
      
      <p className="text-gray-600 mb-6">
        {getServerDescription(server.name)}
      </p>

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
          <span>Status: Healthy</span>
          <span>Latency: ~50ms</span>
        </div>
      </div>
    </div>
  )
}

function getServerDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'hello-world': 'A simple demo server that responds with greetings. Perfect for testing your MCP client setup.',
    'google-calendar': 'Access and manage your Google Calendar events, create meetings, and check availability.',
    'slack': 'Send messages, read channels, and interact with your Slack workspace.',
    'github': 'Browse repositories, create issues, and manage GitHub resources.',
  }
  
  return descriptions[name] || 'A powerful MCP server for enhanced AI agent capabilities.'
}