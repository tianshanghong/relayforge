# Docker Compose Structure

## Overview

RelayForge uses Docker Compose's override pattern for clean environment separation:

```
docker-compose.yml              # Base configuration (shared)
docker-compose.override.yml     # Development overrides (auto-loaded)
docker-compose.prod.yml         # Production overrides (explicit)
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

### Production
```bash
# Explicitly specify production overrides
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

### docker-compose.prod.yml (Production)
- Production image references
- Production environment overrides
- Nginx with SSL configuration
- No direct port exposures (except nginx)

## Benefits

1. **DRY Principle**: No duplicate configuration
2. **Clear Separation**: Environment-specific settings isolated
3. **Easy Development**: Just run `docker-compose up`
4. **Secure Production**: Minimal exposed surface
5. **Standard Practice**: Follows Docker Compose conventions