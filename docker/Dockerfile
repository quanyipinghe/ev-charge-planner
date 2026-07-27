# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage — compiles the web bundle and the API into plain JavaScript.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /repo

# Manifests first so `npm ci` is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY packages/models/package.json packages/models/
COPY packages/calculator/package.json packages/calculator/
COPY packages/notification/package.json packages/notification/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci

COPY . .

# The vehicle and tariff bundles are generated, and both the web app and the API
# import them, so this has to run before either build.
RUN npm run build:data \
  && npm run build -w @evcp/web \
  && npm run build -w @evcp/api

# ---------------------------------------------------------------------------
# Runtime stage — nginx serves the static app, node runs the API.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache nginx tini \
  && addgroup -S evcp && adduser -S evcp -G evcp

COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY --from=build /repo/apps/api/dist /app/dist
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /app/entrypoint.sh

# node:sqlite is built into Node, so there are no native modules to install here.
RUN mkdir -p /app/data /var/lib/nginx/logs /var/lib/nginx/tmp \
  && chown -R evcp:evcp /app /var/lib/nginx /usr/share/nginx/html \
  && chmod +x /app/entrypoint.sh

ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_FILE=/app/data/evcp.sqlite

# Runs unprivileged, so nginx listens above 1024 and the host maps a real port to it.
USER evcp
EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
