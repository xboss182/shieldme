import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeReservedLocalPartsSource } from '../modules/aliases/reserved-local-parts-import.js';
import { getReservedLocalParts } from '../modules/aliases/reserved-local-parts.js';
import {
  createReservedLocalPartsManifest,
  generateReservedLocalPartsSql,
  RESERVED_LOCAL_PARTS_SOURCE_SHA256,
} from '../modules/aliases/reserved-local-parts-artifact.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = join(root, 'data/reserved-local-parts/dom.txt');
const manifestPath = join(root, 'data/reserved-local-parts/dom.report.json');
const sqlPath = join(root, 'drizzle/operational/20260718_dom_reserved_local_parts.sql');
const source = await readFile(sourcePath);
const { values, report } = analyzeReservedLocalPartsSource(source, RESERVED_LOCAL_PARTS_SOURCE_SHA256);
const valueSet = new Set(values);
const overlaps = getReservedLocalParts().filter((value) => valueSet.has(value));
const manifest = createReservedLocalPartsManifest(report, overlaps);
const sql = generateReservedLocalPartsSql(values, manifest);
const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const [existingManifest, existingSql] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(sqlPath, 'utf8'),
  ]);
  const mismatches = [];
  if (existingManifest !== manifestJson) mismatches.push(manifestPath);
  if (existingSql !== sql) mismatches.push(sqlPath);
  if (mismatches.length) throw new Error(`Generated reserved local-parts artifacts are stale: ${mismatches.join(', ')}`);
} else {
  await Promise.all([
    writeFile(manifestPath, manifestJson, 'utf8'),
    writeFile(sqlPath, sql, 'utf8'),
  ]);
}

process.stdout.write(manifestJson);
