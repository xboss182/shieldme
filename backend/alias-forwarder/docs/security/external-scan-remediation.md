# External Scan Remediation — ShieldMe

Issue: MNC-432
Date: 2026-07-09
Targets: `shieldme.cc`, `www.shieldme.cc`, `app.shieldme.cc`, `api.shieldme.cc`

## Inputs reviewed
- Hardenize report: https://www.hardenize.com/report/shieldme.cc/1783635178
- Internet.nl report: https://internet.nl/site/www.shieldme.cc/4178553/
- ForwardEmail benchmark: https://forwardemail.net/en/security

## Before snapshot
- Hardenize: DNS/DNSSEC good; CAA neutral/missing; HTTPS/TLS/certs good; HSTS warning; CSP neutral/missing; email SMTP TLS/certs/DANE incomplete; SPF error; DMARC neutral (`p=none`); MTA-STS and TLS-RPT missing.
- Internet.nl: score 95%; IPv6/DNSSEC/RPKI passed; CAA missing; security options warning for CSP/security.txt; Referrer-Policy `strict-origin-when-cross-origin` flagged; DANE TLSA absent (optional).
- Current DNS still has no `CAA`, `_mta-sts`, or `_smtp._tls` records. `_dmarc` is `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`.

No Cloudflare/API credentials were present in runtime env or project env files, so DNS changes are documented below for owner/provider application rather than applied in this run.

## Changes applied live

### Caddy: public web security headers
File changed: `/etc/caddy/Caddyfile`

For `shieldme.cc, www.shieldme.cc`:
- Changed `Referrer-Policy` from `strict-origin-when-cross-origin` to `no-referrer`.
- Added Content Security Policy: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.shieldme.cc https://app.shieldme.cc`.

`unsafe-inline` is intentionally retained because the TanStack Start SSR output includes inline bootstrapping scripts/styles. Removing it safely requires nonce/hash work in the app build.

### Static: security.txt
Created `/var/www/shieldme-security/.well-known/security.txt` and routed `https://shieldme.cc/.well-known/security.txt` to it.

```text
Contact: mailto:security@shieldme.cc
Preferred-Languages: en
Canonical: https://shieldme.cc/.well-known/security.txt
Policy: https://shieldme.cc/.well-known/security.txt
Expires: 2027-07-09T00:00:00Z
```

### Reload
- `caddy validate --config /etc/caddy/Caddyfile`: valid.
- `systemctl reload caddy`: completed.
- No PM2 app restart was required because only Caddy/static files changed.

## Verification evidence

```text
/etc/caddy/Caddyfile mtime: 2026-07-09 22:27:16 UTC
/etc/caddy/Caddyfile md5: d30343c361487438f8e476dcc5694244
systemctl is-active caddy: active
```

`curl -sSI https://www.shieldme.cc/` returned HTTP 200 with:

```text
content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.shieldme.cc https://app.shieldme.cc
referrer-policy: no-referrer
strict-transport-security: max-age=31536000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
```

`curl -sS https://shieldme.cc/.well-known/security.txt` returned the expected body.

Availability checks:
- `https://app.shieldme.cc/`: HTTP 200.
- `https://api.shieldme.cc/`: HTTP 200 JSON response.

## DNS changes still needed

### CAA
Recommended if Cloudflare/Google Trust Services is the intended issuer:

```text
shieldme.cc. CAA 0 issue "pki.goog"
shieldme.cc. CAA 0 issuewild "pki.goog"
shieldme.cc. CAA 0 iodef "mailto:security@shieldme.cc"
```

If Let's Encrypt is also used for origin/non-Cloudflare issuance, add:

```text
shieldme.cc. CAA 0 issue "letsencrypt.org"
shieldme.cc. CAA 0 issuewild "letsencrypt.org"
```

### MTA-STS
Add DNS:

```text
_mta-sts.shieldme.cc. TXT "v=STSv1; id=20260709T222700Z"
```

Add `mta-sts.shieldme.cc` A/AAAA or CNAME to the web edge, then host `https://mta-sts.shieldme.cc/.well-known/mta-sts.txt` with an initial testing policy:

```text
version: STSv1
mode: testing
mx: _dc-mx.d360e3349778.shieldme.cc
max_age: 604800
```

Move to `enforce` only after report review and delivery validation.

