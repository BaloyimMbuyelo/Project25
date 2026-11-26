#!/usr/bin/env bash
# One-time setup of UBMS on a fresh Ubuntu 24.04 server (System Design 4.3.3):
# Nginx + HTTPS (Let's Encrypt), Node.js 22 + PM2, MySQL 8 with a
# least-privilege app account, firewall and nightly backups.
#
#   sudo git clone https://github.com/BaloyimMbuyelo/Project25.git /opt/ubms/app
#   sudo bash /opt/ubms/app/deploy/setup-server.sh [domain]
#
# With no domain it uses <server-ip>.sslip.io, a free name that points at the
# server's IP. Optional settings (environment variables):
#   LE_EMAIL=you@example.com   email for certificate expiry notices
#   SEED_DEMO=0                don't create the demo accounts
# Safe to run again: existing data, .env and passwords are kept.
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "Run with sudo."; exit 1; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR=/opt/ubms
UPLOAD_DIR="$BASE_DIR/uploads"
ENV_FILE="$APP_DIR/backend/.env"
DB_NAME=ubuntu_bistro_db
DB_USER=ubms_app
SEED_DEMO="${SEED_DEMO:-1}"

step() { echo; echo "==> $*"; }
as_app() { sudo -u ubms -H "$@"; }
set_env() { # set_env KEY VALUE (replace or append in backend/.env)
    if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}

PUBLIC_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMAIN="${1:-${PUBLIC_IP//./-}.sslip.io}"
echo "Setting up UBMS for $DOMAIN (server IP $PUBLIC_IP), code in $APP_DIR"

step "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx mysql-server git curl ufw openssl certbot python3-certbot-nginx ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -q nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2@6 --silent
echo "Node $(node -v), PM2 $(pm2 -v)"

# Small VPSs (1 GB) can run out of memory building the frontend
if [ "$(free -m | awk '/^Mem:/ {print $2}')" -lt 1500 ] && ! swapon --show | grep -q .; then
    step "Adding 1 GB swap"
    fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Creating the ubms user and folders"
id ubms >/dev/null 2>&1 || useradd --system --home-dir "$BASE_DIR" --shell /usr/sbin/nologin ubms
install -d -o ubms -g ubms -m 755 "$BASE_DIR" "$UPLOAD_DIR"
chown -R ubms:ubms "$APP_DIR"
chmod 755 "$APP_DIR"

step "Firewall: SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null
# Also allow SSH if it listens on a non-standard port, so we don't lock ourselves out
for port in $(ss -tlnpH 2>/dev/null | awk '/"sshd"/ {sub(/.*:/, "", $4); print $4}' | sort -u); do
    ufw allow "$port/tcp" >/dev/null
done
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'

step "Database"
systemctl enable --now mysql
if [ -z "$(mysql -N -e "SHOW DATABASES LIKE '$DB_NAME'")" ]; then
    echo "New database: loading schema"
    mysql < "$APP_DIR/database/ubuntu_bistro_database.sql"
    mysql "$DB_NAME" < "$APP_DIR/database/ubms_database_extension.sql"
