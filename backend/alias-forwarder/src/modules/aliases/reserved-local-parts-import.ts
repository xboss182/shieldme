import { createHash } from 'node:crypto';
import { isValidLocalPart, normalizeLocalPart } from './local-part.js';

export type ImportEntryChange = {
  line: number;
  value: string;
  normalized: string;
};

export type ImportDuplicate = {
  normalized: string;
  firstLine: number;
  duplicateLine: number;
};

export type ImportReject = {
  line: number;
  value: string;
  normalized: string;
  reason: string;
};

export type ReservedLocalPartsImportReport = {
  sha256: string;
  physicalLines: number;
  blankLines: number;
  nonEmptyLines: number;
  uniqueNormalized: number;
  duplicateOccurrences: number;
  lowercaseChanges: number;
  trimChanges: number;
  rejectedEntries: number;
  minLength: number;
  maxLength: number;
  duplicates: ImportDuplicate[];
  lowercased: ImportEntryChange[];
  trimmed: ImportEntryChange[];
  rejects: ImportReject[];
};

export class ReservedLocalPartsImportError extends Error {
  constructor(
    message: string,
    public report: ReservedLocalPartsImportReport,
  ) {
    super(message);
    this.name = 'ReservedLocalPartsImportError';
  }
}

function decodeUtf8(source: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    throw new Error('Reserved local-parts source is not valid UTF-8');
  }
}

function physicalLines(text: string) {
  if (!text) return [];
  const lines = text.split(/\r\n|\n|\r/);
  if (/\r\n$|[\r\n]$/.test(text)) lines.pop();
  return lines;
}

export function analyzeReservedLocalPartsSource(
  source: Uint8Array,
  expectedSha256?: string,
): { values: string[]; report: ReservedLocalPartsImportReport } {
  const sha256 = createHash('sha256').update(source).digest('hex');
  const lines = physicalLines(decodeUtf8(source));
  const values = new Set<string>();
  const firstLines = new Map<string, number>();
  const duplicates: ImportDuplicate[] = [];
  const lowercased: ImportEntryChange[] = [];
  const trimmed: ImportEntryChange[] = [];
  const rejects: ImportReject[] = [];
  let blankLines = 0;
  let nonEmptyLines = 0;

  lines.forEach((value, index) => {
    const line = index + 1;
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      blankLines += 1;
      return;
    }
    nonEmptyLines += 1;
    const normalized = normalizeLocalPart(value);
    if (value !== trimmedValue) trimmed.push({ line, value, normalized });
    if (trimmedValue !== normalized) lowercased.push({ line, value, normalized });
    if (!isValidLocalPart(normalized)) {
      rejects.push({
        line,
        value,
        normalized,
        reason: 'Invalid local-part: use lowercase letters, digits, dots, hyphens, underscores (1-64 chars)',
      });
      return;
    }
    const firstLine = firstLines.get(normalized);
    if (firstLine !== undefined) {
      duplicates.push({ normalized, firstLine, duplicateLine: line });
      return;
    }
    firstLines.set(normalized, line);
    values.add(normalized);
  });

  const sortedValues = [...values].sort();
  const lengths = sortedValues.map((value) => value.length);
  const report: ReservedLocalPartsImportReport = {
    sha256,
    physicalLines: lines.length,
    blankLines,
    nonEmptyLines,
    uniqueNormalized: sortedValues.length,
    duplicateOccurrences: duplicates.length,
    lowercaseChanges: lowercased.length,
    trimChanges: trimmed.length,
    rejectedEntries: rejects.length,
    minLength: lengths.length ? Math.min(...lengths) : 0,
    maxLength: lengths.length ? Math.max(...lengths) : 0,
    duplicates,
    lowercased,
    trimmed,
    rejects,
  };

  const failures: string[] = [];
  if (expectedSha256 && sha256 !== expectedSha256) {
    failures.push(`SHA-256 mismatch: expected ${expectedSha256}, received ${sha256}`);
  }
  for (const reject of rejects) {
    failures.push(`line ${reject.line}: ${reject.reason}: ${JSON.stringify(reject.value)}`);
  }
  if (failures.length) throw new ReservedLocalPartsImportError(failures.join('\n'), report);

  return { values: sortedValues, report };
}
