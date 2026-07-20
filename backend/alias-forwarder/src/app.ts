import express from 'express';
import helmet from 'helmet';
import pinoHttpImport from 'pino-http';
const pinoHttp = (pinoHttpImport as unknown as { default?: typeof pinoHttpImport } ).default ?? (pinoHttpImport as any);
import promBundle from 'express-prom-bundle';
import { apiRouter } from './routes/index.js';
import { apiRateLimiter, authRateLimiter } from './middleware/api-rate-limit.js';
import { logger } from './lib/logger.js';
const PROD_ORIGINS = ["https://app.shieldme.cc"];
const DEV_ORIGINS = ['http://localhost:3006', 'http://localhost:5173'];
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production' ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS];
function corsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-secret');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(corsMiddleware);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.shieldme.cc'],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Global API rate limiting
  app.use('/api/auth', authRateLimiter);
  app.use('/api', apiRateLimiter);
  app.use(
    pinoHttp({
      logger,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers[\"x-admin-secret\"]',
          'req.body.password',
          'req.body.username',
          'req.body.refreshToken',
          'req.body.token',
          'req.body.privateKey',
          'req.body.ciphertext',
          'req.body.wrappedDek',
          'req.body.iv',
          'req.body.tag',
        ],
        censor: '[REDACTED]',
      },
    }),
  );
  app.use(
    promBundle({
      includeMethod: true,
      includePath: true,
      promClient: { collectDefaultMetrics: {} },
    }),
  );

  app.get('/', (_req, res) => {
    res.json({ service: 'alias-forwarder', status: 'ok' });
  });

  app.use('/api', apiRouter);

  app.use((error: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Bad JSON body — Express sets status 400 with type 'entity.parse.failed'
    if (error instanceof SyntaxError && (error as Error & { status?: number }).status === 400) {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    // Payload too large — express sets type 'entity.too.large'
    if (error.type === 'entity.too.large' || (error as Error & { status?: number }).status === 413) {
      return res.status(413).json({ error: 'Request payload too large' });
    }
    logger.error({ err: error }, 'Unhandled request error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
