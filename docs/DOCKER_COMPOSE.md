# Docker Compose Structure

## Overview

RelayForge uses Docker Compose's override pattern for clean environment separation:

```
docker-compose.yml              # Base configuration (shared)
docker-compose.override.yml     # Development overrides (auto-loaded)
docker-compose.prod.yml         # Production/Staging overrides (explicit)
```

## Usage

### Development
```bash
# Automatically uses docker-compose.override.yml
docker-compose up

# Access services directly:
# - Frontend: http://localhost:5173
# - OAuth Service: http://localhost:3002
# - MCP Gateway: http://localhost:3001
# - PostgreSQL: localhost:5432
# - Nginx: http://localhost:8080
```

### Staging
```bash
# Build from source and deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Uses same config as production but builds images locally
```

### Production
```bash
# Pull pre-built images and deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Only nginx ports 80/443 exposed
# All traffic routed through nginx
```

## File Structure

### docker-compose.yml (Base)
- Core service definitions
- Shared environment variables
- Health checks
- Dependencies
- Networks and volumes

### docker-compose.override.yml (Development)
- Port exposures for debugging
- Build contexts
- Volume mounts for hot reload
- Development environment variables

### docker-compose.prod.yml (Production/Staging)
- Pre-built image references from GitHub Container Registry (production)
- Can build from source with --build flag (staging)
- Nginx with SSL configuration (ports 80/443)
- Minimal overrides only (environment variables come from .env)

## Benefits

1. **DRY Principle**: No duplicate configuration
2. **Clear Separation**: Environment-specific settings isolated
3. **Easy Development**: Just run `docker-compose up`
4. **Secure Production**: Minimal exposed surface
5. **Standard Practice**: Follows Docker Compose conventions