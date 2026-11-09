# Serve the already built release assets with the exact production Nginx configuration.
FROM nginxinc/nginx-unprivileged:alpine
COPY --chown=101:101 packages/web/dist /usr/share/nginx/html
COPY --chown=101:101 packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 packages/web/security-headers.conf /etc/nginx/security-headers.conf
