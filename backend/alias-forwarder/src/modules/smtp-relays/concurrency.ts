import { randomUUID } from 'node:crypto';
import { redis } from '../../lib/redis.js';
import { SmtpRelayError } from './service.js';
import { env } from '../../config/env.js';

const SLOT_COUNT = env.BYO_SMTP_PILOT_CONCURRENCY ?? 1;
const SLOT_TTL_MS = 65_000;

export async function acquireRelaySlot(ownerId: string, _relayId: string) {
  const token = randomUUID();
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    const key = `smtp-relay:${ownerId}:${slot}`;
    if (await redis.set(key, token, 'PX', SLOT_TTL_MS, 'NX') === 'OK') {
      return async () => {
        await redis.eval('if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0', 1, key, token);
      };
    }
  }
  throw new SmtpRelayError('Custom SMTP relay is busy', 451, 'relay_concurrency_limit');
}
