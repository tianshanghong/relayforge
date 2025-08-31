# SSL/TLS Setup for Production

## Overview

RelayForge requires SSL/TLS certificates for secure production deployment. This guide covers different approaches for obtaining and configuring SSL certificates.

## Option 1: Let's Encrypt with Certbot (Recommended)

### Prerequisites
- Domain name pointing to your server
- Port 80 accessible for domain validation

### Setup Steps

1. **Install Certbot on your server**:
```bash
sudo apt update
sudo apt install certbot
```

2. **Generate certificates**:
```bash
# Stop nginx if running to free port 80
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# Generate certificates
sudo certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Certificates will be in /etc/letsencrypt/live/yourdomain.com/
```

3. **Copy certificates to nginx directory**:
```bash
mkdir -p ./nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./nginx/ssl/
sudo chown $(whoami):$(whoami) ./nginx/ssl/*
```

4. **Update nginx configuration** (`nginx/nginx.conf.template`):
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com api.yourdomain.com;
    
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # ... rest of configuration
}
```

5. **Set up auto-renewal**:
```bash
# Add to crontab
sudo crontab -e
# Add this line:
0 0 1 * * certbot renew --post-hook "docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx"
```

## Option 2: Cloudflare Origin Certificates

If using Cloudflare as CDN/proxy:

1. **Generate Origin Certificate in Cloudflare Dashboard**:
   - Go to SSL/TLS → Origin Server
   - Create Certificate
   - Save both certificate and private key

2. **Save certificates**:
```bash
mkdir -p ./nginx/ssl
echo "PASTE_CERTIFICATE_HERE" > ./nginx/ssl/cloudflare-origin.pem
echo "PASTE_PRIVATE_KEY_HERE" > ./nginx/ssl/cloudflare-origin-key.pem
chmod 600 ./nginx/ssl/*
```

3. **Configure Cloudflare**:
   - Set SSL/TLS encryption mode to "Full" or "Full (strict)"
   - Enable "Always Use HTTPS"

## Option 3: Self-Signed Certificates (Development Only)

For testing SSL in development:

```bash
mkdir -p ./nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ./nginx/ssl/selfsigned.key \
  -out ./nginx/ssl/selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

## Security Best Practices

1. **Strong SSL Configuration**:
```nginx
# Add to nginx.conf
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

2. **Redirect HTTP to HTTPS**:
```nginx
server {
    listen 80;
    server_name yourdomain.com api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

3. **File Permissions**:
```bash
# Ensure proper permissions
chmod 644 ./nginx/ssl/*.pem
chmod 644 ./nginx/ssl/*.crt
chmod 600 ./nginx/ssl/*.key
```

## Deployment

After setting up SSL certificates:

```bash
# Start services with SSL
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verify SSL is working
curl -I https://yourdomain.com
```

## Troubleshooting

### Certificate Not Loading
- Check file paths in nginx.conf match actual certificate locations
- Verify certificate files are readable by nginx container
- Check nginx logs: `docker-compose logs nginx`

### SSL Handshake Failures
- Ensure certificate matches domain name
- Verify certificate chain is complete (fullchain.pem includes intermediate certificates)
- Check certificate expiration: `openssl x509 -in ./nginx/ssl/fullchain.pem -noout -dates`

### Mixed Content Warnings
- Update all internal URLs to use HTTPS
- Set proper environment variables:
  ```bash
  FRONTEND_URL=https://yourdomain.com
  MCP_BASE_URL=https://api.yourdomain.com
  ```

## Monitoring

Set up monitoring for certificate expiration:

```bash
# Check certificate expiration
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

Consider using monitoring services like:
- UptimeRobot for SSL expiration alerts
- Prometheus with ssl_exporter for metrics
- Datadog or New Relic for comprehensive monitoring