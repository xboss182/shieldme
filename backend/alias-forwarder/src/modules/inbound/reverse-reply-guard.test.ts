import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RELAY_HOP_HEADER,
  buildRelayHopHeaderValue,
  parseRelayHop,
  detectReverseReplyLoop,
  nextRelayHop,
  enforceReverseReplyRateLimit,
} from './reverse-reply-guard.js';

const { mockIncr, mockExpire } = vi.hoisted(() => ({
  mockIncr: vi.fn(),
  mockExpire: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({
  redis: {
    incr: mockIncr,
    expire: mockExpire,
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    REVERSE_REPLY_MAX_HOPS: 1,
    REVERSE_REPLY_MAX_PER_ALIAS_PER_DAY: 50,
    REVERSE_REPLY_MAX_PER_RECIPIENT_PER_DAY: 50,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RELAY_HOP_HEADER helpers', () => {
  it('builds a standard hop header value', () => {
    expect(buildRelayHopHeaderValue(1)).toBe('hop=1; by=shieldme.cc');
    expect(buildRelayHopHeaderValue(2)).toBe('hop=2; by=shieldme.cc');
  });

  it('parses valid hop values from header string', () => {
    expect(parseRelayHop('hop=1; by=shieldme.cc')).toBe(1);
    expect(parseRelayHop('HOP=3')).toBe(3);
    expect(parseRelayHop(undefined)).toBeNull();
    expect(parseRelayHop('invalid')).toBeNull();
  });

  it('calculates the next hop count correctly', () => {
    expect(nextRelayHop(undefined)).toBe(1);
    expect(nextRelayHop({ [RELAY_HOP_HEADER]: 'hop=1; by=shieldme.cc' })).toBe(2);
  });
});

describe('detectReverseReplyLoop', () => {
  it('returns null for a clean, non-loop message', () => {
    expect(detectReverseReplyLoop({})).toBeNull();
  });

  it('detects Auto-Submitted header loop', () => {
    expect(detectReverseReplyLoop({ 'Auto-Submitted': 'auto-generated' })).toBe('auto_reply_loop');
  });

  it('detects bulk precedence loop', () => {
    expect(detectReverseReplyLoop({ Precedence: 'bulk' })).toBe('bulk_precedence');
  });

  it('detects relay marker loop when hop count >= max hops', () => {
    const headers = { [RELAY_HOP_HEADER]: 'hop=1; by=shieldme.cc' };
    expect(detectReverseReplyLoop(headers)).toBe('relay_marker_loop');
  });
});

describe('enforceReverseReplyRateLimit', () => {
  it('returns null when under daily caps', async () => {
    mockIncr.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const drop = await enforceReverseReplyRateLimit('alias-1', 'recipient@domain.com');
    expect(drop).toBeNull();
  });

  it('sets 48h expiration on new rate limit keys', async () => {
    mockIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await enforceReverseReplyRateLimit('alias-1', 'recipient@domain.com');
    expect(mockExpire).toHaveBeenCalledTimes(2);
    expect(mockExpire).toHaveBeenCalledWith(expect.stringContaining('rr:alias:alias-1'), 172800);
  });

  it('returns alias_rate_limited when alias daily cap is exceeded', async () => {
    mockIncr.mockResolvedValueOnce(51).mockResolvedValueOnce(5);
    const drop = await enforceReverseReplyRateLimit('alias-1', 'recipient@domain.com');
    expect(drop).toBe('alias_rate_limited');
  });

  it('returns recipient_rate_limited when per-recipient cap is exceeded', async () => {
    mockIncr.mockResolvedValueOnce(10).mockResolvedValueOnce(51);
    const drop = await enforceReverseReplyRateLimit('alias-1', 'recipient@domain.com');
    expect(drop).toBe('recipient_rate_limited');
  });
});
