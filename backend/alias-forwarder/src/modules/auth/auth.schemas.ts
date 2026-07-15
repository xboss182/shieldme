import { z } from 'zod';

const passwordComplexity = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(256, 'Password is too long')
  .refine((value) => /[a-z]/.test(value), 'Password must include a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must include an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must include a number')
  .refine((value) => /[^A-Za-z0-9]/.test(value), 'Password must include a symbol');

export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordComplexity,
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(256),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
