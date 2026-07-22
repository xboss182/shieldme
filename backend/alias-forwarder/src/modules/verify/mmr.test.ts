import { describe, expect, it } from 'vitest';
import { leafHash, newNodesForLeaf, peaks } from './mmr.js';

describe('MMR append', () => {
  it('merges only aligned sibling subtrees', () => {
    const nodes: Array<{ startSequence: number; size: number; hash: string }> = [];

    for (const sequence of [1, 2, 3]) {
      nodes.push(...newNodesForLeaf(nodes, sequence, leafHash(Buffer.from(String(sequence)))));
    }

    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ startSequence: 0, size: 2 }),
      expect.objectContaining({ startSequence: 2, size: 1 }),
    ]));
    expect(nodes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ startSequence: 1, size: 2 }),
    ]));
    expect(peaks(3)).toEqual([{ start: 0, size: 2 }, { start: 2, size: 1 }]);
  });
});
