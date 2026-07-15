import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Webhook } from 'svix';

const { mockAddToSuppressionList } = vi.hoisted(() => ({
  mockAddToSuppressionList: vi.fn(),
}));

vi.mock('../abuse/abuse.service.js', () => ({
  addToSuppressionList: mockAddToSuppressionList,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../config/env.js', () => ({
  env: { RESEND_WEBHOOK_SECRET: 'whsec_dGVzdC1zZWNyZXQ=' },
}));

import * as rc from '../../config/runtime-config.js';
import { webhookRouter } from './webhook.routes.js';


function signedHeaders(payload: unknown) {
  const body = JSON.stringify(payload);
  const date = new Date();
  const wh = new Webhook('whsec_dGVzdC1zZWNyZXQ=');
  return {
    'svix-id': 'msg_test',
    'svix-timestamp': Math.floor(date.getTime() / 1000).toString(),
    'svix-signature': wh.sign('msg_test', date, body),
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhooks', webhookRouter);
  return app;
}

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  vi.clearAllMocks();
  mockAddToSuppressionList.mockResolvedValue({ id: '1' });
  rc.setRuntimeConfig({ resendApiKey: undefined, platformDomain: undefined });
});

describe('POST /webhooks/resend — Resend not configured', () => {
  it('returns 503 when RESEND_API_KEY is absent', async () => {
    const res = await request(buildApp())
      .post('/webhooks/resend')
      .set(signedHeaders({ type: 'email.bounced', data: { to: ['user@example.com'] } }))
      .send({ type: 'email.bounced', data: { to: ['user@example.com'] } });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Resend not configured' });
    expect(mockAddToSuppressionList).not.toHaveBeenCalled();
  });
});

describe('POST /webhooks/resend — Resend configured', () => {
  beforeEach(() => { rc.setRuntimeConfig({ resendApiKey: 're_test' }); });

  it('adds recipient to suppression list with reason bounce', async () => {
    const res = await request(buildApp())
      .post('/webhooks/resend')
      .set(signedHeaders({ type: 'email.bounced', data: { to: ['user@example.com'] } }))
      .send({ type: 'email.bounced', data: { to: ['user@example.com'] } });
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);
    expect(mockAddToSuppressionList).toHaveBeenCalledWith('user@example.com', 'bounce');
  });

  it('handles multiple recipients', async () => {
    const res = await request(buildApp())
      .post('/webhooks/resend')
      .set(signedHeaders({ type: 'email.bounced', data: { to: ['a@b.com', 'c@d.com'] } }))
      .send({ type: 'email.bounced', data: { to: ['a@b.com', 'c@d.com'] } });
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(2);
    expect(mockAddToSuppressionList).toHaveBeenCalledTimes(2);
  });

  it('adds recipient to suppression list with reason complaint', async () => {
    const res = await request(buildApp())
      .post('/webhooks/resend')
      .set(signedHeaders({ type: 'email.complained', data: { to: ['angry@user.com'] } }))
      .send({ type: 'email.complained', data: { to: ['angry@user.com'] } });
    expect(res.status).toBe(200);
    expect(res.body.reason).toBe('complaint');
    expect(mockAddToSuppressionList).toHaveBeenCalledWith('angry@user.com', 'complaint');
  });

  it('returns 200 with processed=0 for unknown event types', async () => {
    const res = await request(buildApp())
      .post('/webhooks/resend')
      .set(signedHeaders({ type: 'email.delivered', data: { to: ['x@y.com'] } }))
      .send({ type: 'email.delivered', data: { to: ['x@y.com'] } });
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(mockAddToSuppressionList).not.toHaveBeenCalled();
  });
});
