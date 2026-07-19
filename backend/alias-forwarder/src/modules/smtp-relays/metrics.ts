import { and, count, eq, min } from 'drizzle-orm';
import { Counter, Gauge, Histogram, register } from 'prom-client';

function metric<T>(name: string, create: () => T): T {
  return (register.getSingleMetric(name) as T | undefined) ?? create();
}

async function queuedRelayStats() {
  const [{ db }, { mailLogs }] = await Promise.all([
    import('../../db/client.js'),
    import('../../db/schema.js'),
  ]);
  return db.select({ oldest: min(mailLogs.createdAt), depth: count() }).from(mailLogs).where(and(eq(mailLogs.outboundRouteMode, 'custom_smtp'), eq(mailLogs.status, 'queued')));
}

export const relayFailuresTotal = metric('shieldme_smtp_relay_failures_total', () => new Counter<'phase'>({
  name: 'shieldme_smtp_relay_failures_total',
  help: 'SMTP relay failures by bounded phase',
  labelNames: ['phase'],
}));

export const relaySubmissionsTotal = metric('shieldme_smtp_relay_submissions_total', () => new Counter({
  name: 'shieldme_smtp_relay_submissions_total',
  help: 'SMTP relay submission attempts accepted by a relay',
}));

export const relayTestsTotal = metric('shieldme_smtp_relay_tests_total', () => new Counter<'phase' | 'outcome'>({
  name: 'shieldme_smtp_relay_tests_total',
  help: 'SMTP relay test phases by bounded outcome',
  labelNames: ['phase', 'outcome'],
}));

export const relayCircuitOpeningsTotal = metric('shieldme_smtp_relay_circuit_openings_total', () => new Counter({
  name: 'shieldme_smtp_relay_circuit_openings_total',
  help: 'SMTP relay circuit breaker openings',
}));

export const relayRetriesTotal = metric('shieldme_smtp_relay_retries_total', () => new Counter({
  name: 'shieldme_smtp_relay_retries_total',
  help: 'SMTP relay queue retry attempts',
}));

export const relayQueueAgeSeconds = metric('shieldme_smtp_relay_queue_oldest_age_seconds', () => new Gauge({
  name: 'shieldme_smtp_relay_queue_oldest_age_seconds',
  help: 'Age of the oldest queued custom SMTP delivery',
  async collect() {
    try {
      const [row] = await queuedRelayStats();
      this.set(row?.oldest ? Math.max(0, (Date.now() - row.oldest.getTime()) / 1_000) : 0);
    } catch {
      this.set(0);
    }
  },
}));

export const relayQueueDepth = metric('shieldme_smtp_relay_queue_depth', () => new Gauge({
  name: 'shieldme_smtp_relay_queue_depth',
  help: 'Queued custom SMTP deliveries',
  async collect() {
    try {
      const [row] = await queuedRelayStats();
      this.set(Number(row?.depth ?? 0));
    } catch {
      this.set(0);
    }
  },
}));

export const relayQueueWaitSeconds = metric('shieldme_smtp_relay_queue_wait_seconds', () => new Histogram({
  name: 'shieldme_smtp_relay_queue_wait_seconds',
  help: 'Custom SMTP delivery wait time before processing',
  buckets: [1, 5, 30, 60, 300, 900, 3600],
}));

export const relayDeliveryEventsTotal = metric('shieldme_delivery_events_total', () => new Counter<'event'>({
  name: 'shieldme_delivery_events_total',
  help: 'Normalized provider delivery events by bounded type',
  labelNames: ['event'],
}));

export function relayMetrics(): Promise<string> {
  return register.metrics();
}

export const relayMetricsContentType = register.contentType;
