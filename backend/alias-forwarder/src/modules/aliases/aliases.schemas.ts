import { z } from 'zod';
import { isValidLocalPart, normalizeLocalPart } from './local-part.js';

const localPartSchema = z
  .string()
  .transform(normalizeLocalPart)
  .pipe(z.string().min(1).max(64).refine(isValidLocalPart, {
    message: 'Invalid local-part: use lowercase letters, digits, dots, hyphens, underscores (1-64 chars)',
  }));

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
