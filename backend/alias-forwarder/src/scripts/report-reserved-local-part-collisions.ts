import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/client.js';
import { analyzeReservedLocalPartsSource } from '../modules/aliases/reserved-local-parts-import.js';
import {
  RESERVED_LOCAL_PARTS_BATCH_ID,
  RESERVED_LOCAL_PARTS_SOURCE_SHA256,
} from '../modules/aliases/reserved-local-parts-artifact.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = await readFile(join(root, 'data/reserved-local-parts/dom.txt'));
const { values, report } = analyzeReservedLocalPartsSource(source, RESERVED_LOCAL_PARTS_SOURCE_SHA256);

try {
  const result = await pool.query({
    text: `SELECT
             aliases."status",
             domains."domain",
             count(*)::integer AS "alias_count",
             array_agg(aliases."local_part" ORDER BY aliases."local_part") AS "local_parts"
           FROM "aliases" aliases
           JOIN "domains" domains ON domains."id" = aliases."domain_id"
           WHERE aliases."local_part" = ANY($1::text[])
           GROUP BY aliases."status", domains."domain"
           ORDER BY aliases."status", domains."domain"`,
    values: [values],
  });

  process.stdout.write(`${JSON.stringify({
    batchId: RESERVED_LOCAL_PARTS_BATCH_ID,
    sourceSha256: report.sha256,
    uniqueNormalized: report.uniqueNormalized,
    collisions: result.rows,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
