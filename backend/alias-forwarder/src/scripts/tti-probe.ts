import 'dotenv/config';
import net from 'node:net';
import crypto from 'node:crypto';

const aliasAddress = process.env.TTI_SYNTHETIC_ALIAS ?? 'tti-monitor@shieldme.cc';
const syntheticInbox = process.env.TTI_SYNTHETIC_INBOX ?? 'xboss182+shieldme-tti@gmail.com';
const provider = process.env.TTI_PROVIDER_LABEL ?? process.env.OUTBOUND_PROVIDER ?? 'resend';
const apiBase = process.env.TTI_API_BASE ?? `http://127.0.0.1:${process.env.PORT ?? '4005'}/api/admin/tti`;
const smtpHost = process.env.TTI_SMTP_HOST ?? '127.0.0.1';
const smtpPort = Number(process.env.TTI_SMTP_PORT ?? process.env.SMTP_PORT ?? '2525');
const timeoutMs = Number(process.env.TTI_TIMEOUT_MS ?? '120000');
const pollIntervalMs = Number(process.env.TTI_POLL_INTERVAL_MS ?? '5000');
const adminSecret = process.env.ADMIN_SECRET;

if (!adminSecret) throw new Error('ADMIN_SECRET is required for TTI probe API calls');

type TtiCheck = {
  id: string;
  aliasAddress: string;
  provider: string | null;
  status: 'pending' | 'forwarded' | 'failed' | 'expired';
  sentAt: string;
  receivedAt: string | null;
  latencyMs: number | null;
  failureReason: string | null;
  createdAt: string;
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      authorization: ['Bearer', adminSecret].join(' '),
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`TTI API ${res.status}: ${text}`);
  return json as T;
}

function waitForLine(socket: net.Socket, expected: RegExp): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`SMTP timeout waiting for ${expected}`)), 15000);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      if (expected.test(last)) {
        clearTimeout(timer);
        socket.off('data', onData);
        resolve(buffer);
      }
    };
    socket.on('data', onData);
    socket.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function sendSyntheticMail(probeToken: string) {
  const socket = net.createConnection({ host: smtpHost, port: smtpPort });
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  await waitForLine(socket, /^220/);
  const command = async (line: string, expected: RegExp) => { socket.write(`${line}\r\n`); await waitForLine(socket, expected); };
  await command('EHLO shieldme-tti-monitor.local', /^250[ -]/);
  await command('MAIL FROM:<tti-monitor@monitor.shieldme.cc>', /^250/);
  await command(`RCPT TO:<${aliasAddress}>`, /^250/);
  socket.write('DATA\r\n');
  await waitForLine(socket, /^354/);
  const now = new Date().toUTCString();
  const messageId = `<tti-${probeToken}@shieldme.cc>`;
  const body = [
    'From: ShieldMe TTI Monitor <tti-monitor@monitor.shieldme.cc>',
    `To: ${aliasAddress}`,
    `Subject: [shieldme-tti:${probeToken}] ShieldMe synthetic TTI probe`,
    `Message-ID: ${messageId}`,
    `Date: ${now}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Synthetic ops-only forwarding latency probe. No user content.',
    '.',
  ].join('\r\n');
  socket.write(`${body}\r\n`);
  await waitForLine(socket, /^250/);
  socket.write('QUIT\r\n');
  socket.end();
}

async function main() {
  const probeToken = `tti_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  await api('/probes', { method: 'POST', body: JSON.stringify({ probeToken, aliasAddress, syntheticInbox, provider }) });
  await sendSyntheticMail(probeToken);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await api<{ checks: TtiCheck[] }>(`?limit=50`);
    const check = response.checks.find((candidate) => candidate.aliasAddress === aliasAddress && new Date(candidate.createdAt).getTime() > Date.now() - timeoutMs - 60000);
    if (check?.status === 'forwarded') { console.log(JSON.stringify({ ok: true, probeToken, check })); return; }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  await api(`/probes/${probeToken}/fail`, { method: 'POST', body: JSON.stringify({ reason: `TTI probe timeout after ${timeoutMs}ms` }) });
  const response = await api<{ checks: TtiCheck[] }>('?limit=1');
  console.log(JSON.stringify({ ok: false, probeToken, check: response.checks[0] }));
  process.exitCode = 1;
}

main().catch((err) => { console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })); process.exitCode = 1; });
