/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OAUTH_SERVICE_URL: string
  readonly VITE_MCP_GATEWAY_URL: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}