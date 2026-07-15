# Vendor Management Policy

## Vendors
- **DigitalOcean**: VPS hosting for app, database, Redis, PM2 services.
- **Cloudflare**: DNS/CDN/TLS edge for shieldme.cc domains.
- **Resend**: outbound email delivery and webhook provider.
- **Multica**: issue/task orchestration.
- **GitHub/npm**: source/package supply chain.

## Review cadence
Review vendor list quarterly and after major architecture changes. Confirm MFA, account owner, data shared, and incident notification path.

## Data shared
Resend receives forwarded email content for delivery. Cloudflare processes edge HTTP metadata. DigitalOcean hosts all runtime data. GitHub/npm receive source/dependency metadata only.
