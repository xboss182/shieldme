import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import {
  createAlias,
  listAliases,
  getAlias,
  enableAlias,
  disableAlias,
  deleteAlias,
  updateAlias,
  AliasError,
  getAliasStats,
  listFailedDeliveries,
  setAliasOutboundRoute,
} from './aliases.service.js';
import { createAliasSchema, updateAliasSchema } from './aliases.schemas.js';
import { outboundRouteSchema } from '../smtp-relays/schemas.js';

export const aliasesRouter = Router();
aliasesRouter.use(authenticate);

// POST /api/aliases
aliasesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createAliasSchema.parse(req.body);
    const result = await createAlias(req.auth!.userId, input);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// GET /api/aliases
aliasesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await listAliases(req.auth!.userId);
    res.json({ aliases: list });
  } catch (err) { next(err); }
});

// GET /api/aliases/stats
aliasesRouter.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getAliasStats(req.auth!.userId);
    res.json(stats);
  } catch (err) { next(err); }
});

// GET /api/aliases/failed-deliveries
aliasesRouter.get('/failed-deliveries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listFailedDeliveries(req.auth!.userId, req.query);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/aliases/:id
aliasesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alias = await getAlias(req.auth!.userId, String(req.params.id));
    res.json({ alias });
  } catch (err) { next(err); }
});

// PATCH /api/aliases/:id
aliasesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateAliasSchema.parse(req.body);
    const alias = await updateAlias(req.auth!.userId, String(req.params.id), input);
    res.json({ alias });
  } catch (err) { next(err); }
});

// PUT /api/aliases/:id/outbound-route
aliasesRouter.put('/:id/outbound-route', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alias = await setAliasOutboundRoute(req.auth!.userId, String(req.params.id), outboundRouteSchema.parse(req.body));
    res.json({ alias });
  } catch (err) { next(err); }
});

// POST /api/aliases/:id/enable
aliasesRouter.post('/:id/enable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alias = await enableAlias(req.auth!.userId, String(req.params.id));
    res.json({ alias });
  } catch (err) { next(err); }
});

// POST /api/aliases/:id/disable
aliasesRouter.post('/:id/disable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alias = await disableAlias(req.auth!.userId, String(req.params.id));
    res.json({ alias });
  } catch (err) { next(err); }
});

// DELETE /api/aliases/:id
aliasesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteAlias(req.auth!.userId, String(req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export function aliasErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof AliasError) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  return next(err);
}
