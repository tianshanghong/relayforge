#!/bin/bash

# Setup script for Cloudflare Origin SSL Certificate

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${GREEN}=== Cloudflare Origin SSL Setup ===${NC}"
echo ""
echo "This script will help you set up SSL for Full mode with Cloudflare."
echo ""
echo -e "${YELLOW}Prerequisites:${NC}"
echo "1. Domain added to Cloudflare with DNS records configured"
echo "2. Access to Cloudflare Dashboard"
echo ""
echo -e "${YELLOW}Steps to get your Origin Certificate:${NC}"
echo "1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
echo "2. Click 'Create Certificate'"
echo "3. Configure:"
echo "   - Private key type: RSA (2048)"
echo "   - Hostnames: *.relayforge.xyz, relayforge.xyz"
echo "   - Certificate Validity: 15 years"
echo "4. Click 'Create' and keep the window open"
echo ""
echo -e "${GREEN}Ready to paste your certificates?${NC}"
echo "Press Enter to continue or Ctrl+C to cancel..."
read

# Create SSL directory if it doesn't exist
mkdir -p nginx/ssl

echo ""
echo -e "${YELLOW}Step 1: Origin Certificate${NC}"
echo "Paste the Origin Certificate (PEM format) below and press Ctrl+D when done:"
echo ""
cat > nginx/ssl/cloudflare-origin.pem

echo ""
echo -e "${YELLOW}Step 2: Private Key${NC}"
echo "Paste the Private Key below and press Ctrl+D when done:"
echo -e "${RED}WARNING: Keep this key secure! Never commit it to git.${NC}"
echo ""
cat > nginx/ssl/cloudflare-origin-key.pem

# Set proper permissions
chmod 600 nginx/ssl/cloudflare-origin-key.pem
chmod 644 nginx/ssl/cloudflare-origin.pem

echo ""
echo -e "${GREEN}✅ SSL certificates saved successfully!${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Copy certificates to your server:"
echo -e "   ${GREEN}scp nginx/ssl/* root@YOUR_SERVER:/root/relayforge/nginx/ssl/${NC}"
echo ""
echo "2. On your server, restart nginx:"
echo -e "   ${GREEN}cd /root/relayforge${NC}"
echo -e "   ${GREEN}docker-compose -f docker-compose.prod.yml restart nginx${NC}"
echo ""
echo "3. In Cloudflare Dashboard → SSL/TLS:"
echo "   - Set SSL mode to 'Full'"
echo "   - Enable 'Always Use HTTPS' in Edge Certificates"
echo ""
echo -e "${GREEN}🎉 Your site will now have end-to-end encryption!${NC}"
echo ""
echo "For detailed instructions, see: docs/CLOUDFLARE_SETUP.md"