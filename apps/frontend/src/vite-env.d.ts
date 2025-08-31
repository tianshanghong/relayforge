/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_OAUTH_SERVICE_URL: string
  readonly VITE_MCP_GATEWAY_URL: string
  readonly MODE: 'development' | 'production' | 'staging'
  readonly PROD: boolean
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}