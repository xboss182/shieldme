# ShieldMe: Perfect Score Hardening Plan

**Date**: 2026-07-11
**Issue**: MNC-450
**Target**: 100/100 on internet.nl, SSL Labs A+, Mozilla Observatory A+, Hardenize full-green

---

## Current Status Summary

| Scanner | Current Gap |
|---|---|
| internet.nl (mail) | DMARC p=none, MTA-STS mode=testing, SPF ~all softfail |
| internet.nl (web) | Missing HSTS preload confirmation, CSP unsafe-inline |
| Mozilla Observatory | CSP unsafe-inline script-src/style-src, missing COEP, app.shieldme.cc no CSP |
| SSL Labs | Already strong (TLS 1.2/1.3, H3); no known gaps beyond Cloudflare-proxied limits |
| Hardenize | DMARC p=none, MTA-STS testing, CAA over-permissive (too many CAs) |

DNSSEC: **live** (RRSIG confirmed, `ad` flag via Cloudflare).

---

## Fix 1 — DMARC: p=none → p=reject (staged)

**Required for**: internet.nl 100%, Hardenize full-green

Current record:
```
v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com
```

### Step 1a — Move to quarantine first (safe gate)
Monitor Brevo DMARC aggregate reports. When legitimate mail passes alignment consistently, proceed.

Replace DNS TXT `_dmarc.shieldme.cc`:
```
v=DMARC1; p=quarantine; pct=100; rua=mailto:rua@dmarc.brevo.com; ruf=mailto:rua@dmarc.brevo.com; adkim=s; aspf=s
```

### Step 1b — Final: p=reject
After 1–2 weeks of quarantine with no false positives:
```
v=DMARC1; p=reject; pct=100; rua=mailto:rua@dmarc.brevo.com; ruf=mailto:rua@dmarc.brevo.com; adkim=s; aspf=s
```

**Risk**: Forwarded mail via Resend/SES may not align on DKIM d= for shieldme.cc. Verify Resend DKIM signing domain includes shieldme.cc alignment before moving to reject.

---

## Fix 2 — SPF: ~all → -all

**Required for**: internet.nl 100%

Current:
```
v=spf1 include:_spf.shieldme.cc ~all
```

Target (replace DNS TXT `shieldme.cc`):
```
v=spf1 include:_spf.shieldme.cc -all
```

**Risk**: Any unlisted sender is hard-rejected rather than soft-failed. Verify all legitimate outbound sources are in `_spf.shieldme.cc` before switching.

Check current SPF expansion:
```bash
dig TXT _spf.shieldme.cc +short
```

---

## Fix 3 — MTA-STS: mode=testing → mode=enforce

**Required for**: internet.nl 100%, Hardenize green

File: `/var/www/shieldme-security/.well-known/mta-sts.txt`

Current:
```
version: STSv1
mode: testing
mx: _dc-mx.d360e3349778.shieldme.cc
max_age: 604800
```

Target — update the file AND bump the policy ID in DNS:
```
version: STSv1
mode: enforce
mx: _dc-mx.d360e3349778.shieldme.cc
max_age: 604800
```

Then update DNS TXT `_mta-sts.shieldme.cc` to a new policy ID (must change to invalidate caches):
```
v=STSv1; id=20260711T000001Z
```

**Risk**: If the MX `_dc-mx.d360e3349778.shieldme.cc` → `152.42.211.146` ever goes down, senders that cached the enforce policy will bounce rather than deliver. Ensure SMTP ingress is reliable before enforcing.

Commands:
```bash
# Update the policy file
python3 -c "
import pathlib
p = pathlib.Path('/var/www/shieldme-security/.well-known/mta-sts.txt')
p.write_text('version: STSv1\nmode: enforce\nmx: _dc-mx.d360e3349778.shieldme.cc\nmax_age: 604800\n')
print('written')
"

# Verify
curl -s https://mta-sts.shieldme.cc/.well-known/mta-sts.txt
```

Then in Cloudflare DNS: change `_mta-sts.shieldme.cc` TXT to `v=STSv1; id=20260711T000001Z`.

---

## Fix 4 — CAA: Narrow to active CA only

**Required for**: Hardenize full-green, internet.nl bonus

Current CAA has 8+ records including digicert, comodo, ssl.com, pki.goog, letsencrypt. Cloudflare uses **Let's Encrypt** or **Google Trust Services (pki.goog)** for its managed certs.

Replace all CAA records with only the active issuers:
```
0 issue "letsencrypt.org"
0 issuewild "letsencrypt.org"
0 issue "pki.goog; cansignhttpexchanges=yes"
0 issuewild "pki.goog; cansignhttpexchanges=yes"
0 iodef "mailto:security@shieldme.cc"
```

Remove: digicert, comodoca, ssl.com entries.

---

## Fix 5 — CSP: Remove unsafe-inline from script-src

**Required for**: Mozilla Observatory A+, internet.nl web 100%

### shieldme.cc and www.shieldme.cc (Caddy)

Current:
```
Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.shieldme.cc https://app.shieldme.cc"
```

The `unsafe-inline` in `script-src` is the critical Mozilla Observatory deduction. TanStack Start SSR injects inline scripts — the fix is to add a **nonce** or **hash** approach in the build pipeline.

**Interim approach (without build changes)** — Use `strict-dynamic` + nonce placeholder or accept the `unsafe-inline` deduction and focus on removing it from `style-src` at minimum:

Minimum improvement (remove unsafe-inline from script-src, add strict-dynamic):
```
script-src 'self' 'strict-dynamic' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
```

