# Cloudflare Setup Guide for RelayForge

This guide walks you through setting up Cloudflare as a reverse proxy with SSL for your RelayForge deployment.

## Why Use Cloudflare?

- **Free SSL certificates** - No need to manage Let's Encrypt renewals
- **DDoS protection** - Built-in protection against attacks
- **Global CDN** - Faster loading times for users worldwide
- **Easy DNS management** - Simple interface for managing domains
- **Origin certificate** - 15-year SSL certificates for your server

## Prerequisites

- A domain name (e.g., relayforge.xyz)
- A Cloudflare account (free tier is sufficient)
- RelayForge deployed on your server

## Step 1: Add Your Domain to Cloudflare

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click "Add a Site" and enter your domain
3. Select the Free plan
4. Cloudflare will scan your existing DNS records
5. Update your domain's nameservers at your registrar to Cloudflare's nameservers

## Step 2: Configure DNS Records

Add these A records in Cloudflare DNS:

| Type | Name    | Content           | Proxy Status |
|------|---------|-------------------|--------------|
| A    | @       | YOUR_SERVER_IP    | Proxied ✓    |
| A    | www     | YOUR_SERVER_IP    | Proxied ✓    |
| A    | api     | YOUR_SERVER_IP    | Proxied ✓    |

**Important:** Make sure the proxy (orange cloud) is enabled for all records.

## Step 3: Create Origin Certificate

This creates a certificate for secure communication between Cloudflare and your server:

1. Go to **SSL/TLS → Origin Server** in Cloudflare Dashboard
2. Click **Create Certificate**
3. Configure:
   - **Private key type:** RSA (2048)
   - **Hostnames:** 
     - `*.relayforge.xyz` (wildcard for all subdomains)
     - `relayforge.xyz` (root domain)
   - **Certificate Validity:** 15 years
4. Click **Create**
5. **Save both the Origin Certificate and Private Key** - you won't be able to retrieve the private key later!

## Step 4: Install Certificate on Your Server

### Option A: Using the Setup Script (Recommended)

1. On your local machine, run:
   ```bash
   ./scripts/setup-cloudflare-ssl.sh
   ```

2. Follow the prompts to paste your certificate and key

3. Copy certificates to your server:
   ```bash
   scp nginx/ssl/* root@YOUR_SERVER_IP:/root/relayforge/nginx/ssl/
   ```

### Option B: Manual Installation

1. SSH into your server:
   ```bash
   ssh root@YOUR_SERVER_IP
   cd /root/relayforge
   ```

2. Create SSL directory:
   ```bash
   mkdir -p nginx/ssl
   ```

3. Create certificate files:
   ```bash
   # Create certificate file
   nano nginx/ssl/cloudflare-origin.pem
   # Paste the Origin Certificate and save

   # Create private key file
   nano nginx/ssl/cloudflare-origin-key.pem
   # Paste the Private Key and save
   ```

4. Set proper permissions:
   ```bash
   chmod 644 nginx/ssl/cloudflare-origin.pem
   chmod 600 nginx/ssl/cloudflare-origin-key.pem
   ```

## Step 5: Configure Cloudflare SSL Mode

1. In Cloudflare Dashboard, go to **SSL/TLS → Overview**
2. Set SSL mode to **Full**
   - **Full**: Encrypts traffic between Cloudflare and your server using the Origin Certificate
   - **Full (strict)**: Same as Full but validates the certificate (use only with valid CA certificates)
   - **Flexible**: Not recommended - only encrypts browser to Cloudflare, not Cloudflare to server

3. Go to **SSL/TLS → Edge Certificates**
4. Enable **Always Use HTTPS** - this redirects all HTTP traffic to HTTPS

## Step 6: Deploy with SSL

On your server, restart nginx with the SSL configuration:

```bash
cd /root/relayforge
docker-compose -f docker-compose.prod.yml down nginx
docker-compose -f docker-compose.prod.yml up -d nginx
```

## Step 7: Verify Setup

1. Visit https://relayforge.xyz - should load without certificate warnings
2. Check SSL status at https://www.ssllabs.com/ssltest/
3. Verify API endpoints work:
   - https://api.relayforge.xyz/health
   - https://api.relayforge.xyz/health/oauth
   - https://api.relayforge.xyz/health/gateway

## Troubleshooting

### Error 521 (Web Server Is Down)
- Your server is not responding on port 443
- Check if nginx is running: `docker ps | grep nginx`
- Check nginx logs: `docker logs relayforge-nginx-1`

### Error 525 (SSL Handshake Failed)
- SSL configuration mismatch
- Verify SSL mode is set to "Full" not "Full (strict)"
- Check certificate files exist and have correct permissions

### Error 526 (Invalid SSL Certificate)
- Certificate files are corrupt or mismatched
- Regenerate Origin Certificate in Cloudflare
- Ensure you're using the correct certificate and key pair

### Mixed Content Warnings
- Your application is loading HTTP resources
- Enable "Always Use HTTPS" in Cloudflare
- Update your application to use HTTPS URLs

## Security Best Practices

1. **Use Full SSL Mode** - Always encrypt traffic between Cloudflare and your server
2. **Enable HSTS** - In Cloudflare: SSL/TLS → Edge Certificates → HTTP Strict Transport Security
3. **Set Minimum TLS Version** - SSL/TLS → Edge Certificates → Minimum TLS Version → TLS 1.2
4. **Enable Authenticated Origin Pulls** - Verify requests are coming from Cloudflare
5. **Configure Firewall Rules** - Only allow traffic from Cloudflare IPs on ports 80/443

## Cloudflare IP Ranges

If you want to restrict access to only Cloudflare (recommended), allow these IP ranges in your firewall:

```bash
# IPv4
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/12
172.64.0.0/13
131.0.72.0/22

# IPv6 (if using IPv6)
2400:cb00::/32
2606:4700::/32
2803:f800::/32
2405:b500::/32
2405:8100::/32
2a06:98c0::/29
2c0f:f248::/32
```

## Maintenance

- **Origin Certificates don't need renewal** - They're valid for 15 years
- **Monitor SSL status** - Cloudflare will email you about any SSL issues
- **Keep nginx updated** - Regularly update your Docker images for security patches

## Additional Features

Once SSL is working, consider enabling:

- **Auto Minify** - Reduce file sizes (Speed → Optimization)
- **Brotli Compression** - Better compression than gzip
- **Cache Rules** - Cache static assets at edge
- **Page Rules** - Custom behavior for specific URLs
- **Rate Limiting** - Protect against abuse

## Support

- [Cloudflare SSL Documentation](https://developers.cloudflare.com/ssl/)
- [RelayForge Issues](https://github.com/tianshanghong/relayforge/issues)
- Check nginx logs: `docker logs relayforge-nginx-1`