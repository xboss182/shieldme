import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { login, refreshSession, register, AuthError, revokeSession, listSessions } from './auth.service.js';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await register(input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await refreshSession(refreshToken);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/sessions', authenticate, async (req, res, next) => {
  try {
    res.json(await listSessions(req.auth!.userId));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    res.json(await revokeSession(req.auth!.userId));
  } catch (error) {
    next(error);
  }
});

authRouter.delete('/sessions/:id', authenticate, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (id !== 'current') throw new AuthError('Session not found', 404);
    res.json(await revokeSession(req.auth!.userId));
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.auth });
});

export function authErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message ?? 'Invalid request' });
  }
  return next(error);
}
