import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { recipients } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { getPlatformDomain } from '../../config/runtime-config.js';
import { logger } from '../../lib/logger.js';
import { generateToken, hashToken, verifyToken } from '../../lib/tokens.js';
import { isResendConfigured, sendViaResend } from '../inbound/resend.service.js';
import type { CreateRecipientInput } from './recipients.schemas.js';
import { assertCanCreateRecipient } from '../plans/plans.js';

export class RecipientError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

async function sendRecipientVerificationEmail(recipientId: string, email: string, rawToken: string) {
  if (!isResendConfigured()) return false;

  const appUrl = env.APP_URL.replace(/\/$/, '');
  const platformDomain = getPlatformDomain() ?? 'shieldme.cc';
  const verifyUrl = `${appUrl}/recipients?verifyRecipient=${encodeURIComponent(recipientId)}&token=${encodeURIComponent(rawToken)}`;

  try {
    await sendViaResend({
      from: `ShieldMe <verify@${platformDomain}>`,
      to: email,
      subject: 'Verify your ShieldMe recipient email',
      textBody: `Verify this recipient email for ShieldMe.

Click this link while logged in: ${verifyUrl}

Or paste this code in the Recipients page: ${rawToken}

This code expires in ${env.RECIPIENT_TOKEN_TTL_MINUTES} minutes.`,
      htmlBody: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
          <h2>Verify your ShieldMe recipient email</h2>
          <p>Click the button below while logged in to verify <strong>${email}</strong> as a forwarding recipient.</p>
          <p><a href="${verifyUrl}" style="display:inline-block;background:#10b981;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Verify recipient</a></p>
          <p style="font-size:13px;color:#6b7280">If the button does not work, paste this code in the Recipients page:</p>
          <code style="display:block;background:#f3f4f6;padding:10px;border-radius:8px;word-break:break-all">${rawToken}</code>
          <p style="font-size:12px;color:#6b7280">This code expires in ${env.RECIPIENT_TOKEN_TTL_MINUTES} minutes.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    logger.warn({ err, recipientId, email }, 'Recipient verification email failed');
    return false;
  }
}

export async function createRecipient(ownerId: string, input: CreateRecipientInput) {
  await assertCanCreateRecipient(ownerId);

  // One verified recipient per owner+email pair (prevent duplicate pending entries)
  const existing = await db.query.recipients.findFirst({
    where: and(eq(recipients.ownerId, ownerId), eq(recipients.email, input.email)),
  });
  if (existing) {
    throw new RecipientError('Recipient already exists for this address', 409);
  }

  const rawToken = generateToken(32);
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.RECIPIENT_TOKEN_TTL_MINUTES * 60 * 1000);

  const [recipient] = await db
    .insert(recipients)
    .values({
      ownerId,
      email: input.email,
      verificationTokenHash: tokenHash,
      verificationTokenExpiresAt: expiresAt,
    })
    .returning({
      id: recipients.id,
      email: recipients.email,
      status: recipients.status,
      createdAt: recipients.createdAt,
    });

  const verificationSent = await sendRecipientVerificationEmail(recipient.id, recipient.email, rawToken);

  return {
    recipient,
    verificationSent,
    verificationToken: rawToken,
    expiresAt,
  };
}

export async function listRecipients(ownerId: string) {
  return db.query.recipients.findMany({
    where: eq(recipients.ownerId, ownerId),
    columns: {
      id: true,
      email: true,
      status: true,
      verifiedAt: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function getRecipient(ownerId: string, recipientId: string) {
  const row = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, ownerId)),
  });
  if (!row) throw new RecipientError('Recipient not found', 404);
  return row;
}

export async function deleteRecipient(ownerId: string, recipientId: string) {
  const row = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, ownerId)),
  });
  if (!row) throw new RecipientError('Recipient not found', 404);
  await db.delete(recipients).where(eq(recipients.id, recipientId));
}

/**
 * Consume a verification token.
 * - Token must not be expired.
 * - Token can only be used once (hash cleared after use).
 */
export async function verifyRecipientToken(ownerId: string, recipientId: string, rawToken: string) {
  const row = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, ownerId)),
  });

  if (!row) throw new RecipientError('Recipient not found', 404);
  if (row.status === 'verified') throw new RecipientError('Already verified', 409);
  if (!row.verificationTokenHash || !row.verificationTokenExpiresAt) {
    throw new RecipientError('No pending verification token', 400);
  }

  // Check expiry
  if (row.verificationTokenExpiresAt < new Date()) {
    throw new RecipientError('Verification token has expired', 410);
  }

  // Check token
  const matches = await verifyToken(rawToken, row.verificationTokenHash);
  if (!matches) {
    throw new RecipientError('Invalid verification token', 400);
  }

  // Consume — clear the token so it cannot be reused
  const [updated] = await db
    .update(recipients)
    .set({
      status: 'verified',
      verifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(recipients.id, recipientId))
    .returning();

  return updated;
}

/** Resend a fresh verification token, replacing any existing one. */
export async function resendVerification(ownerId: string, recipientId: string) {
  const row = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, ownerId)),
  });
  if (!row) throw new RecipientError('Recipient not found', 404);
  if (row.status === 'verified') throw new RecipientError('Already verified', 409);

  const rawToken = generateToken(32);
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.RECIPIENT_TOKEN_TTL_MINUTES * 60 * 1000);

  await db
    .update(recipients)
    .set({
      verificationTokenHash: tokenHash,
      verificationTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(recipients.id, recipientId));

  const verificationSent = await sendRecipientVerificationEmail(row.id, row.email, rawToken);

  return {
    verificationSent,
    verificationToken: rawToken,
    expiresAt,
  };
}

/** Used by alias module to enforce recipient trust. */
export async function assertRecipientVerified(ownerId: string, recipientId: string) {
  const row = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, ownerId)),
  });
  if (!row) throw new RecipientError('Recipient not found', 404);
  if (row.status !== 'verified') throw new RecipientError('Recipient is not verified', 422);
  if (!row.isActive) throw new RecipientError('Recipient is disabled', 422);
  return row;
}
