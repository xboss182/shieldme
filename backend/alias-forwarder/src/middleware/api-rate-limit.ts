import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Resolve the real client IP from Cloudflare/Caddy headers.
 * trust proxy=1 gives us req.ip from X-Forwarded-For, but behind Cloudflare
 * the outermost hop is always Cloudflare itself, so cf-connecting-ip is more
 * reliable as the true end-user IP for rate-limiting purposes.
 */
function clientIp(req: Request): string {
  // cf-connecting-ip is set by Cloudflare to the end-user IP
  const cf = req.headers['cf-connecting-ip'];
  if (cf && typeof cf === 'string') return ipKeyGenerator(cf.trim());
  // Use ipKeyGenerator helper for proper IPv6 normalization (required by express-rate-limit v7+)
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  return ipKeyGenerator(ip);
}

/**
 * Global HTTP API rate limiter.
 * Protects auth/CRUD/admin endpoints from brute-force and abuse.
 */

// General API rate limit: 100 requests per 15 minutes per IP
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { error: 'Too many requests, please try again later' },
});

// Auth rate limit: 5 failed attempts per 15 minutes per IP → 429 on 6th attempt.
// skipSuccessfulRequests: true so legitimate logins don't consume quota.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: clientIp,
  message: { error: 'Too many auth attempts, please try again later' },
});
