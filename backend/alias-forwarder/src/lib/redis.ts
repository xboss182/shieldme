import RedisImport from 'ioredis';
const Redis = ((RedisImport as unknown as { default?: typeof RedisImport }).default ?? RedisImport) as any;
import { env } from '../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
