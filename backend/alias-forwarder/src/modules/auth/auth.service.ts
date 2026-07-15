import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { eq, sql } from 'drizzle-orm';
import { logSecurityEvent } from '../security/security-events.js';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { redis } from '../../lib/redis.js';
import { users } from '../../db/schema.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

export class AuthError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

function signAccessToken(userId: string, email: string, role: string = 'user') {
  return jwt.sign({ sub: userId, email, role, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });
}

function signRefreshToken(userId: string, email: string, role: string = 'user') {
  return jwt.sign({ sub: userId, email, role, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'],
  });
}

async function hashValue(value: string) {
  return bcrypt.hash(value, env.BCRYPT_SALT_ROUNDS);
}

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function isLocked(user: { lockedUntil: Date | null }) {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

async function revokeRefreshToken(userId: string) {
  await db.update(users).set({ refreshTokenHash: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function register(input: RegisterInput) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email.toLowerCase()),
  });

  if (existing) {
    throw new AuthError('Email already registered', 409);
  }

  const passwordHash = await hashValue(input.password);
  const [user] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      passwordHash,
    })
    .returning({ id: users.id, email: users.email, role: users.role, plan: users.plan });

  const accessToken = signAccessToken(user.id, user.email, user.role);
  const refreshToken = signRefreshToken(user.id, user.email, user.role);
  const refreshTokenHash = await hashValue(refreshToken);

  await db.update(users).set({ refreshTokenHash, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  await logSecurityEvent({ action: 'auth.login_success', targetType: 'user', targetId: user.id, actorType: 'user', actorId: user.id, metadata: { email: user.email } });

  return {
    user: { id: user.id, email: user.email, role: user.role, plan: user.plan ?? 'free' },
    accessToken,
    refreshToken,
  };
}

export async function login(input: LoginInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email.toLowerCase()),
  });

  if (!user) {
    await logSecurityEvent({ action: 'auth.login_failed', severity: 'warn', metadata: { email: input.email.toLowerCase(), reason: 'unknown_user' } });
    throw new AuthError('Invalid credentials', 401);
  }
  if (!user.isActive) {
    throw new AuthError('Account suspended', 403);
  }

  if (isLocked(user)) {
    await logSecurityEvent({ action: 'auth.account_locked_login_blocked', targetType: 'user', targetId: user.id, actorType: 'user', actorId: user.id, severity: 'critical', metadata: { email: user.email, lockedUntil: user.lockedUntil?.toISOString() } });
    throw new AuthError('Account locked. Try again later.', 423);
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    const failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil = failedLoginAttempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await db.update(users).set({ failedLoginAttempts, lockedUntil, updatedAt: new Date() }).where(eq(users.id, user.id));
    await logSecurityEvent({ action: lockedUntil ? 'auth.account_locked' : 'auth.login_failed', targetType: 'user', targetId: user.id, actorType: 'user', actorId: user.id, severity: lockedUntil ? 'critical' : 'warn', metadata: { email: user.email, failedLoginAttempts, lockedUntil: lockedUntil?.toISOString() } });
    throw new AuthError('Invalid credentials', 401);
  }

  const accessToken = signAccessToken(user.id, user.email, user.role);
  const refreshToken = signRefreshToken(user.id, user.email, user.role);
  const refreshTokenHash = await hashValue(refreshToken);

  await db.update(users).set({ refreshTokenHash, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

  return {
    user: { id: user.id, email: user.email, role: user.role, plan: user.plan ?? 'free' },
    accessToken,
    refreshToken,
  };
}

export async function refreshSession(refreshToken: string) {
  const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string; email: string; type: string; jti?: string };

  if (payload.type !== 'refresh') {
    throw new AuthError('Invalid refresh token', 401);
  }

  // Single-use enforcement via Redis distributed lock + used-token blocklist.
  // Key strategy:
  //   lock key   = refresh:lock:<userId>      — only one rotation per user at a time
  //   used key   = refresh:used:<tokenSuffix> — marks this specific token as consumed
  // The used-token key has a TTL matching the refresh token TTL so it self-cleans.
  const userId = payload.sub;
  const tokenSuffix = refreshToken.slice(-32); // last 32 chars are unique enough as a key
  const usedKey = `refresh:used:${tokenSuffix}`;
  const lockKey = `refresh:lock:${userId}`;
  const lockTtlMs = 10000; // 10 s max for bcrypt + DB write

  // Check if this token was already used
  const alreadyUsed = await redis.get(usedKey);
  if (alreadyUsed) {
    await logSecurityEvent({ action: 'auth.refresh_token_reuse_detected', targetType: 'user', targetId: userId, actorType: 'user', actorId: userId, severity: 'critical', metadata: {} });
    throw new AuthError('Invalid refresh token', 401);
  }

  // Acquire per-user lock (SET NX PX) to prevent concurrent rotations
  const lockVal = `${Date.now()}`;
  const acquired = await redis.set(lockKey, lockVal, 'PX', lockTtlMs, 'NX');
  if (!acquired) {
    throw new AuthError('Invalid refresh token', 401);
  }

  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

    if (!user?.refreshTokenHash) {
      throw new AuthError('Refresh session not found', 401);
    }
    if (!user.isActive) {
      throw new AuthError('Account suspended', 403);
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      await db.update(users).set({ refreshTokenHash: null, updatedAt: new Date() }).where(eq(users.id, user.id));
      await logSecurityEvent({ action: 'auth.refresh_token_reuse_detected', targetType: 'user', targetId: user.id, actorType: 'user', actorId: user.id, severity: 'critical', metadata: { email: user.email } });
      throw new AuthError('Invalid refresh token', 401);
    }

    // Mark this token as used in Redis (TTL = refresh token lifetime)
    const refreshTtlSec = (() => {
      const ttl = env.JWT_REFRESH_TTL as string;
      const m = ttl.match(/^(\d+)([dhms])$/);
      if (!m) return 7 * 24 * 3600;
      const n = parseInt(m[1], 10);
      return m[2] === 'd' ? n*86400 : m[2] === 'h' ? n*3600 : m[2] === 'm' ? n*60 : n;
    })();
    await redis.set(usedKey, '1', 'EX', refreshTtlSec);

    // Clear DB hash and issue new pair
    await db.update(users).set({ refreshTokenHash: null, updatedAt: new Date() }).where(eq(users.id, user.id));

    const nextAccessToken = signAccessToken(user.id, user.email, user.role);
    const nextRefreshToken = signRefreshToken(user.id, user.email, user.role);
    const nextRefreshTokenHash = await hashValue(nextRefreshToken);

    await db.update(users).set({ refreshTokenHash: nextRefreshTokenHash, updatedAt: new Date() }).where(eq(users.id, user.id));

    return {
      user: { id: user.id, email: user.email, role: user.role, plan: user.plan ?? 'free' },
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    };
  } finally {
    // Release lock only if we still own it
    const current = await redis.get(lockKey);
    if (current === lockVal) await redis.del(lockKey);
  }
}

export async function revokeSession(userId: string) {
  await revokeRefreshToken(userId);
  await logSecurityEvent({ action: 'auth.session_revoked', targetType: 'user', targetId: userId, actorType: 'user', actorId: userId });
  return { revoked: true };
}

export async function listSessions(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, email: true, refreshTokenHash: true, lastLoginAt: true, updatedAt: true } });
  if (!user) throw new AuthError('User not found', 404);
  return { sessions: user.refreshTokenHash ? [{ id: 'current', email: user.email, lastLoginAt: user.lastLoginAt, updatedAt: user.updatedAt }] : [] };
}
