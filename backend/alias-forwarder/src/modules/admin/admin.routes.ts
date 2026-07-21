import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { setRuntimeConfig, getResendApiKey, getPlatformDomain, isByoSmtpRuntimeEnabled, isForwardingEnabled, getOutboundProvider, isOutboundConfigured } from '../../config/runtime-config.js';
import { isRelayKmsConfigured } from '../smtp-relays/crypto.js';
import { suspendSmtpRelay } from '../smtp-relays/service.js';
import { adminDisableUser, adminEnableUser, adminSetUserStatus, adminSetUserPlan, listAdminUsers, getAdminUser, adminDisableDomain, adminEnableDomain, adminSetDomainStatus, listAdminDomains, adminDisableAlias, adminEnableAlias, adminSetAliasStatus, adminForceDeleteAlias, listAdminAliases, listAuditLogs, listDeliveries, getAdminStats, writeAuditLog, listReservedLocalParts, createReservedLocalPart, deleteReservedLocalPart, AdminError } from './admin.service.js';
import { listSecurityEvents, logSecurityEvent } from '../security/security-events.js';
import { addSenderBlock, removeSenderBlock, listSenderBlocks, addToSuppressionList, removeFromSuppressionList, listSuppressions } from '../abuse/abuse.service.js';
import { z } from 'zod';
import { ttiRouter } from '../tti/tti.routes.js';
import jwt from 'jsonwebtoken';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export const adminRouter = Router();

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin token required' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string; email: string; role?: string; type: string };
    if (payload.type === 'access' && payload.role === 'admin') {
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.sub),
        columns: { isActive: true, role: true },
      });
      if (user && user.isActive && user.role === 'admin') {
        req.auth = { userId: payload.sub, email: payload.email };
        return next();
      }
    }
  } catch (err) {
    // If JWT verification fails, continue to check ADMIN_SECRET
  }

  if (env.ADMIN_SECRET && token === env.ADMIN_SECRET) {
    return next();
  }

  void logSecurityEvent({ action: 'admin.auth_failed', severity: 'critical' });
  return res.status(403).json({ error: 'Forbidden' });
}

