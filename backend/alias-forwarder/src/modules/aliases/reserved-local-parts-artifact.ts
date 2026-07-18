import type { ReservedLocalPartsImportReport } from './reserved-local-parts-import.js';

export const RESERVED_LOCAL_PARTS_BATCH_ID = 'dom-20260718-6cf9ba0627cc';
export const RESERVED_LOCAL_PARTS_SOURCE_SHA256 = '6cf9ba0627cc29a3ae32e0c4d32a0bd742ef050d198be805bf1cbed837fd08f6';
export const RESERVED_LOCAL_PARTS_SOURCE_PATH = 'data/reserved-local-parts/dom.txt';

export type ReservedLocalPartsManifest = ReservedLocalPartsImportReport & {
  batchId: string;
  sourcePath: string;
  staticFallbackOverlapCount: number;
  staticFallbackOverlaps: string[];
};

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function createReservedLocalPartsManifest(
  report: ReservedLocalPartsImportReport,
  staticFallbackOverlaps: string[],
): ReservedLocalPartsManifest {
  const overlaps = [...staticFallbackOverlaps].sort();
  return {
    batchId: RESERVED_LOCAL_PARTS_BATCH_ID,
    sourcePath: RESERVED_LOCAL_PARTS_SOURCE_PATH,
    ...report,
    staticFallbackOverlapCount: overlaps.length,
    staticFallbackOverlaps: overlaps,
  };
}

