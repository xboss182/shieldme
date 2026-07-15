import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import {
  createRecipient,
  deleteRecipient,
  getRecipient,
  listRecipients,
  resendVerification,
  verifyRecipientToken,
  RecipientError,
} from './recipients.service.js';
import { createRecipientSchema, verifyRecipientSchema } from './recipients.schemas.js';
import { pgpRouter, pgpErrorHandler } from '../pgp/pgp.routes.js';

export const recipientsRouter = Router();

recipientsRouter.use(authenticate);

// POST /api/recipients
recipientsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createRecipientSchema.parse(req.body);
    const result = await createRecipient(req.auth!.userId, input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/recipients
recipientsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await listRecipients(req.auth!.userId);
    res.json({ recipients: list });
  } catch (err) {
    next(err);
  }
});

// GET /api/recipients/:id
recipientsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recipient = await getRecipient(req.auth!.userId, String(req.params.id));
    res.json({ recipient });
  } catch (err) {
    next(err);
  }
});

// POST /api/recipients/:id/verify  { token }
recipientsRouter.post('/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = verifyRecipientSchema.parse(req.body);
    const recipient = await verifyRecipientToken(req.auth!.userId, String(req.params.id), token);
    res.json({ recipient });
  } catch (err) {
    next(err);
  }
});

// POST /api/recipients/:id/resend
recipientsRouter.post('/:id/resend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resendVerification(req.auth!.userId, String(req.params.id));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/recipients/:id
recipientsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteRecipient(req.auth!.userId, String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PGP key sub-routes: /api/recipients/:id/pgp-key
recipientsRouter.use('/:id/pgp-key', pgpRouter);

export function recipientErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof RecipientError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return next(err);
}

// re-export so apiRouter can register it
export { pgpErrorHandler };
