import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/env.js', () => ({
  env: { VERIFY_ENABLED: false },
}));

vi.mock('./verify.service.js', () => ({
  getEventProof: vi.fn(),
  getKeyInfo: vi.fn(),
  getLatestHead: vi.fn(),
  getPublicLog: vi.fn(),
  lookupAlias: vi.fn(),
}));

import { verifyErrorHandler, verifyRouter } from './verify.routes.js';

describe('/api/verify when disabled', () => {
  it('darkens every public verification endpoint', async () => {
    const app = express();
    app.use('/api/verify', verifyRouter);
    app.use(verifyErrorHandler);

    const response = await request(app).get('/api/verify/head');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Verification data is temporarily unavailable' });
  });
});