adminRouter.use((req, res, next) => {
  requireAdmin(req, res, next).catch(next);
});
function getConfigResponse() {
  const resendConfigured = Boolean(getResendApiKey());
  const mailbabyConfigured = Boolean(process.env['MAILBABY_SMTP_USERNAME'] && process.env['MAILBABY_SMTP_PASSWORD']);
  return {
    platformDomain: getPlatformDomain() ?? null,
    resendConfigured,
    mailbabyConfigured,
    outboundProvider: getOutboundProvider(),
    outboundConfigured: isOutboundConfigured(),
    forwardingEnabled: isForwardingEnabled(),
    byoSmtp: { enabled: isByoSmtpRuntimeEnabled(), kmsConfigured: isRelayKmsConfigured(), pilotOwnersConfigured: Boolean(process.env['BYO_SMTP_PILOT_OWNER_IDS']) },
    domain: { configured: Boolean(getPlatformDomain()) },
    mailbaby: { configured: mailbabyConfigured },
    resend: { configured: resendConfigured },
  };
}
adminRouter.get('/config', (_req, res) => res.json(getConfigResponse()));
const configUpdateSchema = z.object({ resendApiKey: z.string().min(1).nullable().optional(), platformDomain: z.string().min(1).optional(), outboundProvider: z.enum(['mailbaby', 'resend']).optional() });
adminRouter.post('/config', (req, res, next) => { try { const patch = configUpdateSchema.parse(req.body); setRuntimeConfig({ resendApiKey: patch.resendApiKey ?? undefined, platformDomain: patch.platformDomain, outboundProvider: patch.outboundProvider }); res.json(getConfigResponse()); } catch (e) { next(e); } });
adminRouter.post('/forwarding/disable', async (req, res, next) => { try { setRuntimeConfig({ forwardingEnabled: false }); await writeAuditLog('forwarding.disable', 'system', 'forwarding', { via: 'admin_api' }); await logSecurityEvent({ action: 'forwarding.disable', severity: 'critical', actorType: 'admin', actorId: req.auth?.userId ?? 'admin-secret', metadata: { via: 'admin_api' } }); res.json({ forwardingEnabled: isForwardingEnabled() }); } catch (e) { next(e); } });
adminRouter.post('/forwarding/enable', async (req, res, next) => { try { setRuntimeConfig({ forwardingEnabled: true }); await writeAuditLog('forwarding.enable', 'system', 'forwarding', { via: 'admin_api' }); await logSecurityEvent({ action: 'forwarding.enable', severity: 'critical', actorType: 'admin', actorId: req.auth?.userId ?? 'admin-secret', metadata: { via: 'admin_api' } }); res.json({ forwardingEnabled: isForwardingEnabled() }); } catch (e) { next(e); } });
adminRouter.post('/byo-smtp/disable', async (req, res, next) => { try { setRuntimeConfig({ byoSmtpEnabled: false }); await writeAuditLog('byo_smtp.disable', 'system', 'byo_smtp', { via: 'admin_api' }); await logSecurityEvent({ action: 'byo_smtp.disable', severity: 'critical', actorType: 'admin', actorId: req.auth?.userId ?? 'admin-secret', metadata: { via: 'admin_api' } }); res.json({ byoSmtpEnabled: false }); } catch (e) { next(e); } });
adminRouter.post('/byo-smtp/enable', async (req, res, next) => { try { if (process.env['BYO_SMTP_ENABLED'] !== 'true' || !isRelayKmsConfigured() || !process.env['BYO_SMTP_PILOT_OWNER_IDS']) return res.status(409).json({ error: 'BYO SMTP environment gates are not configured' }); setRuntimeConfig({ byoSmtpEnabled: true }); await writeAuditLog('byo_smtp.enable', 'system', 'byo_smtp', { via: 'admin_api' }); await logSecurityEvent({ action: 'byo_smtp.enable', severity: 'critical', actorType: 'admin', actorId: req.auth?.userId ?? 'admin-secret', metadata: { via: 'admin_api' } }); res.json({ byoSmtpEnabled: true }); } catch (e) { next(e); } });
adminRouter.post('/smtp-relays/:id/suspend', async (req, res, next) => { try { await suspendSmtpRelay(String(req.params.id)); await logSecurityEvent({ action: 'smtp_relay.suspend', targetType: 'smtp_relay', targetId: String(req.params.id), severity: 'critical', actorType: 'admin', actorId: req.auth?.userId ?? 'admin-secret' }); res.status(204).send(); } catch (e) { next(e); } });
adminRouter.get('/stats', async (_req, res, next) => { try { res.json(await getAdminStats()); } catch (e) { next(e); } });
adminRouter.use('/tti', ttiRouter);
adminRouter.get('/security-events', async (req, res, next) => { try { const hours = Number(req.query.hours ?? 24); const limit = Number(req.query.limit ?? 100); res.json(await listSecurityEvents(hours, limit)); } catch (e) { next(e); } });
adminRouter.get('/users', async (req, res, next) => { try { res.json(await listAdminUsers(req.query)); } catch (e) { next(e); } });
adminRouter.get('/users/:id', async (req, res, next) => { try { res.json({ user: await getAdminUser(String(req.params.id)) }); } catch (e) { next(e); } });
adminRouter.patch('/users/:id', async (req, res, next) => { try { const patch = z.object({ status: z.enum(['active', 'suspended']).optional(), plan: z.enum(['free', 'basic', 'pro', 'business']).optional() }).parse(req.body); const user = patch.plan ? await adminSetUserPlan(String(req.params.id), patch.plan) : patch.status ? await adminSetUserStatus(String(req.params.id), patch.status) : await getAdminUser(String(req.params.id)); res.json({ user }); } catch (e) { next(e); } });
adminRouter.post('/users/:id/disable', async (req, res, next) => { try { res.json(await adminDisableUser(String(req.params.id))); } catch (e) { next(e); } });
adminRouter.post('/users/:id/enable', async (req, res, next) => { try { res.json(await adminEnableUser(String(req.params.id))); } catch (e) { next(e); } });
adminRouter.get('/domains', async (req, res, next) => { try { res.json(await listAdminDomains(req.query)); } catch (e) { next(e); } });
adminRouter.patch('/domains/:id', async (req, res, next) => { try { const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body); res.json({ domain: await adminSetDomainStatus(String(req.params.id), status) }); } catch (e) { next(e); } });
adminRouter.post('/domains/:id/disable', async (req, res, next) => { try { res.json(await adminDisableDomain(String(req.params.id))); } catch (e) { next(e); } });
adminRouter.post('/domains/:id/enable', async (req, res, next) => { try { res.json(await adminEnableDomain(String(req.params.id))); } catch (e) { next(e); } });
adminRouter.get('/aliases', async (req, res, next) => { try { res.json(await listAdminAliases(req.query)); } catch (e) { next(e); } });
adminRouter.patch('/aliases/:id', async (req, res, next) => { try { const { status } = z.object({ status: z.enum(['active', 'disabled']) }).parse(req.body); res.json({ alias: await adminSetAliasStatus(String(req.params.id), status) }); } catch (e) { next(e); } });
adminRouter.delete('/aliases/:id', async (req, res, next) => { try { const parsed = z.object({ confirm: z.literal('DELETE') }).parse(req.body ?? {}); void parsed; res.json({ alias: await adminForceDeleteAlias(String(req.params.id)) }); } catch (e) { next(e); } });
adminRouter.post('/aliases/:id/disable', async (req, res, next) => { try { res.json(await adminDisableAlias(String(req.params.id))); } catch (e) { next(e); } });
adminRouter.post('/aliases/:id/enable', async (req, res, next) => { try { res.json(await adminEnableAlias(String(req.params.id))); } catch (e) { next(e); } });

