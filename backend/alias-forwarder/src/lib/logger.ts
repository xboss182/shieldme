import pinoImport from 'pino';
import { env } from '../config/env.js';

const pino = (pinoImport as unknown as { default?: typeof pinoImport }).default ?? (pinoImport as any);

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
});
