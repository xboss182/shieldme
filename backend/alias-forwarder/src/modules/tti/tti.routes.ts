import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { createTtiProbe, listRecentTtiChecks, recordTtiFailure } from './tti.service.js';
import { logger } from '../../lib/logger.js';

export const ttiRouter = Router();

const createProbeSchema = z.object({
  probeToken: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  aliasAddress: z.string().email(),
  provider: z.string().max(100).nullable().optional(),
  syntheticInbox: z.string().email().nullable().optional(),
  sentAt: z.string().datetime().optional(),
});

ttiRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    res.json({ checks: await listRecentTtiChecks(limit) });
  } catch (err) {
    logger.error({ err }, 'Error listing TTI checks');
    res.status(500).json({ error: 'Internal error' });
  }
});

ttiRouter.post('/probes', async (req: Request, res: Response) => {
  try {
    const input = createProbeSchema.parse(req.body);
    const check = await createTtiProbe({
      ...input,
      sentAt: input.sentAt ? new Date(input.sentAt) : undefined,
    });
    res.status(201).json({ check });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    logger.error({ err }, 'Error creating TTI probe');
    res.status(500).json({ error: 'Internal error' });
  }
});

const failureSchema = z.object({ reason: z.string().min(1).max(500) });
ttiRouter.post('/probes/:probeToken/fail', async (req: Request, res: Response) => {
  try {
    const { reason } = failureSchema.parse(req.body);
    const updated = await recordTtiFailure(String(req.params.probeToken), reason);
    res.status(updated ? 200 : 404).json({ updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    logger.error({ err }, 'Error recording TTI failure');
    res.status(500).json({ error: 'Internal error' });
  }
});
