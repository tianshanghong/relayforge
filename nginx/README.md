# Nginx Configuration

This directory contains nginx configuration for RelayForge.

## Files

- `nginx.conf` - Main nginx configuration with Cloudflare SSL support

## SSL Setup

For SSL setup with Cloudflare:

1. Run the setup script:
   ```bash
   ./scripts/setup-cloudflare-ssl.sh
   ```

2. Follow the instructions in [Cloudflare Setup Guide](../docs/CLOUDFLARE_SETUP.md)

## Important Security Notes

- **Never commit SSL certificates or private keys to git**
- The `ssl/` directory is gitignored for security
- Keep your private keys secure and backed up separately

## Configuration Details

The nginx configuration includes:
- SSL support with Cloudflare Origin Certificates
- HTTP to HTTPS redirect
- Proper headers for Cloudflare proxy
- WebSocket support for MCP connections
- Subdomain routing:
  - `relayforge.xyz` → Frontend
  - `api.relayforge.xyz` → OAuth Service
  - `gateway.relayforge.xyz` → MCP Gateway