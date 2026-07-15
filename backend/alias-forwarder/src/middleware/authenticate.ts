import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
      };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string; email: string; role?: string; type: string };

    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid access token' });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub), columns: { isActive: true, role: true } });
    if (!user) return res.status(401).json({ error: 'Invalid access token' });
    if (!user.isActive) return res.status(403).json({ error: 'Account suspended' });
    if (payload.role && payload.role !== user.role) {
      return res.status(401).json({ error: 'Invalid access token' });
    }
    req.auth = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid access token' });
  }
}
