import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authRateLimiter } from './api-rate-limit.js';

describe('authRateLimiter', () => {
  it('does not limit successful requests when skipSuccessfulRequests is true', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/auth', authRateLimiter);
    app.post('/api/auth/login', (_req, res) => {
      res.status(200).json({ success: true });
    });

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login');
      expect(res.status).toBe(200);
    }
  });

  it('limits failed requests after max threshold', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/auth', authRateLimiter);
    app.post('/api/auth/login', (_req, res) => {
      res.status(401).json({ error: 'Invalid credentials' });
    });

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login');
      expect(res.status).toBe(401);
    }

    const blockedRes = await request(app).post('/api/auth/login');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body).toEqual({ error: 'Too many auth attempts, please try again later' });
  });

  it('uses cf-connecting-ip header when present', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/auth', authRateLimiter);
    app.post('/api/auth/login', (_req, res) => {
      res.status(401).json({ error: 'Invalid credentials' });
    });

    // 5 failures from IP A
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').set('cf-connecting-ip', '1.1.1.1');
    }

    // IP A blocked
    const resA = await request(app).post('/api/auth/login').set('cf-connecting-ip', '1.1.1.1');
    expect(resA.status).toBe(429);

    // IP B allowed
    const resB = await request(app).post('/api/auth/login').set('cf-connecting-ip', '2.2.2.2');
    expect(resB.status).toBe(401);
  });
});
