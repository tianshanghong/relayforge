import { useState, useEffect } from 'react'
import { ServerCard } from './components/ServerCard'
import { Hero } from './components/Hero'
import { AuthSection } from './components/AuthSection'
import { EnvironmentBanner, detectEnvironment } from './components/EnvironmentBanner'
import { getActiveServices, ServiceMetadata } from '@relayforge/shared'

function App() {
  const [servers, setServers] = useState<ServiceMetadata[]>([])
  const [loading] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Use shared metadata to display available services
    const activeServices = getActiveServices()
    setServers(activeServices)
    
    // Check if we need to show environment banner
    const environment = detectEnvironment()
    setShowBanner(environment !== 'production')
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <EnvironmentBanner />
      <div className={`container mx-auto px-4 py-8 ${showBanner ? 'pt-20' : ''}`}>
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
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-16 bg-white rounded-lg shadow-lg p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Quick Start</h3>
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">For Claude Code:</h4>
              <p className="text-sm text-gray-600 mb-3">
                After logging in and getting your MCP URL and token, add your RelayForge server:
              </p>
              <pre className="bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto">
                <code>{`claude mcp add relayforge \\
    https://api.relayforge.dev/mcp/u/your-slug \\
    --transport http \\
    --header "Authorization: Bearer mcp_live_xxxxxxxxxxxxx"`}</code>
              </pre>
              <p className="text-xs text-gray-500 mt-2">
                Replace 'your-slug' and token with your actual values from the account section above.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">For API Key Services (like Coinbase):</h4>
              <p className="text-sm text-gray-600 mb-3">
                Add your API keys as additional headers:
              </p>
              <pre className="bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto">
                <code>{`claude mcp add relayforge \\
    https://api.relayforge.dev/mcp/u/your-slug \\
    --transport http \\
    --header "Authorization: Bearer mcp_live_xxxxxxxxxxxxx" \\
    --header "X-Env-Coinbase-API-Key-Name: your-api-key-name" \\
    --header "X-Env-Coinbase-API-Private-Key: -----BEGIN EC PRIVATE KEY-----\\n...\\n-----END EC PRIVATE KEY-----"`}</code>
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App