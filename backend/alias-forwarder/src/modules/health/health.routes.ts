import { Router } from 'express';
import { pool } from '../../db/client.js';
import { redis } from '../../lib/redis.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks = {
    app: 'ok',
    postgres: 'unknown',
    redis: 'unknown',
  } as const;

  let postgres: 'ok' | 'error' = 'ok';
  let redisStatus: 'ok' | 'error' = 'ok';

  try {
    await pool.query('select 1');
  } catch {
    postgres = 'error';
  }

  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      redisStatus = 'error';
    }
  } catch {
    redisStatus = 'error';
  }

  const healthy = postgres === 'ok' && redisStatus === 'ok';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks: {
      app: checks.app,
      postgres,
      redis: redisStatus,
    },
  });
});
