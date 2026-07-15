import { describe, expect, it } from 'vitest';
import { isReservedLocalPart, resolveReservedLocalPart } from './reserved-local-parts.js';

describe('reserved local-parts', () => {
  it('keeps static operational addresses reserved by default', () => {
    expect(isReservedLocalPart('admin')).toBe(true);
    expect(resolveReservedLocalPart('admin', [])).toMatchObject({ reserved: true, source: 'static' });
  });

  it('allows an admin rule to override a static reserved address for a specific domain', () => {
    expect(resolveReservedLocalPart('security', [{ localPart: 'security', domainId: 'domain-1', action: 'allow' }], 'domain-1'))
      .toMatchObject({ reserved: false, source: 'rule' });
  });

  it('keeps static reservation when an allow rule is for another domain', () => {
    expect(resolveReservedLocalPart('security', [{ localPart: 'security', domainId: 'domain-2', action: 'allow' }], 'domain-1'))
      .toMatchObject({ reserved: true, source: 'static' });
  });

  it('supports global custom reserve rules for non-static names', () => {
    expect(resolveReservedLocalPart('founder', [{ localPart: 'founder', domainId: null, action: 'reserve' }], 'domain-1'))
      .toMatchObject({ reserved: true, source: 'rule' });
  });
});
