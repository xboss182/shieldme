/**
 * Public /api/verify routes — unauthenticated transparency endpoints.
 * Rate-limited by dedicated verifyAliasLimiter; no CORS beyond ShieldMe origins.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import {
  lookupAlias,
  getLatestHead,
  getEventProof,
  getPublicLog,
  getKeyInfo,
} from './verify.service.js';

function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  return ipKeyGenerator(cf && typeof cf === 'string' ? cf.trim() : req.ip ?? req.socket.remoteAddress ?? 'unknown');
}

// Dedicated limiter for alias capability verification
const verifyAliasLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: clientIp,
  message: { error: 'Too many verification attempts, please try again later' },
});

// General verify endpoint limiter (for heads, proofs, log)
const verifyGeneralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { error: 'Too many requests, please try again later' },
});

export const verifyRouter = Router();

// Feature flag guard
verifyRouter.use((req, res, next) => {
  if (!env.VERIFY_ENABLED) {
    return res.status(503).json({ error: 'Verification data is temporarily unavailable' });
  }
  next();
});

// POST /api/verify/aliases/lookup
verifyRouter.post('/aliases/lookup', verifyAliasLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      alias: z.string().trim().toLowerCase().email().max(255),
      verificationCode: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid verification request' });
    }

    const { alias, verificationCode } = parsed.data;
    const result = await lookupAlias(alias, verificationCode);
    if (!result) {
      return res.status(404).json({ error: 'Verification record not available' });
    }

    // Check if provider/keys are unverified → 503
    if (result.dkim.keyState === 'unverified' || !result.provider) {
      return res.status(503).json({ error: 'Verification data is temporarily unavailable' });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

async function latestHeadHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const head = await getLatestHead();
    if (!head) {
      return res.status(404).json({ error: 'No transparency head available' });
    }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
    res.setHeader('ETag', `\"${head.rootHash}\"`);
    return res.status(200).json(head);
  } catch (err) {
    next(err);
  }
}

verifyRouter.get('/head', verifyGeneralLimiter, latestHeadHandler);
verifyRouter.get('/heads/latest', verifyGeneralLimiter, latestHeadHandler);

// GET /api/verify/events/:eventId/proof
verifyRouter.get('/events/:eventId/proof', verifyGeneralLimiter, async (req, res, next) => {
  try {
    const eventId = z.string().uuid().safeParse(req.params.eventId);
    if (!eventId.success) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }
    const treeSize = req.query.treeSize ? Number(req.query.treeSize) : undefined;
    const proof = await getEventProof(eventId.data, treeSize);
    if (!proof) {
      return res.status(404).json({ error: 'Event or proof not available' });
    }
    return res.status(200).json(proof);
  } catch (err) {
    next(err);
  }
});

// GET /api/verify/log?after=<sequence>&limit=<1..1000>
verifyRouter.get('/log', verifyGeneralLimiter, async (req, res, next) => {
  try {
    const after = Number(req.query.after ?? 0);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 1000);
    const log = await getPublicLog(after, limit);
    return res.status(200).json(log);
  } catch (err) {
    next(err);
  }
});

// GET /api/verify/keys/:keyId
verifyRouter.get('/keys/:keyId', verifyGeneralLimiter, async (req, res, next) => {
  try {
    const keyId = z.string().min(1).max(50).safeParse(req.params.keyId);
    if (!keyId.success) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }
    const key = await getKeyInfo(keyId.data);
    if (!key) {
      return res.status(404).json({ error: 'Key not found' });
    }
    return res.status(200).json(key);
  } catch (err) {
    next(err);
  }
});

// Error handler
export function verifyErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
}
