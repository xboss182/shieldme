import { normalizeLocalPart } from './local-part.js';

const RESERVED_LOCAL_PARTS = new Set([
  // RFC / operational mailboxes
  'abuse', 'postmaster', 'hostmaster', 'webmaster', 'noc', 'security', 'ssladmin', 'ssladministrator',
  // Administrative / impersonation-sensitive
  'admin', 'administrator', 'administration', 'sysadmin', 'system', 'root', 'support', 'help', 'contact', 'info',
  // Billing/legal/compliance
  'billing', 'finance', 'accounting', 'accounts', 'legal', 'copyright', 'license', 'privacy', 'compliance',
  // Mail infrastructure and automated sender identities
  'mail', 'email', 'smtp', 'imap', 'pop', 'mx', 'bounce', 'bounces', 'mailer-daemon', 'postmaster',
  'noreply', 'no-reply', 'do-not-reply', 'donotreply', 'do-not-respond', 'donotrespond',
  // Product/test/privileged names that are commonly abused
  'api', 'dev', 'developer', 'test', 'testing', 'demo', 'guest', 'guests', 'owner', 'staff', 'team',
  // Reverse-reply namespace (MNC-708). The `forwarded+<token>` form is already
  // structurally impossible as an alias (LOCAL_PART_REGEX rejects `+`), but
  // reserve the bare word so no operator can register a `forwarded` alias that
  // shadows the reverse-reply branch.
  'forwarded',
  // Common homoglyph/leetspeak variants called out by Forward Email-style policies
  'acc0unt', 'acc0unts', 'cust0mer', 'devel0per', 'deve1oper', 'a1pha', 'c1ient', 'c1ients',
]);

export function isReservedLocalPart(localPart: string) {
  const normalized = localPart.trim().toLowerCase();
  return RESERVED_LOCAL_PARTS.has(normalized);
}

export function getReservedLocalParts() {
  return [...RESERVED_LOCAL_PARTS].sort();
}


export type ReservedLocalPartAction = 'reserve' | 'allow';
export type ReservedLocalPartRule = {
  localPart: string;
  domainId?: string | null;
  action: ReservedLocalPartAction;
};

export { normalizeLocalPart } from './local-part.js';

export function resolveReservedLocalPart(localPart: string, rules: ReservedLocalPartRule[] = [], domainId?: string | null) {
  const normalized = normalizeLocalPart(localPart);
  const matchingRules = rules.filter((rule) => normalizeLocalPart(rule.localPart) === normalized);
  const domainRule = matchingRules.find((rule) => rule.domainId != null && rule.domainId === domainId);
  const globalRule = matchingRules.find((rule) => rule.domainId == null);
  const effectiveRule = domainRule ?? globalRule;
  if (effectiveRule) {
    return { reserved: effectiveRule.action === 'reserve', source: 'rule' as const, localPart: normalized };
  }
  return { reserved: RESERVED_LOCAL_PARTS.has(normalized), source: 'static' as const, localPart: normalized };
}
