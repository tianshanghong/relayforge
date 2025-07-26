export function Hero() {
  return (
    <div className="text-center">
      <h1 className="text-5xl font-bold text-gray-900 mb-6">
        RelayForge
      </h1>
      <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
        One-stop shop for hosted remote MCP services. Connect your AI agents to powerful tools without the setup hassle.
      </p>
      <div className="flex justify-center space-x-4">
        <a
          href="#services"
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
        >
          Browse Services
        </a>
        <a
          href="https://github.com/wwang/relayforge"
          className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
      </div>
    </div>
  )
}