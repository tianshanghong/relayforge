#!/bin/bash

# Setup script for Cloudflare Origin SSL Certificate

echo "=== Cloudflare Origin SSL Setup ==="
echo ""
echo "This script will help you set up SSL for Full mode with Cloudflare."
echo ""
echo "Steps:"
echo "1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
echo "2. Click 'Create Certificate'"
echo "3. Choose:"
echo "   - Private key type: RSA (2048)"
echo "   - Hostnames: *.relayforge.xyz, relayforge.xyz"
echo "   - Certificate Validity: 15 years"
echo "4. Copy the Origin Certificate and Private Key"
echo ""
echo "Press Enter when ready..."
read

# Create SSL directory if it doesn't exist
mkdir -p nginx/ssl

echo "Paste the Origin Certificate (PEM format) and press Ctrl+D when done:"
cat > nginx/ssl/cloudflare-origin.pem

echo ""
echo "Paste the Private Key and press Ctrl+D when done:"
cat > nginx/ssl/cloudflare-origin-key.pem

# Set proper permissions
chmod 600 nginx/ssl/cloudflare-origin-key.pem
chmod 644 nginx/ssl/cloudflare-origin.pem

echo ""
echo "✅ SSL certificates saved!"
echo ""
echo "To deploy to server:"
echo "1. Copy certificates to server:"
echo "   scp nginx/ssl/* root@YOUR_SERVER:/root/relayforge/nginx/ssl/"
echo ""
echo "2. Deploy to server:"
echo "   docker-compose -f docker-compose.prod.yml up -d nginx"
echo ""
echo "3. In Cloudflare Dashboard → SSL/TLS:"
echo "   - Set mode to 'Full' (or 'Full (strict)' if using valid CA certificate)"
echo "   - Enable 'Always Use HTTPS'"
echo ""
echo "Your site will now have end-to-end encryption!"