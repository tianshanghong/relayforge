#!/bin/sh

# Replace environment variables in the built files
# This allows runtime configuration of the frontend

# Default values
VITE_OAUTH_SERVICE_URL=${VITE_OAUTH_SERVICE_URL:-"https://api.relayforge.xyz"}

# Replace placeholders in all JS files
find /usr/share/nginx/html -name '*.js' -exec sed -i "s|VITE_OAUTH_SERVICE_URL_PLACEHOLDER|${VITE_OAUTH_SERVICE_URL}|g" {} \;

# Start nginx
nginx -g "daemon off;"