#!/usr/bin/env bash
# Nightly backup of the database and uploaded menu photos (NFR backup).
# setup-server.sh schedules it at 02:30 via /etc/cron.d/ubms-backup.
# Keeps 14 days. Restore a database backup with:
#   gunzip -c /opt/ubms/backups/db-YYYY-MM-DD_HHMM.sql.gz | sudo mysql ubuntu_bistro_db
set -euo pipefail

DB_NAME="${DB_NAME:-ubuntu_bistro_db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/ubms/backups}"
UPLOAD_DIR="${UPLOAD_DIR:-/opt/ubms/uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"
stamp="$(date +%F_%H%M)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

mysqldump --single-transaction --routines "$DB_NAME" | gzip > "$BACKUP_DIR/db-$stamp.sql.gz"
if [ -d "$UPLOAD_DIR" ]; then
    tar -czf "$BACKUP_DIR/uploads-$stamp.tar.gz" -C "$UPLOAD_DIR" .
fi

find "$BACKUP_DIR" -type f -name '*.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup done: $BACKUP_DIR (*-$stamp.*)"
