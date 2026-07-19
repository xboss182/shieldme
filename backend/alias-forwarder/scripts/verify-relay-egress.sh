#!/usr/bin/env bash
set -euo pipefail
: "${RELAY_ALLOWED_HOST:?RELAY_ALLOWED_HOST is required}"
: "${RELAY_ALLOWED_PORT:=587}"

nft list table inet shieldme_relay_egress

runuser -u shieldme -- node - "$RELAY_ALLOWED_HOST" "$RELAY_ALLOWED_PORT" <<'NODE'
const net = require('node:net');
const [host, port] = process.argv.slice(2);
const socket = net.connect({ host, port: Number(port), timeout: 5_000 });
socket.once('connect', () => { socket.end(); process.exit(0); });
socket.once('timeout', () => { socket.destroy(); process.exit(0); });
socket.once('error', ({ code }) => process.exit(['EACCES', 'EPERM'].includes(code) ? 1 : 0));
NODE

echo "allowed relay probe passed"
for target in 127.0.0.1 169.254.169.254 10.0.0.1 100.64.0.1 192.0.2.1 224.0.0.1; do
  if runuser -u shieldme -- node - "$target" <<'NODE'
const net = require('node:net');
const host = process.argv[2];
const socket = net.connect({ host, port: 587, timeout: 2_000 });
socket.once('connect', () => { socket.end(); process.exit(2); });
socket.once('timeout', () => { socket.destroy(); process.exit(2); });
socket.once('error', ({ code }) => process.exit(['EACCES', 'EPERM'].includes(code) ? 0 : 2));
NODE
  then
    echo "blocked relay probe passed: $target"
  else
    echo "blocked relay probe failed: $target" >&2
    exit 1
  fi
done
