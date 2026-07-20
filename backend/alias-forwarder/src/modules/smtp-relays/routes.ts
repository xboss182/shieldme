import { Router } from 'express';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import {
  confirmSmtpRelayTest,
  createSmtpRelay,
  deleteSmtpRelay,
  disableSmtpRelay,
  enableSmtpRelay,
  getSmtpRelay,
  listSmtpRelayAuditEvents,
  listSmtpRelays,
  revokeSmtpRelay,
  rotateSmtpRelayCredentials,
  SmtpRelayError,
  testSmtpRelay,
  updateSmtpRelay,
} from './service.js';
import {
  confirmSmtpRelayTestSchema,
  createSmtpRelaySchema,
  recipientIdSchema,
  rotateSmtpRelayCredentialsSchema,
  updateSmtpRelaySchema,
} from './schemas.js';

export const smtpRelaysRouter = Router();
smtpRelaysRouter.use(authenticate);

smtpRelaysRouter.get('/', async (req, res, next) => {
  try { res.json({ relays: await listSmtpRelays(req.auth!.userId) }); } catch (error) { next(error); }
});
smtpRelaysRouter.post('/', async (req, res, next) => {
  try { res.status(201).json({ relay: await createSmtpRelay(req.auth!.userId, createSmtpRelaySchema.parse(req.body)) }); } catch (error) { next(error); }
});
smtpRelaysRouter.get('/:relayId', async (req, res, next) => {
  try { res.json({ relay: await getSmtpRelay(req.auth!.userId, String(req.params.relayId)) }); } catch (error) { next(error); }
});
smtpRelaysRouter.get('/:relayId/audit-events', async (req, res, next) => {
  try { res.json({ events: await listSmtpRelayAuditEvents(req.auth!.userId, String(req.params.relayId)) }); } catch (error) { next(error); }
});
smtpRelaysRouter.patch('/:relayId', async (req, res, next) => {
  try { res.json({ relay: await updateSmtpRelay(req.auth!.userId, String(req.params.relayId), updateSmtpRelaySchema.parse(req.body).label) }); } catch (error) { next(error); }
});
smtpRelaysRouter.post('/:relayId/test', async (req, res, next) => {
  try { res.json({ test: await testSmtpRelay(req.auth!.userId, String(req.params.relayId), recipientIdSchema.parse(req.body).recipientId) }); } catch (error) { next(error); }
});
smtpRelaysRouter.post('/:relayId/tests/:testId/confirm', async (req, res, next) => {
  try { res.json({ relay: await confirmSmtpRelayTest(req.auth!.userId, String(req.params.relayId), String(req.params.testId), confirmSmtpRelayTestSchema.parse(req.body).token) }); } catch (error) { next(error); }
});
smtpRelaysRouter.post('/:relayId/rotate-credentials', async (req, res, next) => {
  try { res.json({ test: await rotateSmtpRelayCredentials(req.auth!.userId, String(req.params.relayId), rotateSmtpRelayCredentialsSchema.parse(req.body)) }); } catch (error) { next(error); }
});
smtpRelaysRouter.post('/:relayId/enable', async (req, res, next) => {
  try { res.json({ relay: await enableSmtpRelay(req.auth!.userId, String(req.params.relayId)) }); } catch (error) { next(error); }
});
smtpRelaysRouter.post('/:relayId/disable', async (req, res, next) => {
  try { res.json({ relay: await disableSmtpRelay(req.auth!.userId, String(req.params.relayId)) }); } catch (error) { next(error); }
});
smtpRelaysRouter.post('/:relayId/revoke', async (req, res, next) => {
  try { res.json({ relay: await revokeSmtpRelay(req.auth!.userId, String(req.params.relayId)) }); } catch (error) { next(error); }
});
smtpRelaysRouter.delete('/:relayId', async (req, res, next) => {
  try { await deleteSmtpRelay(req.auth!.userId, String(req.params.relayId)); res.status(204).send(); } catch (error) { next(error); }
});

export function smtpRelayErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof SmtpRelayError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message ?? 'Invalid request' });
  return next(error);
}
