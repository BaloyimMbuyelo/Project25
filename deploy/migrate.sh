#!/usr/bin/env bash
# Applies database/migrations/*.sql that haven't been applied yet, in name
# order, and records each one in ubms_migrations so it never runs twice
# (migration 001 recreates tables, so re-running it would lose data).
# Run as root on the server: sudo bash deploy/migrate.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-ubuntu_bistro_db}"

mysql "$DB_NAME" -e "CREATE TABLE IF NOT EXISTS ubms_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"

applied=0
for file in "$APP_DIR"/database/migrations/*.sql; do
    name="$(basename "$file")"
    done_already="$(mysql -N "$DB_NAME" -e "SELECT COUNT(*) FROM ubms_migrations WHERE name = '$name'")"
    if [ "$done_already" = "0" ]; then
        echo "Applying $name"
        mysql "$DB_NAME" < "$file"
        mysql "$DB_NAME" -e "INSERT INTO ubms_migrations (name) VALUES ('$name')"
        applied=$((applied + 1))
    fi
done
echo "Migrations: $applied applied."
