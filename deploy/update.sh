#!/usr/bin/env bash
# Deploys the latest main: backup, pull, packages, new migrations, frontend
# build, API restart.   sudo bash /opt/ubms/app/deploy/update.sh
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "Run with sudo."; exit 1; }
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
as_app() { sudo -u ubms -H "$@"; }
SITE_URL="$(grep '^CLIENT_ORIGIN=' "$APP_DIR/backend/.env" | cut -d= -f2-)"

echo "==> Backup first"
bash "$APP_DIR/deploy/backup.sh"

echo "==> Pulling main"
as_app git -C "$APP_DIR" pull --ff-only

echo "==> Backend packages and migrations"
(cd "$APP_DIR/backend" && as_app npm ci --omit=dev --no-audit --no-fund)
bash "$APP_DIR/deploy/migrate.sh"

echo "==> Frontend build for $SITE_URL"
(cd "$APP_DIR/frontend" && as_app npm ci --no-audit --no-fund && as_app env VITE_API_URL="$SITE_URL" npm run build)

echo "==> Restarting API"
(cd "$APP_DIR" && as_app pm2 reload ubms-api --update-env)
nginx -t && systemctl reload nginx
echo "Updated: $SITE_URL"
