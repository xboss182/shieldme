import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import {
  createDomain,
  deleteDomain,
  getDomain,
  listDomains,
  verifyDomain,
  buildDnsRecords,
  DomainError,
} from './domains.service.js';
import { createDomainSchema } from './domains.schemas.js';

export const domainsRouter = Router();

domainsRouter.use(authenticate);

// POST /api/domains
domainsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createDomainSchema.parse(req.body);
    const result = await createDomain(req.auth!.userId, input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/domains
domainsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await listDomains(req.auth!.userId);
    res.json({ domains: list });
  } catch (err) {
    next(err);
  }
});

// GET /api/domains/:id
domainsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const domain = await getDomain(req.auth!.userId, String(req.params.id));
    const dnsRecords = buildDnsRecords(
      domain.domain,
      domain.verificationToken,
      domain.dkimSelector,
      domain.dkimPublicKey,
    );
    res.json({ domain, dnsRecords });
  } catch (err) {
    next(err);
  }
});

// POST /api/domains/:id/verify
domainsRouter.post('/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await verifyDomain(req.auth!.userId, String(req.params.id));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/domains/:id
domainsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteDomain(req.auth!.userId, String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export function domainErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof DomainError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return next(err);
}