fi
DB_NAME="$DB_NAME" bash "$APP_DIR/deploy/migrate.sh"

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating app database account and backend/.env"
    DB_PASS="$(openssl rand -hex 24)"
    for host in localhost 127.0.0.1; do
        mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'$host' IDENTIFIED BY '$DB_PASS';
                  ALTER USER '$DB_USER'@'$host' IDENTIFIED BY '$DB_PASS';
                  GRANT SELECT, INSERT, UPDATE, DELETE ON \`$DB_NAME\`.* TO '$DB_USER'@'$host';"
    done
    install -o ubms -g ubms -m 600 /dev/null "$ENV_FILE"
    cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
DB_NAME=$DB_NAME
JWT_SECRET=$(openssl rand -hex 64)
UPLOAD_DIR=$UPLOAD_DIR
EOF
fi

step "Nginx site"
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__UPLOAD_DIR__|$UPLOAD_DIR|g" \
    "$APP_DIR/deploy/nginx-ubms.conf" > /etc/nginx/sites-available/ubms
ln -sf /etc/nginx/sites-available/ubms /etc/nginx/sites-enabled/ubms
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

step "HTTPS certificate (Let's Encrypt)"
EMAIL_ARGS=(--register-unsafely-without-email)
[ -n "${LE_EMAIL:-}" ] && EMAIL_ARGS=(-m "$LE_EMAIL")
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${EMAIL_ARGS[@]}" --redirect --hsts; then
    SCHEME=https
else
    SCHEME=http
    echo "!! Certificate failed. The site will run on plain HTTP for now."
    echo "!! If $DOMAIN hit Let's Encrypt's limits, get a free name at duckdns.org pointing"
    echo "!! to $PUBLIC_IP and run: sudo bash $APP_DIR/deploy/setup-server.sh yourname.duckdns.org"
fi
SITE_URL="$SCHEME://$DOMAIN"

# Anyone who types the bare IP (or any other name) is sent to $SITE_URL.
# Otherwise the browser warns about the certificate and the API rejects the
# page's requests, because it only accepts calls from $SITE_URL.
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
{
    echo "server {"
    echo "    listen 80 default_server;"
    echo "    listen [::]:80 default_server;"
    if [ "$SCHEME" = https ]; then
        echo "    listen 443 ssl default_server;"
        echo "    listen [::]:443 ssl default_server;"
        echo "    ssl_certificate $CERT_DIR/fullchain.pem;"
        echo "    ssl_certificate_key $CERT_DIR/privkey.pem;"
    fi
    echo "    server_name _;"
    echo "    location /.well-known/acme-challenge/ { root /var/www/html; }"
    echo "    location / { return 301 $SITE_URL\$request_uri; }"
    echo "}"
} > /etc/nginx/sites-available/ubms-redirect
ln -sf /etc/nginx/sites-available/ubms-redirect /etc/nginx/sites-enabled/ubms-redirect
nginx -t && systemctl reload nginx

set_env CLIENT_ORIGIN "$SITE_URL"
set_env COOKIE_SECURE "$([ "$SCHEME" = https ] && echo true || echo false)"

step "Backend packages"
(cd "$APP_DIR/backend" && as_app npm ci --omit=dev --no-audit --no-fund)

DEMO_NOTE=""
if [ "$SEED_DEMO" = "1" ] && [ "$(mysql -N "$DB_NAME" -e "SELECT COUNT(*) FROM users WHERE email = 'admin@ubms.local'")" = "0" ]; then
    step "Demo accounts"
    # Team decision: the demo accounts use the same password everywhere.
    # Override with DEMO_PASSWORD=... for a server that shouldn't.
    DEMO_PASSWORD="${DEMO_PASSWORD:-Bistro2026}"
    (cd "$APP_DIR/backend" && as_app env DEMO_PASSWORD="$DEMO_PASSWORD" node scripts/seedDemo.js)
    install -m 600 /dev/null /root/ubms-demo-password.txt
    echo "$DEMO_PASSWORD" > /root/ubms-demo-password.txt
    DEMO_NOTE="Demo accounts password: $DEMO_PASSWORD (also in /root/ubms-demo-password.txt)"
fi

step "Building the frontend for $SITE_URL"
(cd "$APP_DIR/frontend" && as_app npm ci --no-audit --no-fund && as_app env VITE_API_URL="$SITE_URL" npm run build)

step "Starting the API with PM2"
# Run PM2 from a folder the ubms user can open; otherwise Node fails to start (spawn EACCES)
# when this script is run from a home folder like /home/azureuser.
(cd "$BASE_DIR" && as_app pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.js" --update-env)
(cd "$BASE_DIR" && as_app pm2 save)
pm2 startup systemd -u ubms --hp "$BASE_DIR" >/dev/null
systemctl enable pm2-ubms >/dev/null 2>&1 || true

step "Nightly backups (02:30, kept 14 days)"
cat > /etc/cron.d/ubms-backup <<EOF
30 2 * * * root bash $APP_DIR/deploy/backup.sh >> /var/log/ubms-backup.log 2>&1
EOF

step "Checking"
for i in $(seq 1 15); do curl -fsS -o /dev/null http://127.0.0.1:5000/ && break; sleep 1; done
curl -fsS -o /dev/null "http://127.0.0.1:5000/api/v1/menu/categories" && echo "API: OK" || echo "API: NOT responding (check: sudo -u ubms -H pm2 logs ubms-api)"
curl -fsS -o /dev/null -k "$SITE_URL/" && echo "Website: OK" || echo "Website: NOT responding"

echo
echo "UBMS is live at $SITE_URL"
echo "Staff login: $SITE_URL/staff/login"
[ -n "$DEMO_NOTE" ] && echo "$DEMO_NOTE"
echo "Update later with: sudo bash $APP_DIR/deploy/update.sh"
