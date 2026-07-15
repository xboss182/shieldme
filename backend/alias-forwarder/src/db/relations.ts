import { relations } from 'drizzle-orm';
import { users, domains, recipients, aliases, mailLogs, senderBlocklists, pgpKeys, auditLogs, reservedLocalParts, deliveryFailureLog, ttiChecks } from './schema.js';

export const usersRelations = relations(users, ({ many }) => ({
  domains: many(domains),
  recipients: many(recipients),
  aliases: many(aliases),
  pgpKeys: many(pgpKeys),
}));

export const domainsRelations = relations(domains, ({ one, many }) => ({
  owner: one(users, { fields: [domains.ownerId], references: [users.id] }),
  aliases: many(aliases),
  reservedLocalParts: many(reservedLocalParts),
}));

export const recipientsRelations = relations(recipients, ({ one, many }) => ({
  owner: one(users, { fields: [recipients.ownerId], references: [users.id] }),
  aliases: many(aliases),
  pgpKey: one(pgpKeys, { fields: [recipients.id], references: [pgpKeys.recipientId] }),
}));

export const aliasesRelations = relations(aliases, ({ one, many }) => ({
  owner: one(users, { fields: [aliases.ownerId], references: [users.id] }),
  domain: one(domains, { fields: [aliases.domainId], references: [domains.id] }),
  recipient: one(recipients, { fields: [aliases.recipientId], references: [recipients.id] }),
  mailLogs: many(mailLogs),
  senderBlocklists: many(senderBlocklists),
  deliveryFailures: many(deliveryFailureLog),
}));

export const pgpKeysRelations = relations(pgpKeys, ({ one }) => ({
  user: one(users, { fields: [pgpKeys.userId], references: [users.id] }),
  recipient: one(recipients, { fields: [pgpKeys.recipientId], references: [recipients.id] }),
}));

export const mailLogsRelations = relations(mailLogs, ({ one }) => ({
  alias: one(aliases, { fields: [mailLogs.aliasId], references: [aliases.id] }),
}));

export const senderBlocklistsRelations = relations(senderBlocklists, ({ one }) => ({
  alias: one(aliases, { fields: [senderBlocklists.aliasId], references: [aliases.id] }),
}));

export const auditLogsRelations = relations(auditLogs, () => ({}));

export const reservedLocalPartsRelations = relations(reservedLocalParts, ({ one }) => ({
  domain: one(domains, { fields: [reservedLocalParts.domainId], references: [domains.id] }),
}));

export const deliveryFailureLogRelations = relations(deliveryFailureLog, ({ one }) => ({
  alias: one(aliases, { fields: [deliveryFailureLog.aliasId], references: [aliases.id] }),
}));

export const ttiChecksRelations = relations(ttiChecks, () => ({}));
