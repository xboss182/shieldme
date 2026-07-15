import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { upsertPgpKey, getPgpKey, deletePgpKey, testEncryptedDelivery, PgpError } from '../pgp/pgp.service.js';

export const pgpRouter = Router({ mergeParams: true });
pgpRouter.use(authenticate);

const uploadSchema = z.object({
  publicKeyArmored: z.string().min(1, 'publicKeyArmored is required'),
});

// POST /api/recipients/:id/pgp-key
pgpRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { publicKeyArmored } = uploadSchema.parse(req.body);
    const row = await upsertPgpKey(req.auth!.userId, String(req.params.id), publicKeyArmored);
    res.status(201).json({ pgpKey: row });
  } catch (err) {
    next(err);
  }
});

// GET /api/recipients/:id/pgp-key
pgpRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const full = req.query.full === 'true';
    const key = await getPgpKey(req.auth!.userId, String(req.params.id), full);
    if (!key) return res.status(404).json({ error: 'No PGP key configured for this recipient' });
    res.json({ pgpKey: key });
  } catch (err) {
    next(err);
  }
});

// POST /api/recipients/:id/pgp-key/test
pgpRouter.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await testEncryptedDelivery(req.auth!.userId, String(req.params.id));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/recipients/:id/pgp-key
pgpRouter.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deletePgpKey(req.auth!.userId, String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export function pgpErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof PgpError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return next(err);
}
