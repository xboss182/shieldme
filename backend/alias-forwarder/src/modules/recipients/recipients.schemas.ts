import { z } from 'zod';

export const createRecipientSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const verifyRecipientSchema = z.object({
  token: z.string().min(1),
});

export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;
export type VerifyRecipientInput = z.infer<typeof verifyRecipientSchema>;
