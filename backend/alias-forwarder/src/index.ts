import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { configureRelayKmsFromEnv } from './modules/smtp-relays/local-kms.js';

configureRelayKmsFromEnv();
const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Alias forwarder service listening');
});
