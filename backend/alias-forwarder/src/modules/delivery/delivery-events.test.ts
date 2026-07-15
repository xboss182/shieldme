import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockMailLogsUpdate,
  mockMailLogsFindFirst,
  mockDeliveryFailureInsert,
  mockAddToSuppressionList,
} = vi.hoisted(() => ({
  mockMailLogsUpdate: vi.fn(),
  mockMailLogsFindFirst: vi.fn(),
  mockDeliveryFailureInsert: vi.fn(),
  mockAddToSuppressionList: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    update: mockMailLogsUpdate,
    insert: mockDeliveryFailureInsert,
    query: {
      mailLogs: { findFirst: mockMailLogsFindFirst },
    },
  },
}));

vi.mock('../abuse/abuse.service.js', () => ({
  addToSuppressionList: mockAddToSuppressionList,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  normalizeResendWebhook,
  normalizeSesWebhook,
  recordDeliveryEvent,
  type NormalizedDeliveryEvent,
} from './delivery-events.service.js';

// ── Helper to build update chain mock ────────────────────────────────────────
function makeUpdateChain() {
  const whereFn = vi.fn().mockResolvedValue([]);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  mockMailLogsUpdate.mockReturnValue({ set: setFn });
  return { setFn, whereFn };
}

function makeInsertChain() {
  const valuesFn = vi.fn().mockResolvedValue([{ id: 'new-failure-id' }]);
  mockDeliveryFailureInsert.mockReturnValue({ values: valuesFn });
  return { valuesFn };
}

beforeEach(() => {
  vi.clearAllMocks();
  makeUpdateChain();
  makeInsertChain();
  mockAddToSuppressionList.mockResolvedValue({ id: 'sup-1' });
  mockMailLogsFindFirst.mockResolvedValue({ aliasId: 'alias-1', envelopeTo: 'hello@example.com' });
});

// ── normalizeResendWebhook ────────────────────────────────────────────────────
describe('normalizeResendWebhook', () => {
  it('returns null when providerMessageId is missing', () => {
    expect(normalizeResendWebhook({ type: 'email.bounced', data: {} })).toBeNull();
  });

  it('normalizes email.delivered to delivered event', () => {
    const event = normalizeResendWebhook({
      type: 'email.delivered',
      data: { email_id: 'msg-1', to: ['user@example.com'] },
    });
    expect(event).toMatchObject({
      provider: 'resend',
      providerMessageId: 'msg-1',
      type: 'delivered',
      recipient: 'user@example.com',
    });
  });

  it('normalizes email.bounced to bounced event with reason', () => {
    const event = normalizeResendWebhook({
      type: 'email.bounced',
      data: { email_id: 'msg-2', to: ['bounce@example.com'], reason: 'mailbox full' },
    });
    expect(event).toMatchObject({
      provider: 'resend',
      providerMessageId: 'msg-2',
      type: 'bounced',
      recipient: 'bounce@example.com',
      failureType: 'bounce',
      reason: 'mailbox full',
    });
  });

  it('normalizes email.bounced with default reason when absent', () => {
    const event = normalizeResendWebhook({
      type: 'email.bounced',
      data: { email_id: 'msg-3', to: ['x@y.com'] },
    });
    expect(event?.reason).toBe('bounced');
  });

  it('normalizes email.complained to complained event', () => {
    const event = normalizeResendWebhook({
      type: 'email.complained',
      data: { email_id: 'msg-4', to: ['angry@example.com'] },
    });
    expect(event).toMatchObject({
      provider: 'resend',
      type: 'complained',
      recipient: 'angry@example.com',
      failureType: 'complaint',
    });
  });

  it('returns null for unknown event type', () => {
    expect(normalizeResendWebhook({ type: 'email.opened', data: { email_id: 'msg-5' } })).toBeNull();
  });

  it('uses data.id as fallback when email_id absent', () => {
    const event = normalizeResendWebhook({
      type: 'email.delivered',
      data: { id: 'fallback-id', to: 'user@example.com' },
    });
    expect(event?.providerMessageId).toBe('fallback-id');
  });

  it('handles string to field (not array)', () => {
    const event = normalizeResendWebhook({
      type: 'email.delivered',
      data: { email_id: 'msg-6', to: 'single@example.com' },
    });
    expect(event?.recipient).toBe('single@example.com');
  });
});

// ── normalizeSesWebhook ───────────────────────────────────────────────────────
describe('normalizeSesWebhook', () => {
  it('returns null when mail.messageId is missing', () => {
    expect(normalizeSesWebhook({ notificationType: 'Bounce', mail: {} })).toBeNull();
  });

  it('normalizes Delivery event', () => {
    const event = normalizeSesWebhook({
      notificationType: 'Delivery',
      mail: { messageId: 'ses-1', destination: ['user@example.com'] },
    });
    expect(event).toMatchObject({
      provider: 'ses',
      providerMessageId: 'ses-1',
      type: 'delivered',
      recipient: 'user@example.com',
    });
  });

  it('normalizes permanent Bounce to bounced event', () => {
    const event = normalizeSesWebhook({
      notificationType: 'Bounce',
      mail: { messageId: 'ses-2' },
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [{ emailAddress: 'bad@example.com', diagnosticCode: '550 No such user' }],
      },
    });
    expect(event).toMatchObject({
      provider: 'ses',
      type: 'bounced',
      recipient: 'bad@example.com',
      failureType: 'bounce',
      reason: '550 No such user',
    });
  });

  it('normalizes transient Bounce to failed event', () => {
    const event = normalizeSesWebhook({
      notificationType: 'Bounce',
      mail: { messageId: 'ses-3' },
      bounce: {
        bounceType: 'Transient',
        bouncedRecipients: [{ emailAddress: 'temp@example.com' }],
      },
    });
    expect(event).toMatchObject({
      provider: 'ses',
      type: 'failed',
      failureType: 'transient',
    });
  });

  it('normalizes Complaint event', () => {
    const event = normalizeSesWebhook({
      notificationType: 'Complaint',
      mail: { messageId: 'ses-4' },
      complaint: { complainedRecipients: [{ emailAddress: 'angry@example.com' }] },
    });
    expect(event).toMatchObject({
      provider: 'ses',
      type: 'complained',
      recipient: 'angry@example.com',
      failureType: 'complaint',
    });
  });

  it('returns null for unknown notificationType', () => {
    expect(normalizeSesWebhook({ notificationType: 'Click', mail: { messageId: 'ses-5' } })).toBeNull();
  });
});

// ── recordDeliveryEvent ───────────────────────────────────────────────────────
describe('recordDeliveryEvent', () => {
  it('updates mail log status to bounced for bounce event', async () => {
    const { setFn } = makeUpdateChain();
    makeInsertChain();

    const event: NormalizedDeliveryEvent = {
      provider: 'resend',
      providerMessageId: 'msg-bounce-1',
      type: 'bounced',
      recipient: 'bounce@example.com',
      failureType: 'bounce',
      reason: 'mailbox full',
    };
    await recordDeliveryEvent(event);

    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({ status: 'bounced' }));
  });

  it('adds bounced recipient to suppression list with reason bounce', async () => {
    makeUpdateChain();
    makeInsertChain();

    await recordDeliveryEvent({
      provider: 'resend',
      providerMessageId: 'msg-b',
      type: 'bounced',
      recipient: 'bad@example.com',
    });

    expect(mockAddToSuppressionList).toHaveBeenCalledWith('bad@example.com', 'bounce');
  });

  it('adds complained recipient to suppression list with reason complaint', async () => {
    makeUpdateChain();
    makeInsertChain();

    await recordDeliveryEvent({
      provider: 'resend',
      providerMessageId: 'msg-c',
      type: 'complained',
      recipient: 'angry@example.com',
    });

    expect(mockAddToSuppressionList).toHaveBeenCalledWith('angry@example.com', 'complaint');
  });

  it('does NOT add to suppression list for delivered event', async () => {
    makeUpdateChain();
    makeInsertChain();

    await recordDeliveryEvent({
      provider: 'resend',
      providerMessageId: 'msg-d',
      type: 'delivered',
      recipient: 'good@example.com',
    });

    expect(mockAddToSuppressionList).not.toHaveBeenCalled();
  });

  it('writes to delivery_failure_log for bounce event — no body material', async () => {
    makeUpdateChain();
    const { valuesFn } = makeInsertChain();

    await recordDeliveryEvent({
      provider: 'resend',
      providerMessageId: 'msg-e',
      type: 'bounced',
      recipient: 'bounce@example.com',
      reason: 'mailbox full',
    });

    expect(mockDeliveryFailureInsert).toHaveBeenCalled();
    const insertedValues = valuesFn.mock.calls[0][0];
    // Verify only metadata — no body fields
    expect(insertedValues).toMatchObject({
      recipient: 'bounce@example.com',
      provider: 'resend',
      providerMessageId: 'msg-e',
      reason: 'bounce',
    });
    expect(insertedValues).not.toHaveProperty('textBody');
    expect(insertedValues).not.toHaveProperty('htmlBody');
    expect(insertedValues).not.toHaveProperty('body');
    expect(insertedValues).not.toHaveProperty('rawMessage');
  });

  it('writes to delivery_failure_log for complaint event — no body material', async () => {
    makeUpdateChain();
    const { valuesFn } = makeInsertChain();

    await recordDeliveryEvent({
      provider: 'ses',
      providerMessageId: 'ses-msg-1',
      type: 'complained',
      recipient: 'angry@example.com',
    });

    const insertedValues = valuesFn.mock.calls[0][0];
    expect(insertedValues).toMatchObject({ reason: 'complaint', provider: 'ses' });
    expect(insertedValues).not.toHaveProperty('textBody');
    expect(insertedValues).not.toHaveProperty('htmlBody');
  });

  it('does NOT write to delivery_failure_log for delivered event', async () => {
    makeUpdateChain();
    makeInsertChain();

    await recordDeliveryEvent({
      provider: 'resend',
      providerMessageId: 'msg-ok',
      type: 'delivered',
      recipient: 'good@example.com',
    });

    expect(mockDeliveryFailureInsert).not.toHaveBeenCalled();
  });

  it('sanitises failure reason — strips newlines, truncates to 500 chars', async () => {
    makeUpdateChain();
    const { valuesFn } = makeInsertChain();
    const longReason = 'A'.repeat(600);

    await recordDeliveryEvent({
      provider: 'resend',
      providerMessageId: 'msg-long',
      type: 'bounced',
      recipient: 'x@y.com',
      reason: 'line1\r\nline2\n' + longReason,
    });

    const insertedValues = valuesFn.mock.calls[0][0];
    expect(insertedValues.failureDetail).not.toContain('\n');
    expect(insertedValues.failureDetail.length).toBeLessThanOrEqual(500);
  });
});
