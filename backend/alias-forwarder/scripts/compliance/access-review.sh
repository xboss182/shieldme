#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/docs/evidence"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/access-review-$TS.md"
mkdir -p "$OUT_DIR"
{
  echo "# Access Review Evidence - $TS"
  echo
  echo "## Application Users"
  if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -P pager=off -F $'\t' -c "select id, email, role, is_active, last_login_at, created_at, updated_at from users order by role, email;"
  else
    echo "DATABASE_URL or psql unavailable; cannot export application users on this host."
  fi
  echo
  echo "## Local Operators"
  if command -v getent >/dev/null 2>&1; then
    getent passwd | awk -F: '$3 == 0 || $3 >= 1000 {print "- "$1" uid="$3" home="$6" shell="$7}'
  else
    awk -F: '$3 == 0 || $3 >= 1000 {print "- "$1" uid="$3" home="$6" shell="$7}' /etc/passwd
  fi
  echo
  echo "## Sudoers / Admin Groups"
  getent group sudo 2>/dev/null || true
  getent group wheel 2>/dev/null || true
  echo
  echo "## Review Sign-off"
  echo "- Reviewer:"
  echo "- Findings:"
  echo "- Remediation items:"
} > "$OUT"
echo "$OUT"
