/**
 * Merkle Mountain Range (MMR) implementation.
 * Leaf:   SHA-256(0x00 || canonical_event_bytes)
 * Parent: SHA-256(0x01 || left_hash || right_hash)
 * Root:   SHA-256(0x02 || uint64be(n) || peak1 || peak2 || ...)
 *
 * All hashes are base64url strings in storage; Buffer internally.
 */
import { createHash } from 'node:crypto';

// ── helpers ──────────────────────────────────────────────────────────────────

export function b64uEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

export function b64uDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function sha256(...parts: Buffer[]): Buffer {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
}

const PREFIX_LEAF = Buffer.from([0x00]);
const PREFIX_PARENT = Buffer.from([0x01]);
const PREFIX_ROOT = Buffer.from([0x02]);

// ── leaf hash ─────────────────────────────────────────────────────────────────

export function leafHash(canonicalEventBytes: Buffer): string {
  return b64uEncode(sha256(PREFIX_LEAF, canonicalEventBytes));
}

// ── parent hash ───────────────────────────────────────────────────────────────

export function parentHash(left: string, right: string): string {
  return b64uEncode(sha256(PREFIX_PARENT, b64uDecode(left), b64uDecode(right)));
}

// ── peak positions for tree of size n ────────────────────────────────────────

/**
 * Returns [{start, size}] for each MMR peak left-to-right.
 * The sizes are descending powers of two that sum to n.
 */
export function peaks(n: number): Array<{ start: number; size: number }> {
  const result: Array<{ start: number; size: number }> = [];
  let remaining = n;
  let start = 0;
  // Walk from the highest bit down
  for (let bit = 30; bit >= 0; bit--) {
    const sz = 1 << bit;
    if (remaining >= sz) {
      result.push({ start, size: sz });
      start += sz;
      remaining -= sz;
    }
  }
  return result;
}

// ── bag peaks into root hash ──────────────────────────────────────────────────

export function bagPeaks(treeSize: number, peakHashes: string[]): string {
  const nBuf = Buffer.alloc(8);
  nBuf.writeBigUInt64BE(BigInt(treeSize));
  const parts: Buffer[] = [PREFIX_ROOT, nBuf];
  for (const h of peakHashes) parts.push(b64uDecode(h));
  return b64uEncode(sha256(...parts));
}

// ── canonical event bytes ─────────────────────────────────────────────────────

export interface CanonicalEventFields {
  sequence: number;
  eventId: string;
  eventType: string;
  occurredAt: Date;
  publicPayload: unknown;
}

/** Canonical JSON: sorted keys, no whitespace. */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + (obj as unknown[]).map(canonicalJson).join(',') + ']';
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}

export function canonicalEventBytes(ev: CanonicalEventFields): Buffer {
  const lines = [
    'shieldme-transparency-event-v1',
    `sequence=${ev.sequence}`,
    `event_id=${ev.eventId.toLowerCase()}`,
    `event_type=${ev.eventType}`,
    `occurred_at=${ev.occurredAt.toISOString().replace(/(\.\d{3})?Z$/, '.000Z')}`,
    `payload=${canonicalJson(ev.publicPayload)}`,
    '',
  ].join('\n');
  return Buffer.from(lines, 'utf-8');
}

// ── canonical head bytes ──────────────────────────────────────────────────────

export interface CanonicalHeadFields {
  treeSize: number;
  rootHash: string;
  previousHeadHash: string | null;
  publishedAt: Date;
  keyId: string;
}

export function canonicalHeadBytes(head: CanonicalHeadFields): Buffer {
  const lines = [
    'shieldme-transparency-head-v1',
    `tree_size=${head.treeSize}`,
    `root_hash=${head.rootHash}`,
    `previous_head_hash=${head.previousHeadHash ?? ''}`,
    `published_at=${head.publishedAt.toISOString().replace(/(\.\d{3})?Z$/, '.000Z')}`,
    `key_id=${head.keyId}`,
    '',
  ].join('\n');
  return Buffer.from(lines, 'utf-8');
}

// ── MMR node accumulation (for appending new leaves) ─────────────────────────

