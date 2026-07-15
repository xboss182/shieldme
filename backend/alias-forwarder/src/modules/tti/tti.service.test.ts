import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert, mockUpdate, mockSelect, mockFindFirst } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
    query: { ttiChecks: { findFirst: mockFindFirst } },
  },
}));

import { computeLatencyMs, createTtiProbe, recordTtiForwarded, sanitizeTtiFailureReason } from './tti.service.js';

function insertChain(row: unknown) {
  const returning = vi.fn().mockResolvedValue([row]);
  const values = vi.fn().mockReturnValue({ returning });
  mockInsert.mockReturnValue({ values });
  return { values, returning };
}

function updateChain() {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn().mockReturnValue({ where });
  mockUpdate.mockReturnValue({ set });
  return { set, where };
}

describe('TTI service', () => {
  beforeEach(() => vi.resetAllMocks());

  it('computes non-negative forwarding latency', () => {
    expect(computeLatencyMs(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:02Z'))).toBe(2000);
    expect(computeLatencyMs(new Date('2026-01-01T00:00:02Z'), new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });

  it('sanitizes failure reasons as short metadata only', () => {
    expect(sanitizeTtiFailureReason('line1\nline2')).toBe('line1 line2');
    expect(sanitizeTtiFailureReason('x'.repeat(600))).toHaveLength(500);
  });

  it('creates metadata-only probe rows', async () => {
    const row = { id: 'tti-1' };
    const { values } = insertChain(row);
    await expect(createTtiProbe({ probeToken: 'probe_123456', aliasAddress: 'tti@shieldme.cc', syntheticInbox: 'ops@example.com' })).resolves.toBe(row);

    const persisted = values.mock.calls[0][0];
    expect(persisted).toEqual(expect.objectContaining({
      probeToken: 'probe_123456',
      aliasAddress: 'tti@shieldme.cc',
      syntheticInbox: 'ops@example.com',
      status: 'pending',
    }));
    expect(Object.keys(persisted).join(' ')).not.toMatch(/body|html|text|attachment|raw|subject/i);
  });

  it('marks pending probe forwarded with latency metadata', async () => {
    mockFindFirst.mockResolvedValue({ id: 'tti-1', status: 'pending', sentAt: new Date('2026-01-01T00:00:00Z'), provider: null, providerMessageId: null });
    const { set } = updateChain();

    await expect(recordTtiForwarded({ probeToken: 'probe_123456', providerMessageId: 'out-1', provider: 'resend', receivedAt: new Date('2026-01-01T00:00:03Z') })).resolves.toBe(true);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: 'forwarded',
      providerMessageId: 'out-1',
      provider: 'resend',
      latencyMs: 3000,
    }));
    expect(JSON.stringify(set.mock.calls[0][0])).not.toMatch(/Hello|<p>|body|html|attachment|raw/i);
  });
});
