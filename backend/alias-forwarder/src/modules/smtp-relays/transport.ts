import net from 'node:net';
import tls from 'node:tls';
import nodemailer from 'nodemailer';
import type { ForwardPayload } from '../inbound/resend.service.js';
import { resolvePublicRelayHost } from './ssrf.js';

export type RelayTransportConfig = {
  host: string;
  port: 465 | 587;
  tlsMode: 'implicit_tls' | 'starttls';
  authMethod: 'plain' | 'login';
  username: string;
  password: string;
  dkim: { domainName: string; keySelector: string; privateKey: string };
};

function openPinnedSocket(address: string, config: RelayTransportConfig, callback: (error: Error | null, socket?: { connection: net.Socket; secured?: boolean }) => void) {
  const timeout = config.tlsMode === 'implicit_tls' ? 10_000 : 5_000;
  const socket = config.tlsMode === 'implicit_tls'
    ? tls.connect({ host: address, port: config.port, servername: config.host, rejectUnauthorized: true, minVersion: 'TLSv1.2' })
    : net.connect({ host: address, port: config.port });
  let settled = false;
  const finish = (error: Error | null, value?: { connection: net.Socket; secured?: boolean }) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    callback(error, value);
  };
  const timer = setTimeout(() => {
    socket.destroy(new Error(config.tlsMode === 'implicit_tls' ? 'smtp_tls_timeout' : 'smtp_connect_timeout'));
  }, timeout);
  socket.once('error', (error) => finish(error));
  socket.once(config.tlsMode === 'implicit_tls' ? 'secureConnect' : 'connect', () => {
    finish(null, { connection: socket, secured: config.tlsMode === 'implicit_tls' });
  });
}

async function withTotalTimeout<T>(operation: Promise<T>, timeoutMs = 60_000): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('smtp_total_timeout')), timeoutMs)),
  ]);
}

async function createPinnedTransport(config: RelayTransportConfig) {
  const { addresses } = await resolvePublicRelayHost(config.host);
  const address = addresses[0]!;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.tlsMode === 'implicit_tls',
    requireTLS: config.tlsMode === 'starttls',
    authMethod: config.authMethod.toUpperCase(),
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 5_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    proxy: false,
    tls: { servername: config.host, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    dkim: config.dkim,
    getSocket: (_options: unknown, callback: (error: Error | null, socket?: { connection: net.Socket; secured?: boolean }) => void) => openPinnedSocket(address, config, callback),
  });
}

export async function verifySmtpRelay(config: RelayTransportConfig) {
  const transport = await createPinnedTransport(config);
  await withTotalTimeout(transport.verify());
}

export async function sendSmtpRelayMessage(config: RelayTransportConfig, payload: ForwardPayload & { envelopeFrom: string }) {
  const transport = await createPinnedTransport(config);
  const result = await withTotalTimeout<{ messageId?: string }>(transport.sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    replyTo: payload.replyTo,
    text: payload.textBody,
    html: payload.htmlBody,
    headers: payload.headers,
    envelope: { from: payload.envelopeFrom, to: [payload.to] },
  }));
  return String(result.messageId ?? 'smtp_submitted');
}
