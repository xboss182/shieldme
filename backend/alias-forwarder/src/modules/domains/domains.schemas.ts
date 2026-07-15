import { z } from 'zod';

export const createDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/, 'Invalid domain name'),
});

export type CreateDomainInput = z.infer<typeof createDomainSchema>;
