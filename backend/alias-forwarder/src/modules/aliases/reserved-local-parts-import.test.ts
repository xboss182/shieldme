import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeReservedLocalPartsSource,
  ReservedLocalPartsImportError,
} from './reserved-local-parts-import.js';
import {
  createReservedLocalPartsManifest,
  generateReservedLocalPartsSql,
  RESERVED_LOCAL_PARTS_BATCH_ID,
  RESERVED_LOCAL_PARTS_SOURCE_SHA256,
} from './reserved-local-parts-artifact.js';
import { getReservedLocalParts } from './reserved-local-parts.js';

const sourcePath = join(process.cwd(), 'data/reserved-local-parts/dom.txt');
const source = readFileSync(sourcePath);

describe('reserved local-parts import', () => {
  it('reproduces the authoritative source hash and report', () => {
    const { values, report } = analyzeReservedLocalPartsSource(source, RESERVED_LOCAL_PARTS_SOURCE_SHA256);
    const valueSet = new Set(values);
    const overlaps = getReservedLocalParts().filter((value) => valueSet.has(value));

    expect(report).toMatchObject({
      sha256: RESERVED_LOCAL_PARTS_SOURCE_SHA256,
      physicalLines: 2425,
      blankLines: 1212,
      nonEmptyLines: 1213,
      uniqueNormalized: 1212,
      duplicateOccurrences: 1,
      lowercaseChanges: 1,
      trimChanges: 0,
      rejectedEntries: 0,
      minLength: 1,
      maxLength: 37,
    });
    expect(report.duplicates).toEqual([{ normalized: 'vestorado', firstLine: 2215, duplicateLine: 2217 }]);
    expect(report.lowercased).toEqual([
      expect.objectContaining({ value: 'Slack', normalized: 'slack' }),
    ]);
    expect(overlaps).toEqual(['accounts', 'billing', 'demo', 'dev', 'support', 'system']);
    expect(values).toContain('9router');
    expect(values).toContain('cli.gs');
    expect(values).toContain('pay.skrill');
  });

  it('handles UTF-8 BOM, LF, CRLF, whitespace, mixed case, and duplicates', () => {
    const { values, report } = analyzeReservedLocalPartsSource(
      Buffer.from('\uFEFF Alpha \r\n\r\ncli.gs\nalpha\n'),
    );

    expect(values).toEqual(['alpha', 'cli.gs']);
    expect(report).toMatchObject({
      physicalLines: 4,
      blankLines: 1,
      nonEmptyLines: 3,
      uniqueNormalized: 2,
      duplicateOccurrences: 1,
      lowercaseChanges: 1,
      trimChanges: 1,
      rejectedEntries: 0,
    });
  });

  it('fails with every rejected line and preserves the report', () => {
    let error: unknown;
    try {
      analyzeReservedLocalPartsSource(Buffer.from('valid\r\nhas space\r\n.bad\r\nalso@gone'));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ReservedLocalPartsImportError);
    expect((error as ReservedLocalPartsImportError).message).toContain('line 2');
    expect((error as ReservedLocalPartsImportError).message).toContain('line 3');
    expect((error as ReservedLocalPartsImportError).message).toContain('line 4');
    expect((error as ReservedLocalPartsImportError).report.rejects).toHaveLength(3);
  });

  it('emits stable idempotent SQL with conflict, guard, metadata, and collision reporting', () => {
    const { values, report } = analyzeReservedLocalPartsSource(source, RESERVED_LOCAL_PARTS_SOURCE_SHA256);
    const valueSet = new Set(values);
    const overlaps = getReservedLocalParts().filter((value) => valueSet.has(value));
    const manifest = createReservedLocalPartsManifest(report, overlaps);
    const first = generateReservedLocalPartsSql(values, manifest);
    const second = generateReservedLocalPartsSql(values, manifest);

    expect(first).toBe(second);
    expect(first).toContain(`'${RESERVED_LOCAL_PARTS_BATCH_ID}'`);
    expect(first).toContain('ON CONFLICT ("batch_id", "local_part") DO NOTHING');
    expect(first).toContain('Incompatible global allow rules conflict with reserved alias import');
    expect(first).toContain('Domain-scoped allow overrides preserved');
    expect(first).toContain('aliases_reserved_local_part_guard');
    expect(first).toContain('reserved_local_parts_import_collisions');
    expect(first).toContain('reserved_alias.batch_imported');
  });
});
