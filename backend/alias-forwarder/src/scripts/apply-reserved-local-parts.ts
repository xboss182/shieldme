import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/client.js';
import { RESERVED_LOCAL_PARTS_BATCH_ID } from '../modules/aliases/reserved-local-parts-artifact.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = await readFile(
  join(root, 'drizzle/operational/20260718_dom_reserved_local_parts.sql'),
  'utf8',
);

try {
  await pool.query(migration);
  const result = await pool.query({
    text: `SELECT
      (SELECT count(*)::integer FROM "reserved_local_part_import_entries" WHERE "batch_id" = $1) AS "batchEntries",
      (SELECT count(*)::integer FROM "reserved_local_parts" WHERE "source_batch" = $1) AS "sourceOwnedRules",
      (SELECT count(*)::integer
       FROM "reserved_local_part_import_entries" entries
       JOIN "reserved_local_parts" rules
         ON rules."local_part" = entries."local_part"
        AND rules."domain_id" IS NULL
        AND rules."action" = 'reserve'
        AND rules."source_batch" IS DISTINCT FROM $1
       WHERE entries."batch_id" = $1) AS "preservedGlobalReserveRules",
      (SELECT count(*)::integer
       FROM "reserved_local_part_import_entries" entries
       JOIN "reserved_local_parts" rules
         ON rules."local_part" = entries."local_part"
        AND rules."domain_id" IS NOT NULL
        AND rules."action" = 'allow'
       WHERE entries."batch_id" = $1) AS "domainAllowOverrides",
      (SELECT coalesce(sum("alias_count"), 0)::integer
       FROM "reserved_local_parts_import_collisions"
       WHERE "batch_id" = $1) AS "existingAliasCollisions"`,
    values: [RESERVED_LOCAL_PARTS_BATCH_ID],
  });
  process.stdout.write(`${JSON.stringify({ batchId: RESERVED_LOCAL_PARTS_BATCH_ID, ...result.rows[0] }, null, 2)}\n`);
} finally {
  await pool.end();
}
