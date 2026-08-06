import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (_req: express.Request, res: express.Response) =>
    res.status(401).json({ error: 'Missing bearer token' }),
}));

vi.mock('./plans.js', () => ({
  getUserPlanSummary: vi.fn().mockResolvedValue({ plan: 'mock' }),
  PLAN_LIMITS: { free: { aliases: 10 } },
  PlanLimitError: class PlanLimitError extends Error {},
}));

import { planErrorHandler, plansRouter } from './plans.routes.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/plans', plansRouter);
  app.use(planErrorHandler);
  return app;
}

describe('/api/plans', () => {
  it('returns tiers publicly without a token', async () => {
    const response = await request(buildApp()).get('/api/plans/tiers');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ plans: { free: { aliases: 10 } } });
  });

  it('keeps /me auth-gated without a token', async () => {
    const response = await request(buildApp()).get('/api/plans/me');
    expect(response.status).toBe(401);
  });
});