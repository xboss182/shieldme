import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockDisableUser, mockEnableUser, mockDisableDomain, mockEnableDomain,
        mockDisableAlias, mockEnableAlias,
        mockAddSenderBlock, mockRemoveSenderBlock, mockListSenderBlocks,
        mockAddToSuppressionList, mockRemoveFromSuppressionList, mockListSuppressions,
} = vi.hoisted(() => ({
  mockDisableUser: vi.fn(), mockEnableUser: vi.fn(),
  mockDisableDomain: vi.fn(), mockEnableDomain: vi.fn(),
  mockDisableAlias: vi.fn(), mockEnableAlias: vi.fn(),
  mockAddSenderBlock: vi.fn(), mockRemoveSenderBlock: vi.fn(), mockListSenderBlocks: vi.fn(),
  mockAddToSuppressionList: vi.fn(), mockRemoveFromSuppressionList: vi.fn(), mockListSuppressions: vi.fn(),
}));

vi.mock('./admin.service.js', () => ({
  adminDisableUser: mockDisableUser, adminEnableUser: mockEnableUser,
  adminDisableDomain: mockDisableDomain, adminEnableDomain: mockEnableDomain,
  adminDisableAlias: mockDisableAlias, adminEnableAlias: mockEnableAlias,
  AdminError: class AdminError extends Error {
    constructor(msg: string, public statusCode = 400) { super(msg); }
  },
}));

vi.mock('../abuse/abuse.service.js', () => ({
  addSenderBlock: mockAddSenderBlock,
  removeSenderBlock: mockRemoveSenderBlock,
  listSenderBlocks: mockListSenderBlocks,
  addToSuppressionList: mockAddToSuppressionList,
  removeFromSuppressionList: mockRemoveFromSuppressionList,
  listSuppressions: mockListSuppressions,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../config/env.js', () => ({
  env: { ADMIN_SECRET: 'test-admin-secret-32chars!!!!!!!' },
}));

// Reset runtime config between tests
import * as runtimeConfig from '../../config/runtime-config.js';
import { adminRouter, adminErrorHandler } from './admin.routes.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(adminErrorHandler as any);
  return app;
}

const AUTH = { Authorization: 'Bearer test-admin-secret-32chars!!!!!!!' };

beforeEach(() => {
  vi.clearAllMocks();
  // Reset runtime config to empty state before each test
  runtimeConfig.setRuntimeConfig({ resendApiKey: undefined, platformDomain: undefined });
});

describe('GET /admin/config', () => {
  it('returns configured:false when neither key is set', async () => {
    const res = await request(buildApp()).get('/admin/config').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      domain: { configured: false },
      resend: { configured: false },
      platformDomain: null,
      resendConfigured: false,
    });
  });

  it('returns configured:true after setting resendApiKey', async () => {
    runtimeConfig.setRuntimeConfig({ resendApiKey: 're_test_key' });
    const res = await request(buildApp()).get('/admin/config').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.resend.configured).toBe(true);
    expect(res.body.domain.configured).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/admin/config');
    expect(res.status).toBe(401);
  });
});

describe('POST /admin/config', () => {
  it('sets resendApiKey and reflects in GET', async () => {
    const app = buildApp();
    const post = await request(app)
      .post('/admin/config')
      .set(AUTH)
      .send({ resendApiKey: 're_new_key' });
    expect(post.status).toBe(200);
    expect(post.body.resend.configured).toBe(true);

    const get = await request(app).get('/admin/config').set(AUTH);
    expect(get.body.resend.configured).toBe(true);
  });

  it('sets platformDomain and reflects in GET', async () => {
    const app = buildApp();
    const post = await request(app)
      .post('/admin/config')
      .set(AUTH)
      .send({ platformDomain: 'mail.example.com' });
    expect(post.status).toBe(200);
    expect(post.body.domain.configured).toBe(true);
  });

  it('sets both keys at once', async () => {
    const app = buildApp();
    const post = await request(app)
      .post('/admin/config')
      .set(AUTH)
      .send({ resendApiKey: 're_key', platformDomain: 'mail.example.com' });
    expect(post.status).toBe(200);
    expect(post.body.resend.configured).toBe(true);
    expect(post.body.domain.configured).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).post('/admin/config').send({ resendApiKey: 'x' });
    expect(res.status).toBe(401);
  });
});
