import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/** Generate a cryptographically random hex token of `bytes` length. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Hash a token for safe storage (bcrypt). */
export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, env.BCRYPT_SALT_ROUNDS);
}

/** Verify a raw token against its bcrypt hash. */
export async function verifyToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}
