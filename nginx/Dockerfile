FROM nginx:alpine

# Install envsubst (it's in gettext package)
RUN apk add --no-cache gettext

# Copy the template and entrypoint script
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /docker-entrypoint.sh

# Create directories for Let's Encrypt
RUN mkdir -p /var/www/certbot

EXPOSE 80 443

# Use our custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]