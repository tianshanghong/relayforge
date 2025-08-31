import { useEffect, useState } from 'react'

export type Environment = 'production' | 'staging' | 'development'

/**
 * Detects the current environment based on domain and build mode
 * Production: relayforge.xyz
 * Staging: relayforge.dev or any production build not on official domain
 * Development: localhost or development mode
 */
export function detectEnvironment(): Environment {
  const hostname = window.location.hostname
  const isDevelopmentMode = import.meta.env.MODE === 'development'
  
  // Production: Official domain only
  if (hostname === 'relayforge.xyz' || hostname === 'www.relayforge.xyz') {
    return 'production'
  }
  
  // Development: localhost or dev mode
  if (isDevelopmentMode || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'development'
  }
  
  // Staging: Everything else (relayforge.dev, IP addresses, custom domains)
  return 'staging'
}

export function EnvironmentBanner() {
  const [environment, setEnvironment] = useState<Environment | null>(null)
  
  useEffect(() => {
    setEnvironment(detectEnvironment())
  }, [])

  // Don't show banner in production
  if (environment === 'production' || environment === null) {
    return null
  }

  const bannerConfig = {
    development: {
      bgClass: 'bg-gradient-to-r from-purple-500 to-pink-500',
      title: 'Development Environment',
      icon: '🚧'
    },
    staging: {
      bgClass: 'bg-gradient-to-r from-yellow-400 to-orange-500',
      title: 'Staging Environment',
      icon: '⚠️'
    }
  }

  const config = bannerConfig[environment]
  
  return (
    <div 
      className={`fixed top-0 left-0 right-0 z-50 ${config.bgClass} text-white shadow-lg`}
      role="banner"
      aria-label={`${config.title} warning`}
    >
      <div className="container mx-auto px-4 py-2 sm:py-3">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs sm:text-sm">
          {/* Environment indicator */}
          <div className="flex items-center space-x-2">
            <span className="text-base sm:text-lg" aria-hidden="true">{config.icon}</span>
            <span className="font-bold uppercase tracking-wider">{config.title}</span>
          </div>
          
          {/* Warning messages - responsive layout */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 text-white/90">
            <span className="hidden sm:inline" aria-hidden="true">•</span>
            <span>NOT production</span>
            <span aria-hidden="true">•</span>
            <span>Credits are <strong>test only</strong></span>
            <span className="hidden sm:inline" aria-hidden="true">•</span>
            <span className="hidden sm:inline">Data may be <strong>cleared</strong></span>
          </div>
          
          {/* Production link */}
          <div className="bg-black/20 px-2 sm:px-3 py-1 rounded text-xs">
            <span className="hidden sm:inline">Production: </span>
            <a 
              href="https://relayforge.xyz" 
              className="underline hover:text-yellow-200 transition-colors font-medium"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Go to production site at relayforge.xyz"
            >
              relayforge.xyz →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}