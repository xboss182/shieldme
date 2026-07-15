import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { getUserPlanSummary, PLAN_LIMITS, PlanLimitError } from './plans.js';

export const plansRouter = Router();
plansRouter.use(authenticate);

plansRouter.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await getUserPlanSummary(req.auth!.userId)); } catch (err) { next(err); }
});

plansRouter.get('/tiers', (_req, res) => res.json({ plans: PLAN_LIMITS }));

export function planErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof PlanLimitError) return res.status(err.statusCode).json({ error: err.message });
  return next(err);
}
