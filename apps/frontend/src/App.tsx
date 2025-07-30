import { useState, useEffect } from 'react'
import { ServerCard } from './components/ServerCard'
import { Hero } from './components/Hero'
import { AuthSection } from './components/AuthSection'

interface MCPServer {
  name: string
  url: string
  websocket_url: string
}

function App() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/mcp/servers')
      .then(res => res.json())
      .then(data => {
        setServers(data.servers || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch servers:', err)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <Hero />
        
        <section className="mt-16 max-w-2xl mx-auto">
          <AuthSection />
        </section>
        
        <section className="mt-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Available MCP Services
          </h2>
          
          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {servers.map((server) => (
                <ServerCard key={server.name} server={server} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-16 bg-white rounded-lg shadow-lg p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Quick Start</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-800">For Claude Code:</h4>
              <pre className="bg-gray-100 p-3 rounded text-sm mt-2 overflow-x-auto">
                <code>{`# Add to your MCP config
{
  "mcpServers": {
    "hello-world": {
      "command": "curl",
      "args": ["-X", "POST", "https://api.relayforge.xyz/mcp/hello-world"]
    }
  }
}`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800">For Cursor:</h4>
              <pre className="bg-gray-100 p-3 rounded text-sm mt-2 overflow-x-auto">
                <code>https://api.relayforge.xyz/mcp/hello-world</code>
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App