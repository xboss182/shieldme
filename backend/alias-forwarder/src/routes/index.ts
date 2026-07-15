import { Router } from 'express';
import { authRouter, authErrorHandler } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { domainsRouter, domainErrorHandler } from '../modules/domains/domains.routes.js';
import { recipientsRouter, recipientErrorHandler } from '../modules/recipients/recipients.routes.js';
import { aliasesRouter, aliasErrorHandler } from '../modules/aliases/aliases.routes.js';
import { adminRouter, adminErrorHandler } from '../modules/admin/admin.routes.js';
import { webhookRouter } from '../modules/webhooks/webhook.routes.js';
import { pgpRouter, pgpErrorHandler } from '../modules/pgp/pgp.routes.js';
import { plansRouter, planErrorHandler } from '../modules/plans/plans.routes.js';
import { deliveryFailuresRouter } from '../modules/delivery/delivery-failures.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/domains', domainsRouter);
apiRouter.use('/recipients', recipientsRouter);
apiRouter.use('/recipients/:id/pgp-key', pgpRouter);
apiRouter.use('/aliases', aliasesRouter);
apiRouter.use('/plans', plansRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/webhooks', webhookRouter);
apiRouter.use('/delivery-failures', deliveryFailuresRouter);

// Error handlers — order matters: specific first
apiRouter.use(authErrorHandler);
apiRouter.use(domainErrorHandler);
apiRouter.use(recipientErrorHandler);
apiRouter.use(pgpErrorHandler);
apiRouter.use(aliasErrorHandler);
apiRouter.use(adminErrorHandler);
apiRouter.use(planErrorHandler);
