import { z } from 'zod';
import { normalizeRelayHost } from './ssrf.js';
import { isValidLocalPart, normalizeLocalPart } from '../aliases/local-part.js';

const host = z.string().transform(normalizeRelayHost);
const localPart = z.string().transform(normalizeLocalPart).pipe(z.string().min(1).max(64).refine(isValidLocalPart, 'Invalid identity local-part'));

export const createSmtpRelaySchema = z.object({
  label: z.string().trim().min(1).max(80),
  domainId: z.string().uuid(),
  host,
  port: z.union([z.literal(465), z.literal(587)]),
  tlsMode: z.enum(['implicit_tls', 'starttls']),
  authMethod: z.enum(['plain', 'login']),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  identityLocalPart: localPart,
  bounceSpfInclude: z.string().trim().regex(/^include:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i),
}).superRefine((value, context) => {
  if ((value.port === 465 && value.tlsMode !== 'implicit_tls') || (value.port === 587 && value.tlsMode !== 'starttls')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Port and TLS mode must be 465/implicit_tls or 587/starttls' });
  }
});

export const updateSmtpRelaySchema = z.object({ label: z.string().trim().min(1).max(80) });
export const recipientIdSchema = z.object({ recipientId: z.string().uuid() });
export const confirmSmtpRelayTestSchema = z.object({ token: z.string().min(32).max(256) });
export const rotateSmtpRelayCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  recipientId: z.string().uuid(),
});
export const outboundRouteSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('platform') }),
  z.object({ mode: z.literal('custom_smtp'), relayId: z.string().uuid(), acknowledgeNoFallback: z.literal(true) }),
]);

export type CreateSmtpRelayInput = z.infer<typeof createSmtpRelaySchema>;
export type RotateSmtpRelayCredentialsInput = z.infer<typeof rotateSmtpRelayCredentialsSchema>;
