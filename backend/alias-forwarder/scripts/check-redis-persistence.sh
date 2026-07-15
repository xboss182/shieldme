#!/usr/bin/env bash
set -euo pipefail
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
redis-cli -u "$REDIS_URL" CONFIG GET save appendonly dir dbfilename appendfilename
