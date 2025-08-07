#!/bin/sh
set -e

# Default domain if not provided
DOMAIN=${DOMAIN:-relayforge.xyz}

echo "Configuring nginx for domain: $DOMAIN"

# Replace environment variables in nginx config template
envsubst '${DOMAIN}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Nginx configuration generated successfully"

# Start nginx
exec nginx -g "daemon off;"