const reservedLocalPartSchema = z.object({ localPart: z.string().min(1).max(64), domainId: z.string().uuid().nullable().optional(), action: z.enum(['reserve', 'allow']).default('reserve'), note: z.string().max(500).nullable().optional() });
adminRouter.get('/reserved-local-parts', async (req, res, next) => { try { res.json(await listReservedLocalParts(req.query)); } catch (e) { next(e); } });
adminRouter.post('/reserved-local-parts', async (req, res, next) => { try { const input = reservedLocalPartSchema.parse(req.body); res.status(201).json({ reservedLocalPart: await createReservedLocalPart(input) }); } catch (e) { next(e); } });
adminRouter.delete('/reserved-local-parts/:id', async (req, res, next) => { try { await deleteReservedLocalPart(String(req.params.id)); res.status(204).send(); } catch (e) { next(e); } });
adminRouter.get('/audit-logs', async (req, res, next) => { try { res.json(await listAuditLogs(req.query)); } catch (e) { next(e); } });
adminRouter.get('/deliveries', async (req, res, next) => { try { res.json(await listDeliveries(req.query)); } catch (e) { next(e); } });
const senderBlockSchema = z.object({ senderEmail: z.string().email() });
adminRouter.get('/aliases/:id/blocklist', async (req, res, next) => { try { res.json({ blocklist: await listSenderBlocks(String(req.params.id)) }); } catch (e) { next(e); } });
adminRouter.post('/aliases/:id/blocklist', async (req, res, next) => { try { const { senderEmail } = senderBlockSchema.parse(req.body); const row = await addSenderBlock(String(req.params.id), senderEmail); res.status(row ? 201 : 200).json({ blocked: row ?? null }); } catch (e) { next(e); } });
adminRouter.delete('/aliases/:id/blocklist/:sender', async (req, res, next) => { try { await removeSenderBlock(String(req.params.id), String(req.params.sender)); res.status(204).send(); } catch (e) { next(e); } });
const suppressionSchema = z.object({ email: z.string().email(), reason: z.enum(['bounce', 'complaint', 'manual']).default('manual') });
adminRouter.get('/suppression', async (_req, res, next) => { try { res.json({ suppressions: await listSuppressions() }); } catch (e) { next(e); } });
adminRouter.post('/suppression', async (req, res, next) => { try { const { email, reason } = suppressionSchema.parse(req.body); const row = await addToSuppressionList(email, reason); res.status(row ? 201 : 200).json({ suppressed: row ?? null }); } catch (e) { next(e); } });
adminRouter.delete('/suppression/:email', async (req, res, next) => { try { await removeFromSuppressionList(decodeURIComponent(String(req.params.email))); res.status(204).send(); } catch (e) { next(e); } });
export function adminErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) { if (err instanceof AdminError) return res.status(err.statusCode).json({ error: err.message }); if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' }); next(err); }

// ── Delivery failure routes (Phase 4) ────────────────────────────────────────
import { listAllDeliveryFailures, getDeliveryFailureSummary } from '../delivery/delivery-failures.service.js';

/**
 * GET /api/admin/delivery-failures
 * Workspace-wide delivery failures (paginated, filterable by reason/aliasId).
 */
adminRouter.get('/delivery-failures', async (req, res, next) => {
  try {
    const result = await listAllDeliveryFailures({
      reason: req.query.reason as string | undefined,
      aliasId: req.query.aliasId as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/delivery-failures/summary
 * Workspace-wide summary: counts by reason (bounce/complaint/failed) + total.
 */
adminRouter.get('/delivery-failures/summary', async (_req, res, next) => {
  try {
    res.json(await getDeliveryFailureSummary());
  } catch (e) { next(e); }
});
