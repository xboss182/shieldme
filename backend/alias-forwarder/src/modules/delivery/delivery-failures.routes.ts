import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import {
  listAliasDeliveryFailures,
  getAliasFailureIndicators,
  listSuppressedAddresses,
} from './delivery-failures.service.js';
import { logger } from '../../lib/logger.js';

export const deliveryFailuresRouter = Router();

/**
 * GET /api/delivery-failures/indicators
 * Per-alias failure badge data for the authenticated user.
 * Returns each alias with hasFailure + latestFailure metadata — no body.
 */
deliveryFailuresRouter.get('/indicators', authenticate, async (req: Request, res: Response) => {
  try {
    const indicators = await getAliasFailureIndicators(req.auth!.userId);
    return res.json({ indicators });
  } catch (err) {
    logger.error({ err }, 'Error fetching alias failure indicators');
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/delivery-failures/aliases/:aliasId
 * Per-alias delivery failure history for the authenticated user (no body).
 */
deliveryFailuresRouter.get('/aliases/:aliasId', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const result = await listAliasDeliveryFailures(String(req.params.aliasId), req.auth!.userId, { limit, offset });
    return res.json(result);
  } catch (err: any) {
    if (err.message === 'Alias not found') {
      return res.status(404).json({ error: 'Alias not found' });
    }
    logger.error({ err }, 'Error fetching alias delivery failures');
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/delivery-failures/suppressed
 * List suppressed addresses visible to the authenticated user.
 */
deliveryFailuresRouter.get('/suppressed', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const result = await listSuppressedAddresses({ limit, offset });
    return res.json(result);
  } catch (err) {
    logger.error({ err }, 'Error fetching suppressed addresses');
    return res.status(500).json({ error: 'Internal error' });
  }
});
