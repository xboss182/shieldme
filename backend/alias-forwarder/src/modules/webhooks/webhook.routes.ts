import { Router } from 'express';
import type { Request, Response } from 'express';
import { Webhook } from 'svix';
import { logger } from '../../lib/logger.js';
import { isResendConfigured } from '../inbound/resend.service.js';
import { env } from '../../config/env.js';
import { normalizeResendWebhook, normalizeSesWebhook, recordDeliveryEvent } from '../delivery/delivery-events.service.js';
import { addToSuppressionList } from '../abuse/abuse.service.js';

export const webhookRouter = Router();

/**
 * POST /api/webhooks/resend
 *
 * Handles Resend webhook events: email.bounced and email.complained.
 * Adds the affected recipient to the suppression list automatically.
 *
 * Returns 503 when RESEND_API_KEY is not configured.
 *
 * Webhook signature verification via Svix is mandatory. Set RESEND_WEBHOOK_SECRET in production.
 */
webhookRouter.post('/resend', async (req: Request, res: Response) => {
  if (!isResendConfigured()) {
    return res.status(503).json({ error: 'Resend not configured' });
  }

  // ── Signature verification ────────────────────────────────────────────────
  const webhookSecret = env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('RESEND_WEBHOOK_SECRET not set — refusing unsigned webhook request');
    return res.status(503).json({ error: 'Webhook signature verification not configured' });
  }

  {
    const svixId = req.headers['svix-id'] as string | undefined;
    const svixTimestamp = req.headers['svix-timestamp'] as string | undefined;
    const svixSignature = req.headers['svix-signature'] as string | undefined;

    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.warn('Missing Svix signature headers on webhook request');
      return res.status(401).json({ error: 'Missing webhook signature headers' });
    }

    try {
      const wh = new Webhook(webhookSecret);
      wh.verify(JSON.stringify(req.body), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      logger.warn({ err }, 'Invalid Resend webhook signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  try {
    const event = normalizeResendWebhook(req.body);
    if (event) {
      await recordDeliveryEvent(event);
      return res.status(200).json({ processed: 1, reason: event.failureType ?? event.type });
    }

    const body = req.body as { type?: string; data?: { to?: string[] } };
    const recipients = body?.data?.to ?? [];
    if (body.type === 'email.bounced' || body.type === 'email.complained') {
      const reason = body.type === 'email.bounced' ? 'bounce' : 'complaint';
      for (const email of recipients) await addToSuppressionList(email, reason);
      return res.status(200).json({ processed: recipients.length, reason });
    }

    logger.debug({ eventType: body?.type }, 'Unhandled Resend webhook event type');
    return res.status(200).json({ processed: 0 });
  } catch (err) {
    logger.error({ err }, 'Error processing Resend webhook');
    return res.status(500).json({ error: 'Internal error' });
  }
});


/** POST /api/webhooks/ses — AWS SNS-style SES bounce/complaint/delivery events. */
webhookRouter.post('/ses', async (req: Request, res: Response) => {
  try {
    const event = normalizeSesWebhook(req.body);
    if (!event) return res.status(200).json({ processed: 0 });
    await recordDeliveryEvent(event);
    return res.status(200).json({ processed: 1, reason: event.failureType ?? event.type });
  } catch (err) {
    logger.error({ err }, 'Error processing SES webhook');
    return res.status(500).json({ error: 'Internal error' });
  }
});
