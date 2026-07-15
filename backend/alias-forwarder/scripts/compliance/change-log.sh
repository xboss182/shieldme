#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/docs/evidence"
mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$OUT_DIR/change-log-$ts.md"
since="${1:-${SINCE:-90 days ago}}"
{
  echo "# Change log evidence - $ts"
  echo
  echo "Period: since $since"
  echo
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT" log --since="$since" --pretty=format:'- %h %aI %an %s'
  else
    echo "No git repository present at $ROOT. Use Multica issue history and deployment comments as the authoritative change log for this deployment snapshot."
    echo
    echo "Recent modified compliance files:"
    find "$ROOT/docs" "$ROOT/scripts/compliance" -maxdepth 3 -type f -printf '- %TY-%Tm-%Td %TH:%TM %p\n' | sort || true
  fi
} > "$out"
echo "$out"
