import React, { useState } from 'react';
import { createAlias, listDomains, listRecipients, Domain, Recipient } from '../lib/api';

interface Props {
  token: string;
  onCreated: (address: string) => void;
}

const COMMON_SECOND_LEVEL_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.sg']);

export function serviceLabelFromHostname(hostname: string) {
  const labels = hostname.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (labels.length === 0) return '';
  const suffix = labels.slice(-2).join('.');
  const serviceIndex = COMMON_SECOND_LEVEL_SUFFIXES.has(suffix) ? labels.length - 3 : labels.length - 2;
  return labels[Math.max(0, serviceIndex)]
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

export function generateAliasLocalPart(serviceLabel: string) {
  const normalized = serviceLabel
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52);
  if (!normalized) return '';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `${normalized}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export default function CreateAliasForm({ token, onCreated }: Props) {
  const [localPart, setLocalPart] = useState('');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [domainId, setDomainId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded) return;
    try {
      const [d, r] = await Promise.all([listDomains(token), listRecipients(token)]);
      const verified = d.filter(x => x.verified);
      const verifiedR = r.filter(x => x.verified);
      setDomains(verified);
      setRecipients(verifiedR);
      if (verified.length) setDomainId(verified[0].id);
      if (verifiedR.length) setRecipientId(verifiedR[0].id);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  React.useEffect(() => { load(); }, []);

  React.useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url) return;
      try {
        const generated = generateAliasLocalPart(serviceLabelFromHostname(new URL(tab.url).hostname));
        if (generated) setLocalPart(generated);
      } catch {}
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const alias = await createAlias(token, localPart.trim(), domainId, recipientId);
      const address = alias.address ?? `${alias.localPart}@${alias.domain}`;
      await navigator.clipboard.writeText(address);
      onCreated(address);
    } catch (err: any) {
      const message = err.message ?? 'Failed to create alias';
      setError(
        message.toLowerCase().includes('already exists') || message.toLowerCase().includes('reserved')
          ? `${message}. Regenerate or edit the alias name and try again.`
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-4 py-3">
      <h2 className="text-sm font-semibold text-gray-700">New alias</h2>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-gray-600">Local part</label>
          <button
            type="button"
            onClick={() => {
              const label = localPart.replace(/-[a-f0-9]{10}$/, '');
              setLocalPart(generateAliasLocalPart(label));
            }}
            className="text-xs font-medium text-shield-600 hover:text-shield-700"
          >
            Regenerate
          </button>
        </div>
        <input
          type="text"
          value={localPart}
          onChange={e => setLocalPart(e.target.value.toLowerCase())}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-shield-500"
          placeholder="netflix-a1b2c3d4e5"
          pattern="[a-z0-9][a-z0-9._\-]{0,62}[a-z0-9]|[a-z0-9]"
          required
        />
      </div>

      {domains.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Domain</label>
          <select
            value={domainId}
            onChange={e => setDomainId(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-shield-500"
          >
            {domains.map(d => (
              <option key={d.id} value={d.id}>{d.domain}</option>
            ))}
          </select>
        </div>
      )}

      {recipients.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Forward to</label>
          <select
            value={recipientId}
            onChange={e => setRecipientId(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-shield-500"
          >
            {recipients.map(r => (
              <option key={r.id} value={r.id}>{r.email}</option>
            ))}
          </select>
        </div>
      )}

      {domains.length === 0 && loaded && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
          No verified domains found. Add and verify a domain at shieldme.cc first.
        </p>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

      <button
        type="submit"
        disabled={loading || domains.length === 0 || recipients.length === 0}
        className="w-full py-2 px-4 bg-shield-600 hover:bg-shield-700 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
      >
        {loading ? 'Creating…' : 'Create & copy'}
      </button>
    </form>
  );
}
