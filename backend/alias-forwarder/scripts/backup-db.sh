#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/var/backups/shieldme-postgres}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
: "${DATABASE_URL:?DATABASE_URL is required}"
ts=$(date -u +%Y%m%dT%H%M%SZ)
out="$BACKUP_DIR/alias-forwarder-$ts.sql.gz"
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -9 > "$out"
gzip -t "$out"
sha256sum "$out" > "$out.sha256"
find "$BACKUP_DIR" -name 'alias-forwarder-*.sql.gz' -mtime +30 -delete
printf '%s\n' "$out"
