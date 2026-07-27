#!/usr/bin/env bash
#
# Builds EVChargePlanner and installs it on a Debian/Ubuntu/CentOS host behind nginx.
# Run from a checkout of the repository, as a user with sudo.
#
#   ENCRYPTION_KEY=$(openssl rand -hex 32) DOMAIN=evcp.example.com ./scripts/deploy-vps.sh
#
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/evchargeplanner}
WEB_ROOT=${WEB_ROOT:-/var/www/evchargeplanner}
DOMAIN=${DOMAIN:-}
SERVICE_PORT=${SERVICE_PORT:-8787}
REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  echo "ENCRYPTION_KEY is required. Generate one with: openssl rand -hex 32" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 22 or newer first:" >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs" >&2
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22 or newer is required (found $(node -v))." >&2
  exit 1
fi

echo "==> Building from $REPO_DIR"
cd "$REPO_DIR"
npm ci
npm run build:data
npm run build -w @evcp/web
npm run build -w @evcp/api

echo "==> Installing the API to $APP_DIR"
sudo mkdir -p "$APP_DIR/data"
sudo cp -r apps/api/dist "$APP_DIR/"
sudo cp scripts/ecosystem.config.cjs "$APP_DIR/"

echo "==> Publishing the web bundle to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}/"*
sudo cp -r apps/web/dist/* "$WEB_ROOT/"

# Secrets go in a root-only env file rather than the process list.
echo "==> Writing $APP_DIR/.env"
sudo tee "$APP_DIR/.env" >/dev/null <<EOF
NODE_ENV=production
PORT=$SERVICE_PORT
DATABASE_FILE=$APP_DIR/data/evcp.sqlite
ENCRYPTION_KEY=$ENCRYPTION_KEY
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-*}
EOF
sudo chmod 600 "$APP_DIR/.env"

if command -v pm2 >/dev/null 2>&1; then
  echo "==> Restarting under PM2"
  (cd "$APP_DIR" && sudo pm2 startOrReload ecosystem.config.cjs --update-env)
  sudo pm2 save
else
  echo "PM2 is not installed. Install it with: sudo npm install -g pm2" >&2
  echo "Then run: cd $APP_DIR && pm2 start ecosystem.config.cjs" >&2
fi

if [ -n "$DOMAIN" ] && [ -d /etc/nginx ]; then
  echo "==> Writing the nginx site for $DOMAIN"
  sudo sed -e "s|{{DOMAIN}}|$DOMAIN|g" \
           -e "s|{{WEB_ROOT}}|$WEB_ROOT|g" \
           -e "s|{{API_PORT}}|$SERVICE_PORT|g" \
           "$REPO_DIR/scripts/nginx-site.conf" \
    | sudo tee /etc/nginx/conf.d/evchargeplanner.conf >/dev/null
  sudo nginx -t && sudo systemctl reload nginx
  echo
  echo "Enable HTTPS with:  sudo certbot --nginx -d $DOMAIN"
fi

echo
echo "Done. API health check:  curl http://127.0.0.1:$SERVICE_PORT/api/health"
