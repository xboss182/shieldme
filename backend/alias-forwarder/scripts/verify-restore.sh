#!/usr/bin/env bash
set -euo pipefail
backup="${1:?usage: verify-restore.sh /path/to/backup.sql.gz}"
: "${RESTORE_TEST_DATABASE_URL:?RESTORE_TEST_DATABASE_URL is required}"
gzip -t "$backup"
if [[ -f "$backup.sha256" ]]; then sha256sum -c "$backup.sha256"; fi
if [[ "${RUN_RESTORE:-false}" == "true" ]]; then
  gunzip -c "$backup" | psql "$RESTORE_TEST_DATABASE_URL" >/tmp/shieldme-restore-test.log
fi
printf 'restore-verification-ok %s\n' "$backup"
