import { z } from 'zod';

// local-part: RFC 5321 simplified — alphanumeric, dots, hyphens, underscores, 1-64 chars
const localPartRegex = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export const createAliasSchema = z.object({
  localPart: z
    .string()
    .min(1)
    .max(64)
    .toLowerCase()
    .refine((v) => localPartRegex.test(v), {
      message: 'Invalid local-part: use lowercase letters, digits, dots, hyphens, underscores (1-64 chars)',
    }),
  domainId: z.string().uuid('domainId must be a UUID'),
  recipientId: z.string().uuid('recipientId must be a UUID'),
  pgpMode: z.enum(['none', 'optional', 'required']).optional(),
});

export const updateAliasSchema = z.object({
  pgpMode: z.enum(['none', 'optional', 'required']),
});

export type CreateAliasInput = z.infer<typeof createAliasSchema>;
export type UpdateAliasInput = z.infer<typeof updateAliasSchema>;