/**
 * Given the current set of MMR nodes (as {startSequence, size, hash}[]) and
 * a new leaf hash at position `sequence` (1-based), returns the list of new
 * nodes to insert (the leaf itself plus any merged parents).
 */
export function newNodesForLeaf(
  existingNodes: Array<{ startSequence: number; size: number; hash: string }>,
  sequence: number,
  lHash: string,
): Array<{ startSequence: number; size: number; hash: string }> {
  // Build lookup for quick merge
  const nodeMap = new Map<string, string>();
  for (const n of existingNodes) nodeMap.set(`${n.startSequence}:${n.size}`, n.hash);

  const newNodes: Array<{ startSequence: number; size: number; hash: string }> = [];
  let currentStart = sequence - 1; // 0-based
  let currentSize = 1;
  let currentHash = lHash;

  newNodes.push({ startSequence: currentStart, size: currentSize, hash: currentHash });

  // Merge upward while a sibling of the same size exists immediately before
  while (currentStart > 0) {
    const siblingStart = currentStart - currentSize;
    const siblingKey = `${siblingStart}:${currentSize}`;
    const siblingHash = nodeMap.get(siblingKey);
    if (siblingHash === undefined) break;

    const mergedHash = parentHash(siblingHash, currentHash);
    const mergedStart = siblingStart;
    const mergedSize = currentSize * 2;
    newNodes.push({ startSequence: mergedStart, size: mergedSize, hash: mergedHash });
    nodeMap.set(`${mergedStart}:${mergedSize}`, mergedHash);

    currentStart = mergedStart;
    currentSize = mergedSize;
    currentHash = mergedHash;
  }

  return newNodes;
}

// ── inclusion proof ───────────────────────────────────────────────────────────

export interface InclusionProof {
  sequence: number;
  leafHash: string;
  siblings: Array<{ startSequence: number; size: number; hash: string }>;
  peaks: Array<{ startSequence: number; size: number; hash: string }>;
}

/**
 * Build an inclusion proof for `sequence` (1-based) given all MMR nodes
 * for the given tree size.
 */
export function buildInclusionProof(
  sequence: number,
  treeSize: number,
  allNodes: Array<{ startSequence: number; size: number; hash: string }>,
  lHash: string,
): InclusionProof {
  const nodeMap = new Map<string, string>();
  for (const n of allNodes) nodeMap.set(`${n.startSequence}:${n.size}`, n.hash);

  const siblings: Array<{ startSequence: number; size: number; hash: string }> = [];
  let pos = sequence - 1; // 0-based
  let sz = 1;

  // Walk up until we reach a peak
  while (true) {
    const parentSz = sz * 2;
    // Check if we are a left child (pos % parentSz === 0) or right child
    if (pos % parentSz === 0) {
      // We are a left child; sibling is to our right
      const sibStart = pos + sz;
      const sibKey = `${sibStart}:${sz}`;
      const sibHash = nodeMap.get(sibKey);
      if (sibHash === undefined) break; // no sibling → we're a peak
      siblings.push({ startSequence: sibStart, size: sz, hash: sibHash });
      sz = parentSz;
      // pos stays at left-child start
    } else {
      // We are a right child; sibling is to our left
      const sibStart = pos - sz;
      const sibKey = `${sibStart}:${sz}`;
      const sibHash = nodeMap.get(sibKey);
      if (sibHash === undefined) break;
      siblings.push({ startSequence: sibStart, size: sz, hash: sibHash });
      pos = sibStart;
      sz = parentSz;
    }
    // Check if we've reached a complete subtree that is itself a peak
    const peakList = peaks(treeSize);
    if (peakList.some((p) => p.start === pos && p.size === sz)) break;
  }

  // Collect all peak hashes
  const peakList = peaks(treeSize);
  const peakNodes = peakList.map((p) => ({
    startSequence: p.start,
    size: p.size,
    hash: nodeMap.get(`${p.start}:${p.size}`) ?? '',
  }));

  return { sequence, leafHash: lHash, siblings, peaks: peakNodes };
}
