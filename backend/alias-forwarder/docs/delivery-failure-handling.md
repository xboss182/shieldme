# Delivery Failure Handling Without Body Storage

Resend and AWS SES webhook events are normalized through `src/modules/delivery/delivery-events.service.ts` into a common delivery status vocabulary: `delivered`, `failed`, `bounced`, and `complained`.

Hard bounces and spam complaints automatically add the recipient address to the suppression list. Suppressed recipients are checked before forwarding attempts so future delivery to that address is blocked.

The dashboard/API surfaces delivery health without storing message content:

- `GET /api/delivery-failures/indicators` — per-alias failure indicator badges.
- `GET /api/delivery-failures/aliases/:aliasId` — per-alias failure history.
- `GET /api/delivery-failures/suppressed` — suppressed address list.
- `GET /api/admin/delivery-failures` — admin workspace-wide failure list.
- `GET /api/admin/delivery-failures/summary` — admin failure counts by reason.
- `GET /api/admin/suppression` — admin suppressed address list.

All delivery failure records are metadata-only and exclude message bodies, raw MIME, attachments, and content snippets.
