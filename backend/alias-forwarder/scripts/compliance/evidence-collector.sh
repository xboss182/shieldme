#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/docs/evidence"
mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$OUT_DIR/security-posture-$ts.md"
api_url="${API_URL:-https://api.shieldme.cc}"
{
  echo "# Security posture evidence - $ts"
  echo
  echo "## PM2 status"
  pm2 describe alias-forwarder --no-color | grep -E 'status|script path|exec cwd|pid' || true
  echo
  echo "## Health"
  curl -fsS "$api_url/api/health" || true
  echo
  echo "## Security headers"
  curl -fsS -D - "$api_url/api/health" -o /dev/null | grep -iE 'strict-transport-security|content-security-policy|x-frame-options|permissions-policy|referrer-policy|x-content-type-options' || true
  echo
  echo "## Production dependency audit"
  (cd "$ROOT" && npm audit --omit=dev --audit-level=high) || true
  echo
  echo "## Backup script presence"
  ls -l "$ROOT/scripts/backup-db.sh" "$ROOT/scripts/verify-restore.sh" "$ROOT/scripts/check-redis-persistence.sh" || true
  echo
  echo "## Redis persistence"
  node - <<'NODE' || true
const net=require('net');
const cmd=(...parts)=>`*${parts.length}\r\n`+parts.map(p=>`$${Buffer.byteLength(p)}\r\n${p}\r\n`).join('');
const s=net.createConnection(6379,'127.0.0.1');
let data='';
s.setTimeout(2000);
s.on('connect',()=>s.write(cmd('CONFIG','GET','save')+cmd('CONFIG','GET','appendonly')));
s.on('data',d=>data+=d.toString());
s.on('error',e=>{console.log(`redis-check-error: ${e.message}`); process.exit(0)});
s.on('timeout',()=>{console.log('redis-check-timeout'); process.exit(0)});
setTimeout(()=>{console.log(data.replace(/\r\n/g,' | ')); s.destroy();},1000);
NODE
} > "$out"
echo "$out"
