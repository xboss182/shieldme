import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4001),
  APP_URL: z.string().url(),
  // Optional — configure later via admin settings
  PLATFORM_DOMAIN: z.string().min(1).optional(),
  // Optional — configure later via admin settings
  RESEND_API_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(12).max(15).default(12),
  // Stage 2: recipient verification token TTL (minutes)
  RECIPIENT_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).default(60),
  // Stage 2: DKIM default selector
  DKIM_SELECTOR: z.string().min(1).default('mail'),
  // Stage 5: abuse controls
  // Max inbound messages per alias per window (sliding window)
  RATE_LIMIT_ALIAS_MAX: z.coerce.number().int().min(1).default(100),
  // Window duration in seconds for per-alias rate limit
  RATE_LIMIT_ALIAS_WINDOW_SEC: z.coerce.number().int().min(1).default(3600),
  // Max inbound messages per user per window
  RATE_LIMIT_USER_MAX: z.coerce.number().int().min(1).default(500),
  // Window duration in seconds for per-user rate limit
  RATE_LIMIT_USER_WINDOW_SEC: z.coerce.number().int().min(1).default(3600),
  // Secret for Resend webhook signature verification (optional for MVP)
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  // Outbound provider: 'mailbaby' (default) or 'resend'. SES removed from active paths.
  OUTBOUND_PROVIDER: z.enum(['mailbaby', 'resend']).default('mailbaby'),
  MAILBABY_SMTP_USERNAME: z.string().optional(),
  MAILBABY_SMTP_PASSWORD: z.string().optional(),
  MAILBABY_DKIM_DOMAIN: z.string().optional(),
  MAILBABY_DKIM_SELECTOR: z.string().optional(),
  MAILBABY_DKIM_PRIVATE_KEY: z.string().optional(),
  // Admin API secret key (Bearer token for /api/admin endpoints)
  ADMIN_SECRET: z.string().min(32).optional(),
  // Inbound Spam Scanner controls. Defaults are conservative: tag only.
  SPAM_SCANNER_ENABLED: z.string().optional(),
  SPAM_SCANNER_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  SPAM_SCANNER_ACTION: z.enum(['tag', 'reject', 'quarantine']).default('tag'),
  SPAM_SCANNER_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  TRACKING_PROTECTION_ENABLED: z.string().default('true'),
  TRACKING_PROTECTION_MODE: z.enum(['conservative', 'aggressive']).default('conservative'),
  // Queue payloads can contain message bodies briefly while waiting for delivery.
  // Encrypt them before BullMQ writes to Redis and expire them aggressively.
  QUEUE_ENCRYPTION_SECRET: z.string().min(32).optional(),
  EMAIL_QUEUE_PAYLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  BYO_SMTP_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BYO_SMTP_PILOT_OWNER_IDS: z.string().default('').transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean)).refine((ids) => ids.every((id) => z.string().uuid().safeParse(id).success), 'BYO_SMTP_PILOT_OWNER_IDS must contain UUIDs'),
  BYO_SMTP_APPROVED_HOSTS: z.string().default(''),
  RELAY_KMS_SOCKET_PATH: z.string().optional(),
  RELAY_METRICS_PORT: z.coerce.number().int().positive().optional(),
  BYO_SMTP_PILOT_MAX_MONTHLY_FORWARDS: z.coerce.number().int().min(1).max(1_000).default(25),
  BYO_SMTP_PILOT_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', Object.keys(parsed.error.flatten().fieldErrors));
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;

if (env.NODE_ENV === 'production' && env.ADMIN_SECRET) {
  console.warn('ADMIN_SECRET is deprecated; use per-operator admin accounts instead.');
}