### TLS-RPT
Add DNS:

```text
_smtp._tls.shieldme.cc. TXT "v=TLSRPTv1; rua=mailto:tlsrpt@shieldme.cc"
```

Use a monitored mailbox/reporting processor before enabling at scale.

### DMARC progression
Current: `p=none`. Recommended owner-decision progression:
1. Keep `p=none` until aggregate reports are actively reviewed.
2. Move to `p=quarantine; pct=25`, then 50, then 100 after SPF/DKIM alignment is confirmed.
3. Move to `p=reject` only after all legitimate senders are aligned.

Do not jump directly to quarantine/reject because ShieldMe is an email product and delivery continuity is critical.

### DANE/TLSA
DNSSEC is enabled, but DANE is not safe to apply while the visible web certificate is Cloudflare-managed and may rotate. For SMTP DANE, first confirm the authoritative MX host, certificate chain, renewal model, and whether Cloudflare/proxying is involved. Owner-decision/future engineering item.

## ForwardEmail benchmark gaps
Remaining gaps versus ForwardEmail-style posture:
- Public security/contact docs: partially addressed with `security.txt`; fuller vulnerability disclosure page still recommended.
- Mail transport policy: MTA-STS and TLS-RPT not yet published.
- DMARC enforcement: monitoring-only.
- DANE/TLSA: not enabled; requires certificate/DNSSEC operational ownership.
- Abuse/transparency controls: publish abuse contact, privacy/security posture page, and reporting workflow as public documentation.

## Recommended retest
After DNS records are added and propagated, rerun:
- https://www.hardenize.com/report/shieldme.cc/
- https://internet.nl/site/www.shieldme.cc/
- Internet.nl mail test for `shieldme.cc`

Expected immediate web improvements from this run: CSP present, stricter Referrer-Policy, and security.txt available.

## 2026-07-09 follow-up: `cf2.txt` credential attempt

The replacement Cloudflare credential from attachment `cf2.txt` was downloaded and tested against Cloudflare's token verification endpoint. Cloudflare returned HTTP 401 with `Invalid API Token`, so no Cloudflare DNS records were created or updated.

Prepared safe server-side support for future MTA-STS DNS activation:

- Added `/var/www/shieldme-security/.well-known/mta-sts.txt` with testing policy:

```text
version: STSv1
mode: testing
mx: _dc-mx.d360e3349778.shieldme.cc
max_age: 604800
```

- Added a Caddy site block for `mta-sts.shieldme.cc` serving `/var/www/shieldme-security`.
- Validated and reloaded Caddy successfully.

This will become reachable once a valid DNS record for `mta-sts.shieldme.cc` is added. The DNS-side items remain blocked pending a valid Cloudflare token.

## 2026-07-09 follow-up: Cloudflare DNS remediation applied

A valid Cloudflare API token was provided and verified as active. DNS-side low-risk remediation was applied for `shieldme.cc`:

- Added/confirmed CAA records for Google Trust Services and Let's Encrypt issuance plus `iodef` reporting to `security@shieldme.cc`. Existing Cloudflare-managed CAAs remain in place.
- Added `mta-sts.shieldme.cc` A record pointing to `152.42.211.146`; Cloudflare proxy serves the MTA-STS policy successfully.
- Added `_mta-sts.shieldme.cc` TXT: `v=STSv1; id=20260709T233901Z`.
- Added `_smtp._tls.shieldme.cc` TXT: `v=TLSRPTv1; rua=mailto:tlsrpt@shieldme.cc`.

Verification:

- `dig CAA shieldme.cc` returns the new CAA set including `letsencrypt.org`, `pki.goog`, and `iodef`.
- Authoritative Cloudflare and public resolvers return `_mta-sts.shieldme.cc` TXT.
- `dig TXT _smtp._tls.shieldme.cc` returns the TLS-RPT record.
- `https://mta-sts.shieldme.cc/.well-known/mta-sts.txt` returns HTTP 200 with the testing policy.
- `app.shieldme.cc`, `api.shieldme.cc`, and `shieldme.cc/.well-known/security.txt` remained HTTP 200 during verification.

Owner-decision items still not applied: DMARC progression from `p=none` to quarantine/reject, and DANE/TLSA records. Those require mail-delivery monitoring/receiver support validation before enforcement.
