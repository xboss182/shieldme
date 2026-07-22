import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockGetLatestHead, mockLookupAlias } = vi.hoisted(() => ({
  mockGetLatestHead: vi.fn(),
  mockLookupAlias: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({
  env: { VERIFY_ENABLED: true },
}));

vi.mock('./verify.service.js', () => ({
  getEventProof: vi.fn(),
  getKeyInfo: vi.fn(),
  getLatestHead: mockGetLatestHead,
  getPublicLog: vi.fn(),
  lookupAlias: mockLookupAlias,
}));

import { verifyErrorHandler, verifyRouter } from './verify.routes.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/verify', verifyRouter);
  app.use(verifyErrorHandler);
  return app;
}

describe('/api/verify', () => {
  it('exposes the release-contract head endpoint', async () => {
    mockGetLatestHead.mockResolvedValue({
      treeSize: 1,
      rootHash: 'root',
      previousHeadHash: null,
      keyId: 'test-v1',
      signature: 'signature',
      publishedAt: '2026-07-22T00:00:00.000Z',
      signingKey: { keyId: 'test-v1', publicKey: 'key', publicKeySha256: 'fingerprint' },
    });

    const response = await request(buildApp()).get('/api/verify/head');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ rootHash: 'root', signature: 'signature' });
    expect(response.headers.etag).toBe('"root"');
  });

  it('returns a known alias only after a valid capability resolves', async () => {
    mockLookupAlias.mockResolvedValue({
      alias: { status: 'active', createdAt: '2026-07-22T00:00:00.000Z' },
      domain: { name: 'example.com', status: 'verified' },
      dkim: { keyState: 'active', current: null, history: [] },
      expectedDns: [],
      provider: { id: 'mailbaby', profileSha256: 'profile', customerSpfValue: 'v=spf1 -all' },
      transparency: { latestHead: null, eventIds: [] },
    });

    const response = await request(buildApp())
      .post('/api/verify/aliases/lookup')
      .send({ alias: 'known@example.com', verificationCode: 'valid-code' });

    expect(response.status).toBe(200);
    expect(response.body.alias.status).toBe('active');
  });

  it('fails unknown capabilities closed with the shared verification response', async () => {
    mockLookupAlias.mockResolvedValue(null);

    const response = await request(buildApp())
      .post('/api/verify/aliases/lookup')
      .send({ alias: 'known@example.com', verificationCode: 'wrong-code' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Verification record not available' });
  });
});
