import { z } from 'zod';

// local-part: RFC 5321 simplified — alphanumeric, dots, hyphens, underscores, 1-64 chars
const localPartRegex = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

const localPartSchema = z.string().min(1).max(64).toLowerCase().refine((v) => localPartRegex.test(v), {
  message: 'Invalid local-part: use lowercase letters, digits, dots, hyphens, underscores (1-64 chars)',
});

export const createAliasSchema = z.object({
  localPart: localPartSchema.optional(),
  serviceLabel: z.string().min(1).max(120).optional(),
  domainId: z.string().uuid('domainId must be a UUID'),
  recipientId: z.string().uuid('recipientId must be a UUID'),
  pgpMode: z.enum(['none', 'optional', 'required']).optional(),
}).refine((value) => Boolean(value.localPart || value.serviceLabel), {
  message: 'Provide a localPart or serviceLabel',
});

export const updateAliasSchema = z.object({
  pgpMode: z.enum(['none', 'optional', 'required']),
});

export type CreateAliasInput = z.infer<typeof createAliasSchema>;
export type UpdateAliasInput = z.infer<typeof updateAliasSchema>;
