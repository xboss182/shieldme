# shieldme

## Reserved alias batch

`data/reserved-local-parts/dom.txt` is the authoritative source for batch `dom-20260718-6cf9ba0627cc`. Its SHA-256 and normalization report are pinned in `data/reserved-local-parts/dom.report.json`. Run `npm run reserved:check` in CI or `npm run reserved:generate` after an intentional source update.

Apply `drizzle/operational/20260718_dom_reserved_local_parts.sql` with `npm run reserved:apply`. The transaction fails on incompatible global `allow` rules, preserves identical global `reserve` rules, reports domain-scoped `allow` overrides, adds only missing global reserves, installs the database guard, records source metadata, and leaves all existing aliases unchanged.

Run `npm run reserved:collisions` before and after applying the batch. It reads `reserved_local_parts_import_collisions` and reports existing aliases grouped by status and domain without changing, disabling, reassigning, or deleting them.

Alias PATCH changes only PGP mode. Enable and disable change only status. These paths preserve existing alias local-parts, including collisions with newly reserved names. A future local-part or domain rename must run the same reservation check and remain covered by the database trigger.

Rollback requires restoring the pre-change database snapshot first, then reverting the code. If a targeted rollback is approved instead, delete only `reserved_local_parts` rows whose `source_batch` is `dom-20260718-6cf9ba0627cc`, remove the batch entry and guard/view objects introduced by the operational SQL, and preserve every pre-existing rule and alias.
