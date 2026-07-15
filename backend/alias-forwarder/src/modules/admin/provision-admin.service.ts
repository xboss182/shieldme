import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { register } from '../auth/auth.service.js';
import { writeAuditLog } from './admin.service.js';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'crypto';

export function isDisposableEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  // 1. Ends with one of the allowed disposable domains:
  const allowedDomains = ['@example.com', '@shieldme.qa', '@disposable.shieldme.local'];
  const hasAllowedDomain = allowedDomains.some(domain => normalized.endsWith(domain));

  // 2. Starts with qa-, test-, or disposable-
  const hasAllowedPrefix = normalized.startsWith('qa-') || normalized.startsWith('test-') || normalized.startsWith('disposable-');

  return hasAllowedDomain && hasAllowedPrefix;
}

export function generateSecurePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums = '0123456789';
  const syms = '!@#$%^&*()_+';
  let pass = '';

  const getRandomChar = (str: string) => {
    const idx = crypto.randomInt(0, str.length);
    return str[idx];
  };

  pass += getRandomChar(chars);
  pass += getRandomChar(uppers);
  pass += getRandomChar(nums);
  pass += getRandomChar(syms);
  const all = chars + uppers + nums + syms;
  for (let i = 0; i < 12; i++) {
    pass += getRandomChar(all);
  }
  return pass;
}

export async function runProvisioning(command: string, options: { email?: string; password?: string; confirm: boolean; all?: boolean }) {
  if (!['promote', 'demote', 'cleanup'].includes(command)) {
    throw new Error(`Unknown command "${command}"`);
  }

  if (!options.confirm) {
    throw new Error('Action must be run with the --confirm flag.');
  }

  if (command === 'cleanup' && options.all) {
    const allUsers = await db.select().from(users);
    const disposableUsers = allUsers.filter(u => isDisposableEmail(u.email));

    if (disposableUsers.length === 0) {
      return { count: 0, deleted: [] };
    }

    const ids = disposableUsers.map(u => u.id);
    await db.delete(users).where(inArray(users.id, ids));

    for (const u of disposableUsers) {
      await writeAuditLog(
        'admin.cleaned_up',
        'user',
        u.id,
        { email: u.email, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() },
        { type: 'system', id: 'cli-operator' }
      );
    }
    return { count: disposableUsers.length, deleted: disposableUsers.map(u => u.email) };
  }

  const email = options.email;
  if (!email) {
    throw new Error('--email <email> is required');
  }

  if (!isDisposableEmail(email)) {
    throw new Error(`Target email "${email}" is not disposable/QA-safe.`);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail)
  });

  if (command === 'promote') {
    if (existingUser) {
      if (existingUser.role === 'admin') {
        return { status: 'already_admin', email: normalizedEmail, userId: existingUser.id };
      }
      await db.update(users).set({ role: 'admin', updatedAt: new Date() }).where(eq(users.id, existingUser.id));
      await writeAuditLog(
        'admin.provisioned',
        'user',
        existingUser.id,
        { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() },
        { type: 'system', id: 'cli-operator' }
      );
      return { status: 'promoted', email: normalizedEmail, userId: existingUser.id };
    } else {
      const pwd = options.password || generateSecurePassword();
      const registerResult = await register({ email: normalizedEmail, password: pwd });
      const newUserId = registerResult.user.id;

      await db.update(users).set({ role: 'admin', updatedAt: new Date() }).where(eq(users.id, newUserId));
      await writeAuditLog(
        'admin.provisioned',
        'user',
        newUserId,
        { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() },
        { type: 'system', id: 'cli-operator' }
      );
      return { status: 'created_and_promoted', email: normalizedEmail, userId: newUserId, password: pwd };
    }
  } else if (command === 'demote') {
    if (!existingUser) {
      throw new Error(`User ${normalizedEmail} not found`);
    }
    if (existingUser.role !== 'admin') {
      return { status: 'not_admin', email: normalizedEmail };
    }
    await db.update(users).set({ role: 'user', refreshTokenHash: null, updatedAt: new Date() }).where(eq(users.id, existingUser.id));
    await writeAuditLog(
      'admin.demoted',
      'user',
      existingUser.id,
      { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() },
      { type: 'system', id: 'cli-operator' }
    );
    return { status: 'demoted', email: normalizedEmail };
  } else if (command === 'cleanup') {
    if (!existingUser) {
      return { status: 'not_found', email: normalizedEmail };
    }
    await db.delete(users).where(eq(users.id, existingUser.id));
    await writeAuditLog(
      'admin.cleaned_up',
      'user',
      existingUser.id,
      { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() },
      { type: 'system', id: 'cli-operator' }
    );
    return { status: 'deleted', email: normalizedEmail };
  }

  throw new Error('Invalid command execution');
}