Note: `strict-dynamic` makes `unsafe-inline` ignored by modern browsers while maintaining backward compat. This satisfies Observatory's `strict-dynamic` check.

**Full fix** (requires nonce in SSR build):
```
script-src 'nonce-{random}' 'strict-dynamic'
```

### app.shieldme.cc (Caddy) — missing CSP entirely

Add CSP to `app.shieldme.cc` block in Caddyfile:
```
Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; script-src 'self' 'strict-dynamic' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.shieldme.cc; font-src 'self' data: https:; upgrade-insecure-requests"
```

---

## Fix 6 — Add Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy

**Required for**: Mozilla Observatory A+

Currently `api.shieldme.cc` has COOP but not COEP. The main site is missing both.

Add to shieldme.cc, app.shieldme.cc Caddy header blocks:
```
Cross-Origin-Opener-Policy "same-origin"
Cross-Origin-Embedder-Policy "require-corp"
Cross-Origin-Resource-Policy "same-origin"
```

**Note**: COEP `require-corp` blocks cross-origin resources without explicit CORP headers (e.g. CDN fonts/images). Test carefully — if the site loads fonts or images from external CDNs, use `credentialless` instead of `require-corp`.

---

## Fix 7 — Caddy header deduplication

Currently several headers are emitted twice (HSTS, X-Frame-Options, X-Content-Type-Options) because both the Helmet middleware and Caddy set them. This is cosmetic on scoring but worth cleaning.

The API (`api.shieldme.cc`) sends duplicate headers because Express Helmet adds them and Caddy also adds them. Fix by removing the overlapping Caddy headers from `api.shieldme.cc` — let Helmet own them — or remove from Helmet and let Caddy own them.

---

## Summary: Execution Order

| Priority | Fix | DNS change? | File change? | Caddy change? | Risk |
|---|---|---|---|---|---|
| P0 | Fix 3 — MTA-STS enforce | Yes (policy ID) | Yes | No | Low if SMTP reliable |
| P0 | Fix 2 — SPF -all | Yes | No | No | Low if SPF record correct |
| P0 | Fix 5 — CSP app.shieldme.cc | No | No | Yes | Low |
| P0 | Fix 6 — COEP/COOP headers | No | No | Yes | Medium (test CDN resources) |
| P1 | Fix 1a — DMARC quarantine | Yes | No | No | Medium |
| P1 | Fix 4 — CAA narrow | Yes | No | No | Low |
| P1 | Fix 5 — CSP strict-dynamic | No | No | Yes | Low |
| P2 | Fix 1b — DMARC reject | Yes | No | No | Medium |
| P2 | Fix 7 — Header dedup | No | No | Yes/App | Low |

---

## Caddy Changes (ready to apply)

### app.shieldme.cc — add CSP + COEP/COOP

In `/etc/caddy/Caddyfile`, find `app.shieldme.cc` block header section and change to:

```caddy
header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; script-src 'self' 'strict-dynamic' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.shieldme.cc; font-src 'self' data: https:; upgrade-insecure-requests"
    Cross-Origin-Opener-Policy "same-origin"
    Cross-Origin-Embedder-Policy "credentialless"
    Cross-Origin-Resource-Policy "same-origin"
}
```

### shieldme.cc — upgrade CSP + add COEP/COOP

In `/etc/caddy/Caddyfile`, find `shieldme.cc, www.shieldme.cc` block header section and change to:

```caddy
header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; script-src 'self' 'strict-dynamic' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.shieldme.cc https://app.shieldme.cc; font-src 'self' data: https:; upgrade-insecure-requests"
    Cross-Origin-Opener-Policy "same-origin"
    Cross-Origin-Embedder-Policy "credentialless"
    Cross-Origin-Resource-Policy "same-origin"
}
```

After editing: `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`

---

## DNS Changes Required (Cloudflare)

All in the `shieldme.cc` zone:

1. **`_dmarc.shieldme.cc` TXT** — change to `v=DMARC1; p=quarantine; pct=100; rua=mailto:rua@dmarc.brevo.com; adkim=s; aspf=s`
2. **`shieldme.cc` TXT (SPF)** — change `~all` to `-all`
3. **`_mta-sts.shieldme.cc` TXT** — change to `v=STSv1; id=20260711T000001Z`
4. **CAA records** — remove digicert, comodoca, ssl.com; keep only letsencrypt.org, pki.goog, iodef

File change also required for MTA-STS mode:
```bash
python3 -c "
import pathlib
p = pathlib.Path('/var/www/shieldme-security/.well-known/mta-sts.txt')
p.write_text('version: STSv1\nmode: enforce\nmx: _dc-mx.d360e3349778.shieldme.cc\nmax_age: 604800\n')
print(p.read_text())
"
```

---

## Notes on Scoring Limits

- **SSL Labs A+**: Already achievable with current TLS config via Cloudflare. No changes needed beyond HSTS preload (already set). Score should be A+.
- **internet.nl web**: Will reach 100% once HSTS preload is confirmed in browser preload list (already configured) and CSP `unsafe-inline` is removed from script-src.
- **internet.nl mail**: Needs DMARC p=reject + SPF -all + MTA-STS enforce. DKIM alignment via Resend must be confirmed before p=reject.
- **Mozilla Observatory A+**: Needs CSP without `unsafe-inline` on script-src, or with `strict-dynamic`. COEP adds bonus points. app.shieldme.cc needs CSP.
- **Hardenize**: Needs DMARC enforce, MTA-STS enforce, CAA narrowed. DANE/TLSA optional bonus.
