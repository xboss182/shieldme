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

export function normalizeLocalPart(localPart: string) {
  return localPart.trim().toLowerCase();
}

function ruleApplies(rule: ReservedLocalPartRule, domainId?: string | null) {
  return rule.domainId == null || rule.domainId === domainId;
}

export function resolveReservedLocalPart(localPart: string, rules: ReservedLocalPartRule[] = [], domainId?: string | null) {
  const normalized = normalizeLocalPart(localPart);
  const exactRule = rules.find((rule) => normalizeLocalPart(rule.localPart) === normalized && ruleApplies(rule, domainId));
  if (exactRule) {
    return { reserved: exactRule.action === 'reserve', source: 'rule' as const, localPart: normalized };
  }
  return { reserved: RESERVED_LOCAL_PARTS.has(normalized), source: 'static' as const, localPart: normalized };
}
