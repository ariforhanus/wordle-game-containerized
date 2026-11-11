# ── Stage 1: Build ──
FROM node:22-alpine AS build

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/api/package.json packages/api/
COPY packages/i18n/package.json packages/i18n/
COPY packages/web/package.json packages/web/

# Install dependencies
RUN npm ci

# Copy all source
COPY tsconfig.base.json ./
COPY packages/ packages/

# Build the web app
RUN npm run build -w @wordle/web

# ── Stage 2: Serve ──
FROM nginxinc/nginx-unprivileged:alpine

# Copy built assets
COPY --from=build --chown=101:101 /app/packages/web/dist /usr/share/nginx/html

# Copy nginx config
COPY --chown=101:101 packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 packages/web/security-headers.conf /etc/nginx/security-headers.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
