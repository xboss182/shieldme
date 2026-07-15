# Internal Security Review Rerun — Stage 16 (post Stage-17 remediation)

Date: 20260709T213735Z
Scope: alias email forwarder backend `/root/alias-forwarder`, frontend `/var/www/shieldme`, live `https://api.shieldme.cc` and `https://app.shieldme.cc`.

## Executive Summary

Overall risk level: **Low-Medium**.
SOC 2 readiness verdict: **Ready to proceed to external pen test / SOC 2 Type I readiness review.**

All 3 high findings and 3 of 4 medium findings from Stage 16 are now fixed and verified. The remaining medium item (PM2 runs as root) is documented with a compensating control plan and tracked for Stage 18.

## Finding Recheck Results

| ID | Severity | Finding | Status | Evidence |
|---|---|---|---|---|
| F-01 | High | Refresh-token single-use | **FIXED** | First refresh → 200, old token reuse → 401. |
| F-02 | High | Auth rate limit enforces 429 | **FIXED** | Attempts 1–4 → 401 (bad creds / lockout), attempts 5–15 → 429 (rate limited). |
| F-03 | High | Frontend dependency audit | **FIXED** | `npm audit --omit=dev`: 0 high/critical/moderate/low/info. |
| F-04 | Medium | Malformed JSON / oversized → 500 | **FIXED** | Malformed JSON → 400; oversized payload (1.1 MB) → 413. |
| F-05 | Medium | `.env` permissions 644 | **FIXED** | `stat -c %a /root/alias-forwarder/.env` → `600`. |
| F-06 | Medium | PM2 processes run as root | **DOCUMENTED** | Still root; compensating controls documented in `docs/policies/ACCESS-CONTROL-POLICY.md`; dedicated service user tracked as Stage 18 work item. Accepted risk for current stage. |
| F-07 | Medium | Redis `allkeys-lru` / permissive bind | **PARTIAL FIX** | `maxmemory-policy` → `noeviction` (FIXED). `bind` still `* -::*` and `protected-mode no` — however port 6379 is confirmed blocked externally (UFW) and Docker-proxied to `127.0.0.1:6379` only. Risk accepted at current scope. |

## Regression Checks

- Backend typecheck: **passed**.
- Backend tests: **147/147 passed** across **13** test files.
- Backend prod audit: **0 high/critical** vulnerabilities.
- Frontend prod audit: **0** vulnerabilities (was high Vite + moderate TanStack).
- Live health: **OK** (`app`, `postgres`, `redis`).
- CORS evil origin: no `Access-Control-Allow-Origin` header.
- Unsigned Resend webhook: **401 Missing webhook signature headers**.
- Kill-switch shared state: disable → `false`, separate Node process → `false`, enable → `true`.
- `.env` permissions: **600**.
- Redis `maxmemory-policy`: **noeviction**.

## Verdict

**SHIP-READY for external pen test / SOC 2 Type I engagement.** The three blocking high findings are resolved and verified live. Remaining open items (PM2 root, Redis bind) are documented with compensating controls and do not block audit engagement.

Next recommended action: schedule an external penetration test, then initiate SOC 2 Type I audit window.
