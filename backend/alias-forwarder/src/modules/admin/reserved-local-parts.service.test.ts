import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock('../../db/client.js', () => ({
  db: { select: mockSelect },
}));

vi.mock('../../config/env.js', () => ({
  env: { VERIFY_ENABLED: false },
}));

vi.mock('../../queues/email-jobs.js', () => ({
  emailForwardingQueue: { getJobCounts: vi.fn() },
}));

import { listReservedLocalParts } from './admin.service.js';

function rowsQuery(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  return { query: { from }, limit, offset };
}

function countQuery(total: number) {
  const where = vi.fn().mockResolvedValue([{ count: total }]);
  const from = vi.fn().mockReturnValue({ where });
  return { query: { from }, where };
}

beforeEach(() => vi.clearAllMocks());

describe('listReservedLocalParts', () => {
  it('returns search results with total count and bounded page offset', async () => {
    const rows = rowsQuery([{ id: 'rule-1', localPart: 'pay.skrill' }]);
    const total = countQuery(1212);
    mockSelect.mockReturnValueOnce(rows.query).mockReturnValueOnce(total.query);

    const result = await listReservedLocalParts({ search: 'pay.skrill', page: 3, limit: 50 });

    expect(result).toEqual({
      reservedLocalParts: [{ id: 'rule-1', localPart: 'pay.skrill' }],
      page: 3,
      limit: 50,
      total: 1212,
    });
    expect(rows.limit).toHaveBeenCalledWith(50);
    expect(rows.offset).toHaveBeenCalledWith(100);
    expect(total.where).toHaveBeenCalledOnce();
  });

  it('caps an oversized page size at 100', async () => {
    const rows = rowsQuery([]);
    const total = countQuery(0);
    mockSelect.mockReturnValueOnce(rows.query).mockReturnValueOnce(total.query);

    await expect(listReservedLocalParts({ page: 1, limit: 500 })).resolves.toMatchObject({
      page: 1,
      limit: 100,
      total: 0,
    });
    expect(rows.limit).toHaveBeenCalledWith(100);
  });
});
