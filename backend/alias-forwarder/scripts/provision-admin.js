import 'dotenv/config';
import { db, pool } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { register } from '../src/modules/auth/auth.service.js';
import { writeAuditLog } from '../src/modules/admin/admin.service.js';
import { redis } from '../src/lib/redis.js';
import { eq, inArray } from 'drizzle-orm';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomInt } from 'crypto';

function printUsage() {
    console.log(`
Usage:
  npx tsx scripts/provision-admin.ts promote --email <email> [--password <password>] --confirm
  npx tsx scripts/provision-admin.ts demote --email <email> --confirm
  npx tsx scripts/provision-admin.ts cleanup --email <email> --confirm
  npx tsx scripts/provision-admin.ts cleanup --all --confirm
`);
}
export function isDisposableEmail(email) {
    const normalized = email.toLowerCase().trim();
    // 1. Ends with one of the allowed disposable domains:
    const allowedDomains = ['@example.com', '@shieldme.qa', '@disposable.shieldme.local'];
    const hasAllowedDomain = allowedDomains.some(domain => normalized.endsWith(domain));
    // 2. Starts with qa-, test-, or disposable-
    const hasAllowedPrefix = normalized.startsWith('qa-') || normalized.startsWith('test-') || normalized.startsWith('disposable-');
    return hasAllowedDomain && hasAllowedPrefix;
}
export function generateSecurePassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    const syms = '!@#$%^&*()_+';
    let pass = '';
    pass += chars[randomInt(0, chars.length)];
    pass += uppers[randomInt(0, uppers.length)];
    pass += nums[randomInt(0, nums.length)];
    pass += syms[randomInt(0, syms.length)];
    const all = chars + uppers + nums + syms;
    for (let i = 0; i < 12; i++) {
        pass += all[randomInt(0, all.length)];
    }
    return pass;
}
export async function runProvisioning(command, options) {
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
            await writeAuditLog('admin.cleaned_up', 'user', u.id, { email: u.email, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() }, { type: 'system', id: 'cli-operator' });
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
            await writeAuditLog('admin.provisioned', 'user', existingUser.id, { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() }, { type: 'system', id: 'cli-operator' });
            return { status: 'promoted', email: normalizedEmail, userId: existingUser.id };
        }
        else {
            const pwd = options.password || generateSecurePassword();
            const registerResult = await register({ email: normalizedEmail, password: pwd });
            const newUserId = registerResult.user.id;
            await db.update(users).set({ role: 'admin', updatedAt: new Date() }).where(eq(users.id, newUserId));
            await writeAuditLog('admin.provisioned', 'user', newUserId, { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() }, { type: 'system', id: 'cli-operator' });
            return { status: 'created_and_promoted', email: normalizedEmail, userId: newUserId, password: pwd };
        }
    }
    else if (command === 'demote') {
        if (!existingUser) {
            throw new Error(`User ${normalizedEmail} not found`);
        }
        if (existingUser.role !== 'admin') {
            return { status: 'not_admin', email: normalizedEmail };
        }
        await db.update(users).set({ role: 'user', refreshTokenHash: null, updatedAt: new Date() }).where(eq(users.id, existingUser.id));
        await writeAuditLog('admin.demoted', 'user', existingUser.id, { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() }, { type: 'system', id: 'cli-operator' });
        return { status: 'demoted', email: normalizedEmail };
    }
    else if (command === 'cleanup') {
        if (!existingUser) {
            return { status: 'not_found', email: normalizedEmail };
        }
        await db.delete(users).where(eq(users.id, existingUser.id));
        await writeAuditLog('admin.cleaned_up', 'user', existingUser.id, { email: normalizedEmail, actor: 'cli-operator', source: 'cli-script', timestamp: new Date().toISOString() }, { type: 'system', id: 'cli-operator' });
        return { status: 'deleted', email: normalizedEmail };
    }
    throw new Error('Invalid command execution');
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }
    const command = args[0];
    const emailIndex = args.indexOf('--email');
    const email = emailIndex !== -1 ? args[emailIndex + 1] : undefined;
    const passwordIndex = args.indexOf('--password');
    const password = passwordIndex !== -1 ? args[passwordIndex + 1] : undefined;
    const confirm = args.includes('--confirm');
    const all = args.includes('--all');
    try {
        const result = await runProvisioning(command, { email, password, confirm, all });
        console.log('Result:', JSON.stringify(result, null, 2));
    }
    catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}
const currentFilePath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(currentFilePath) === path.resolve(process.argv[1]);
if (isMain) {
    main()
        .catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    })
        .finally(async () => {
        await pool.end();
        await redis.quit();
    });
}