export function generateReservedLocalPartsSql(values: string[], manifest: ReservedLocalPartsManifest) {
  const entries = values
    .map((value) => `  (${sqlString(manifest.batchId)}, ${sqlString(value)})`)
    .join(',\n');
  const report = JSON.stringify(manifest).replaceAll("'", "''");
  const staticOverlaps = manifest.staticFallbackOverlaps.map(sqlString).join(', ');

  return `BEGIN;

LOCK TABLE "aliases" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "reserved_local_parts" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "reserved_local_parts" ADD COLUMN IF NOT EXISTS "source_batch" text;
ALTER TABLE "reserved_local_parts" ADD COLUMN IF NOT EXISTS "source_sha256" text;

CREATE TABLE IF NOT EXISTS "reserved_local_part_import_batches" (
  "batch_id" text PRIMARY KEY,
  "source_path" text NOT NULL,
  "source_sha256" text NOT NULL,
  "report" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "reserved_local_part_import_entries" (
  "batch_id" text NOT NULL REFERENCES "reserved_local_part_import_batches"("batch_id") ON DELETE CASCADE,
  "local_part" text NOT NULL,
  PRIMARY KEY ("batch_id", "local_part")
);

INSERT INTO "reserved_local_part_import_batches" ("batch_id", "source_path", "source_sha256", "report")
VALUES (${sqlString(manifest.batchId)}, ${sqlString(manifest.sourcePath)}, ${sqlString(manifest.sha256)}, '${report}'::jsonb)
ON CONFLICT ("batch_id") DO UPDATE SET
  "source_path" = EXCLUDED."source_path",
  "source_sha256" = EXCLUDED."source_sha256",
  "report" = EXCLUDED."report";

INSERT INTO "reserved_local_part_import_entries" ("batch_id", "local_part") VALUES
${entries}
ON CONFLICT ("batch_id", "local_part") DO NOTHING;

DO $reserved_conflicts$
DECLARE
  conflicts text;
  overrides text;
BEGIN
  SELECT string_agg(entries.local_part, ', ' ORDER BY entries.local_part)
  INTO conflicts
  FROM "reserved_local_part_import_entries" entries
  JOIN "reserved_local_parts" rules
    ON rules."local_part" = entries."local_part"
   AND rules."domain_id" IS NULL
   AND rules."action" = 'allow'
  WHERE entries."batch_id" = ${sqlString(manifest.batchId)};

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Incompatible global allow rules conflict with reserved alias import',
      DETAIL = conflicts;
  END IF;

  SELECT string_agg(entries.local_part || '@' || domains.domain, ', ' ORDER BY entries.local_part, domains.domain)
  INTO overrides
  FROM "reserved_local_part_import_entries" entries
  JOIN "reserved_local_parts" rules
    ON rules."local_part" = entries."local_part"
   AND rules."domain_id" IS NOT NULL
   AND rules."action" = 'allow'
  JOIN "domains" domains ON domains."id" = rules."domain_id"
  WHERE entries."batch_id" = ${sqlString(manifest.batchId)};

  IF overrides IS NOT NULL THEN
    RAISE NOTICE 'Domain-scoped allow overrides preserved: %', overrides;
  END IF;
END
$reserved_conflicts$;

INSERT INTO "reserved_local_parts" ("local_part", "domain_id", "action", "note", "source_batch", "source_sha256")
SELECT entries."local_part", NULL, 'reserve', 'Imported from dom.txt', ${sqlString(manifest.batchId)}, ${sqlString(manifest.sha256)}
FROM "reserved_local_part_import_entries" entries
WHERE entries."batch_id" = ${sqlString(manifest.batchId)}
  AND NOT EXISTS (
    SELECT 1
    FROM "reserved_local_parts" existing
    WHERE existing."local_part" = entries."local_part"
      AND existing."domain_id" IS NULL
  )
ORDER BY entries."local_part"
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS "reserved_local_parts_source_batch_idx"
ON "reserved_local_parts" ("source_batch")
WHERE "source_batch" IS NOT NULL;

CREATE OR REPLACE FUNCTION "shieldme_guard_reserved_alias"()
RETURNS trigger
LANGUAGE plpgsql
AS $reserved_guard$
DECLARE
  effective_action "reserved_local_part_action";
BEGIN
  SELECT rules."action"
  INTO effective_action
  FROM "reserved_local_parts" rules
  WHERE rules."local_part" = lower(btrim(NEW."local_part"))
    AND (rules."domain_id" = NEW."domain_id" OR rules."domain_id" IS NULL)
  ORDER BY CASE WHEN rules."domain_id" = NEW."domain_id" THEN 0 ELSE 1 END
  LIMIT 1;

  IF effective_action = 'reserve' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'SHIELDME_RESERVED_ALIAS',
      DETAIL = NEW."local_part",
      CONSTRAINT = 'aliases_reserved_local_part_guard';
  END IF;

  RETURN NEW;
END
$reserved_guard$;

DROP TRIGGER IF EXISTS "aliases_reserved_local_part_guard" ON "aliases";
CREATE TRIGGER "aliases_reserved_local_part_guard"
BEFORE INSERT OR UPDATE OF "local_part", "domain_id" ON "aliases"
FOR EACH ROW EXECUTE FUNCTION "shieldme_guard_reserved_alias"();

CREATE OR REPLACE VIEW "reserved_local_parts_import_collisions" AS
SELECT
  entries."batch_id",
  aliases."status",
  domains."domain",
  count(*)::integer AS "alias_count",
  array_agg(aliases."local_part" ORDER BY aliases."local_part") AS "local_parts"
FROM "reserved_local_part_import_entries" entries
JOIN "aliases" aliases ON aliases."local_part" = entries."local_part"
JOIN "domains" domains ON domains."id" = aliases."domain_id"
GROUP BY entries."batch_id", aliases."status", domains."domain";

INSERT INTO "audit_logs" ("actor_type", "actor_id", "action", "target_type", "target_id", "metadata")
SELECT
  'system',
  NULL,
  'reserved_alias.batch_imported',
  'reserved_local_part_batch',
  ${sqlString(manifest.batchId)},
  jsonb_build_object(
    'sourcePath', ${sqlString(manifest.sourcePath)},
    'sourceSha256', ${sqlString(manifest.sha256)},
    'uniqueNormalized', ${manifest.uniqueNormalized},
    'sourceOwnedRules', (SELECT count(*) FROM "reserved_local_parts" WHERE "source_batch" = ${sqlString(manifest.batchId)}),
    'preservedGlobalReserveRules', (
      SELECT count(*)
      FROM "reserved_local_part_import_entries" entries
      JOIN "reserved_local_parts" rules
        ON rules."local_part" = entries."local_part"
       AND rules."domain_id" IS NULL
       AND rules."action" = 'reserve'
       AND rules."source_batch" IS DISTINCT FROM ${sqlString(manifest.batchId)}
      WHERE entries."batch_id" = ${sqlString(manifest.batchId)}
    ),
    'domainAllowOverrides', (
      SELECT count(*)
      FROM "reserved_local_part_import_entries" entries
      JOIN "reserved_local_parts" rules
        ON rules."local_part" = entries."local_part"
       AND rules."domain_id" IS NOT NULL
       AND rules."action" = 'allow'
      WHERE entries."batch_id" = ${sqlString(manifest.batchId)}
    ),
    'staticFallbackOverlaps', jsonb_build_array(${staticOverlaps})
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM "audit_logs"
  WHERE "action" = 'reserved_alias.batch_imported'
    AND "target_type" = 'reserved_local_part_batch'
    AND "target_id" = ${sqlString(manifest.batchId)}
);

COMMIT;
`;
}
