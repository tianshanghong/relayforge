# Port Configuration

## Standard Ports

| Service | Internal Port | Dev External | Production External |
|---------|--------------|--------------|-------------------|
| PostgreSQL | 5432 | 5432 | Not exposed |
| OAuth Service | 3002 | 3002 | Not exposed |
| MCP Gateway | 3001 | 3001 | Not exposed |
| Frontend | 80 | 5173 | Not exposed |
| Nginx | 80/443 | 8080 | 80/443 |

## Key Concepts

### Development
- **Direct access** to each service for debugging
- Services available at `localhost:PORT`
- Nginx available for production-like testing at `localhost:8080`

### Production
- **Only nginx exposed** to internet (ports 80/443)
- All traffic routed through nginx
- Internal services communicate via Docker network

### Internal Communication
Services always use Docker service names:
```
postgres:5432
oauth-service:3002
mcp-gateway:3001
frontend:80
```

## Nginx Routing

```
Internet → nginx:80/443
           ├── /oauth/* → oauth-service:3002
           ├── /api/* → oauth-service:3002
           ├── /mcp/* → mcp-gateway:3001
           └── /* → frontend:80
```

## Environment Variables

```bash
# Internal service-to-service
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/relayforge
OAUTH_SERVICE_URL=http://oauth-service:3002

# External URLs (for redirects/client config)
FRONTEND_URL=http://localhost:5173        # Dev
MCP_BASE_URL=http://localhost:3001        # Dev
# Production: https://relayforge.xyz, https://api.relayforge.xyz
```

## Security Notes

1. **Production VPS**: Only expose ports 80/443 via firewall
2. **Internal ports**: Never exposed to internet in production
3. **Health checks**: Use localhost URLs inside containers
4. **CORS**: Configure ALLOWED_ORIGINS for all client URLs